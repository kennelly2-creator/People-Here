/* app.js — views + hash routing for People Here. */
(function () {
  'use strict';

  var view = document.getElementById('view');
  var toastEl = document.getElementById('toast');
  var confirmEl = document.getElementById('confirm');
  var toastTimer = null;
  var lastFix = null; // most recent geolocation reading this session

  /* ---------------- tiny DOM helper ---------------- */

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : children ? [children] : []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function render(nodes) {
    view.textContent = '';
    (Array.isArray(nodes) ? nodes : [nodes]).forEach(function (n) { if (n) view.appendChild(n); });
    window.scrollTo(0, 0);
  }

  function toast(msg, tone) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.style.background = tone === 'error' ? 'var(--color-accent-2-800)' : 'var(--color-neutral-900)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4200);
  }

  function askConfirm(title, body, label) {
    return new Promise(function (resolve) {
      var opener = document.activeElement;
      confirmEl.querySelector('#confirm-title').textContent = title;
      confirmEl.querySelector('#confirm-body').textContent = body;
      var yes = confirmEl.querySelector('[data-confirm="yes"]');
      var no = confirmEl.querySelector('[data-confirm="no"]');
      yes.textContent = label || 'Delete';
      confirmEl.hidden = false;
      yes.focus();

      function close(answer) {
        confirmEl.hidden = true;
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
        document.removeEventListener('keydown', onKey);
        if (opener && opener.focus) opener.focus();
        resolve(answer);
      }
      function onYes() { close(true); }
      function onNo() { close(false); }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Tab') {
          e.preventDefault();
          (document.activeElement === yes ? no : yes).focus();
        }
      }
      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
      document.addEventListener('keydown', onKey);
    });
  }

  function fail(err) {
    console.error(err);
    toast(err && err.message ? err.message : 'Something went wrong.', 'error');
  }

  function go(hash) { window.location.hash = hash; }

  /* ---------------- formatting ---------------- */

  function peopleWord(n) { return n === 1 ? '1 person' : n + ' people'; }

  function prettyDate(iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* ---------------- home ---------------- */

  function viewHome() {
    return Promise.all([window.DB.Places.list(), window.DB.People.countsByPlace()])
      .then(function (r) {
        var places = r[0], byPlace = r[1];

        var hero = h('button', {
          class: 'btn btn-primary btn-block btn-hero',
          type: 'button',
          onclick: function () { go('#/where'); }
        }, 'Where am I?');

        var nodes = [h('h1', { text: 'Who do I know here?' }), hero];

        if (!places.length) {
          nodes.push(h('p', { class: 'lede', style: 'margin-top:var(--space-6)' },
            'Nothing saved yet. Add a place you visit often, then add the people you meet there.'));
        } else {
          nodes.push(h('ul', { class: 'places' }, places.map(function (p) {
            var people = byPlace[p.id] || [];
            var names = people.slice(0, 4).map(function (x) { return x.name; }).join(' · ');
            return h('li', null, h('a', { class: 'place-link', href: '#/place/' + p.id }, [
              h('p', { class: 'place-name', text: p.name }),
              people.length ? h('p', { class: 'place-people', text: names + (people.length > 4 ? ' …' : '') }) : null,
              h('p', { class: 'place-count', text: people.length ? peopleWord(people.length) : 'No one saved yet' })
            ]));
          })));
        }

        nodes.push(h('div', { class: 'actions' }, [
          h('a', { class: 'btn btn-secondary btn-block', href: '#/add-place' }, '+ Add place')
        ]));

        nodes.push(h('p', { class: 'footnote' },
          'Everything you save stays in this browser on this device. Clearing Safari website data will delete it.'));

        render(nodes);
      })
      .catch(function (err) {
        render([
          h('h1', { text: 'Storage unavailable' }),
          h('p', { class: 'lede', text: err.message })
        ]);
      });
  }

  /* ---------------- where am I ---------------- */

  function viewWhere() {
    render([
      h('a', { class: 'back', href: '#/' }, '← Home'),
      h('h1', { text: 'Looking around…' }),
      h('p', { class: 'lede', text: 'Getting your location.' })
    ]);

    return Promise.all([window.Loc.getCurrentPosition(), window.DB.Places.list()])
      .then(function (r) {
        var fix = r[0], places = r[1];
        lastFix = fix;

        if (!places.length) {
          render([
            h('a', { class: 'back', href: '#/' }, '← Home'),
            h('h1', { text: 'No places saved' }),
            h('p', { class: 'lede' }, 'Save where you are now, then add the people you meet here.'),
            h('div', { class: 'actions' }, [
              h('a', {
                class: 'btn btn-primary btn-block',
                href: '#/add-place?lat=' + fix.latitude + '&lon=' + fix.longitude
              }, 'Save this location as a place')
            ])
          ]);
          return;
        }

        var ranked = window.Distance.rankPlaces(places, fix.latitude, fix.longitude);
        var here = ranked[0] && ranked[0].inside ? ranked[0] : null;

        if (here) {
          return window.DB.People.listByPlace(here.place.id).then(function (people) {
            render([
              h('a', { class: 'back', href: '#/' }, '← Home'),
              h('p', { class: 'here', text: "You're at" }),
              h('h1', { text: here.place.name }),
              h('p', { class: 'meta', text: 'About ' + window.Distance.formatDistance(here.meters) + ' away' }),
              people.length
                ? h('ul', { class: 'people' }, people.map(personItem))
                : h('p', { class: 'lede', style: 'margin-top:var(--space-6)', text: 'No one saved here yet.' }),
              h('div', { class: 'actions' }, [
                h('a', { class: 'btn btn-secondary btn-block', href: '#/place/' + here.place.id + '/add-person' }, '+ Add person'),
                h('a', { class: 'btn btn-ghost btn-block', href: '#/place/' + here.place.id }, 'Open ' + here.place.name)
              ])
            ]);
          });
        }

        render([
          h('a', { class: 'back', href: '#/' }, '← Home'),
          h('h1', { text: 'Nothing saved here' }),
          h('p', { class: 'lede', text: 'No saved place matches your current location.' }),
          h('p', { class: 'kicker', style: 'margin-top:var(--space-6)', text: 'Closest saved places' }),
          h('ul', { class: 'places' }, ranked.slice(0, 5).map(function (item) {
            return h('li', null, h('a', { class: 'place-link', href: '#/place/' + item.place.id }, [
              h('p', { class: 'place-name', text: item.place.name }),
              h('p', { class: 'place-count' }, h('span', { class: 'dist', text: window.Distance.formatDistance(item.meters) + ' away' }))
            ]));
          })),
          h('div', { class: 'actions' }, [
            h('a', {
              class: 'btn btn-primary btn-block',
              href: '#/add-place?lat=' + fix.latitude + '&lon=' + fix.longitude
            }, 'Save this location as a new place')
          ])
        ]);
      })
      .catch(function (err) {
        render([
          h('a', { class: 'back', href: '#/' }, '← Home'),
          h('h1', { text: 'Location unavailable' }),
          h('p', { class: 'notice', text: err.message }),
          h('div', { class: 'actions' }, [
            h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: function () { viewWhere(); } }, 'Try again'),
            h('a', { class: 'btn btn-ghost btn-block', href: '#/' }, 'Back to home')
          ])
        ]);
      });
  }

  /* ---------------- place detail ---------------- */

  function personItem(person) {
    return h('li', null, [
      h('p', { class: 'person-name', text: person.name }),
      person.pronunciation ? h('p', { class: 'person-say', text: 'say ' + person.pronunciation }) : null,
      person.role ? h('p', { class: 'person-role', text: person.role }) : null,
      person.note ? h('p', { class: 'person-note', text: person.note }) : null,
      person.lastSeenAt ? h('p', { class: 'person-seen', text: 'Last seen ' + prettyDate(person.lastSeenAt) }) : null,
      h('a', { class: 'person-edit', href: '#/person/' + person.id + '/edit' }, 'Edit')
    ]);
  }

  function viewPlace(placeId) {
    return Promise.all([window.DB.Places.get(placeId), window.DB.People.listByPlace(placeId)])
      .then(function (r) {
        var place = r[0], people = r[1];
        if (!place) return viewMissing();
        render([
          h('a', { class: 'back', href: '#/' }, '← Home'),
          h('h1', { text: place.name }),
          h('p', { class: 'meta', text: people.length ? peopleWord(people.length) : 'No one saved yet' }),
          people.length
            ? h('ul', { class: 'people' }, people.map(personItem))
            : h('p', { class: 'lede', style: 'margin-top:var(--space-6)', text: 'Add the first person you meet here.' }),
          h('div', { class: 'actions' }, [
            h('a', { class: 'btn btn-primary btn-block', href: '#/place/' + place.id + '/add-person' }, '+ Add person'),
            h('a', { class: 'btn btn-ghost btn-block', href: '#/place/' + place.id + '/edit' }, 'Edit place')
          ])
        ]);
      })
      .catch(fail);
  }

  function viewMissing() {
    render([
      h('a', { class: 'back', href: '#/' }, '← Home'),
      h('h1', { text: 'Not found' }),
      h('p', { class: 'lede', text: 'That item is no longer saved.' })
    ]);
  }

  /* ---------------- place form ---------------- */

  function field(label, inputAttrs, hint) {
    var input = h('input', Object.assign({ class: 'input' }, inputAttrs));
    return {
      input: input,
      node: h('div', { class: 'field' }, [
        h('label', { for: inputAttrs.id, text: label }),
        input,
        hint ? h('span', { class: 'hint', text: hint }) : null
      ])
    };
  }

  function viewPlaceForm(place, prefill) {
    var editing = !!place;
    var name = field('Place name', { id: 'f-name', type: 'text', autocomplete: 'off', value: editing ? place.name : '', placeholder: 'Bluebird Coffee' });
    var lat = field('Latitude', { id: 'f-lat', type: 'text', inputmode: 'decimal', class: 'input coords', value: editing ? place.latitude : (prefill.lat || '') });
    var lon = field('Longitude', { id: 'f-lon', type: 'text', inputmode: 'decimal', class: 'input coords', value: editing ? place.longitude : (prefill.lon || '') });
    var radius = field('Recognition radius (metres)', { id: 'f-radius', type: 'number', min: '10', step: '10', inputmode: 'numeric', value: editing ? place.radiusMeters : 150 },
      'How close counts as being here.');

    var status = h('p', { class: 'captured', text: (!editing && prefill.lat) ? 'Location captured from your current position.' : '' });

    var locateBtn = h('button', { class: 'btn btn-secondary btn-block', type: 'button' }, 'Use my current location');
    locateBtn.addEventListener('click', function () {
      locateBtn.disabled = true;
      locateBtn.textContent = 'Getting location…';
      window.Loc.getCurrentPosition().then(function (fix) {
        lastFix = fix;
        lat.input.value = fix.latitude.toFixed(6);
        lon.input.value = fix.longitude.toFixed(6);
        status.dataset.state = 'ok';
        status.textContent = 'Location captured — accurate to about ' + Math.round(fix.accuracy) + ' m.';
      }).catch(function (err) {
        status.dataset.state = 'error';
        status.textContent = err.message;
      }).then(function () {
        locateBtn.disabled = false;
        locateBtn.textContent = 'Use my current location';
      });
    });

    var form = h('form', { class: 'form', novalidate: true }, [
      name.node, locateBtn, status,
      h('div', { class: 'row' }, [lat.node, lon.node]),
      radius.node,
      h('div', { class: 'actions' }, [
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Save place'),
        h('a', { class: 'btn btn-ghost btn-block', href: editing ? '#/place/' + place.id : '#/' }, 'Cancel')
      ])
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        name: name.input.value,
        latitude: parseFloat(lat.input.value),
        longitude: parseFloat(lon.input.value),
        radiusMeters: parseFloat(radius.input.value)
      };
      var task = editing ? window.DB.Places.update(place.id, data) : window.DB.Places.create(data);
      task.then(function (saved) {
        toast(editing ? 'Place updated.' : 'Place saved.');
        go('#/place/' + saved.id);
      }).catch(fail);
    });

    var nodes = [
      h('a', { class: 'back', href: editing ? '#/place/' + place.id : '#/' }, '← Back'),
      h('h1', { text: editing ? 'Edit place' : 'Add place' }),
      form
    ];

    if (editing) {
      var del = h('button', { class: 'btn btn-danger btn-block', type: 'button' }, 'Delete this place');
      del.addEventListener('click', function () {
        window.DB.People.listByPlace(place.id).then(function (people) {
          return askConfirm(
            'Delete ' + place.name + '?',
            people.length
              ? 'This also deletes the ' + peopleWord(people.length) + ' saved here. It cannot be undone.'
              : 'This cannot be undone.',
            'Delete place'
          ).then(function (ok) {
            if (!ok) { toast('Nothing was deleted.'); return; }
            return window.DB.Places.remove(place.id).then(function () {
              toast('Place deleted.');
              go('#/');
            });
          });
        }).catch(fail);
      });
      nodes.push(h('div', { class: 'actions' }, del));
    }

    render(nodes);
  }

  /* ---------------- person form ---------------- */

  function viewPersonForm(place, person) {
    var editing = !!person;
    var name = field('Name', { id: 'p-name', type: 'text', autocomplete: 'off', value: editing ? person.name : '', placeholder: 'Maya' });
    var role = field('Role', { id: 'p-role', type: 'text', autocomplete: 'off', value: editing ? person.role : '', placeholder: 'Barista' });
    var note = field('Memory note', { id: 'p-note', type: 'text', autocomplete: 'off', value: editing ? person.note : '', placeholder: 'Starting nursing school' });
    var say = field('Pronunciation', { id: 'p-say', type: 'text', autocomplete: 'off', value: editing ? person.pronunciation : '', placeholder: 'MY-ah' });
    var seen = field('Last seen', { id: 'p-seen', type: 'date', value: editing ? (person.lastSeenAt || '').slice(0, 10) : '' });

    var backHref = '#/place/' + place.id;

    var form = h('form', { class: 'form', novalidate: true }, [
      name.node, role.node, note.node, say.node, seen.node,
      h('div', { class: 'actions' }, [
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Save person'),
        h('a', { class: 'btn btn-ghost btn-block', href: backHref }, 'Cancel')
      ])
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        placeId: place.id,
        name: name.input.value,
        role: role.input.value,
        note: note.input.value,
        pronunciation: say.input.value,
        lastSeenAt: seen.input.value
      };
      var task;
      try {
        task = editing ? window.DB.People.update(person.id, data) : window.DB.People.create(data);
      } catch (err) { fail(err); return; }
      task.then(function () {
        toast(editing ? 'Saved.' : 'Person added.');
        go(backHref);
      }).catch(fail);
    });

    var nodes = [
      h('a', { class: 'back', href: backHref }, '← ' + place.name),
      h('h1', { text: editing ? 'Edit person' : 'Add person' }),
      form
    ];

    if (editing) {
      var del = h('button', { class: 'btn btn-danger btn-block', type: 'button' }, 'Delete ' + person.name);
      del.addEventListener('click', function () {
        askConfirm('Delete ' + person.name + '?', 'This cannot be undone.', 'Delete person').then(function (ok) {
          if (!ok) { toast('Nothing was deleted.'); return; }
          return window.DB.People.remove(person.id).then(function () {
            toast('Person deleted.');
            go(backHref);
          });
        }).catch(fail);
      });
      nodes.push(h('div', { class: 'actions' }, del));
    }

    render(nodes);
  }

  /* ---------------- routing ---------------- */

  function parseQuery(str) {
    var out = {};
    (str || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }

  function route() {
    var raw = window.location.hash.replace(/^#/, '') || '/';
    var qIndex = raw.indexOf('?');
    var query = parseQuery(qIndex >= 0 ? raw.slice(qIndex + 1) : '');
    var path = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).split('/').filter(Boolean);

    if (!path.length) return viewHome();
    if (path[0] === 'where') return viewWhere();
    if (path[0] === 'add-place') return viewPlaceForm(null, { lat: query.lat, lon: query.lon });

    if (path[0] === 'place' && path[1]) {
      var id = path[1];
      if (path[2] === 'edit') {
        return window.DB.Places.get(id).then(function (p) {
          return p ? viewPlaceForm(p, {}) : viewMissing();
        }).catch(fail);
      }
      if (path[2] === 'add-person') {
        return window.DB.Places.get(id).then(function (p) {
          return p ? viewPersonForm(p, null) : viewMissing();
        }).catch(fail);
      }
      return viewPlace(id);
    }

    if (path[0] === 'person' && path[1] && path[2] === 'edit') {
      return window.DB.People.get(path[1]).then(function (person) {
        if (!person) return viewMissing();
        return window.DB.Places.get(person.placeId).then(function (place) {
          return place ? viewPersonForm(place, person) : viewMissing();
        });
      }).catch(fail);
    }

    return viewHome();
  }

  window.addEventListener('hashchange', route);
  route();

  /* Application shell caching only — no personal data leaves the device. */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () { /* offline shell is optional */ });
    });
  }
})();
