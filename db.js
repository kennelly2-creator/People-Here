/* db.js — IndexedDB data-access layer for People Here.
   Everything stays on this device. Nothing is sent anywhere. */
(function (global) {
  'use strict';

  var DB_NAME = 'people-here';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('This browser has no local database (IndexedDB), so People Here cannot save anything.'));
        return;
      }
      var req;
      try {
        req = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(new Error('Local storage is unavailable. Private browsing can block it.'));
        return;
      }
      req.onupgradeneeded = function (event) {
        var db = req.result;
        // v1: places + people. Future versions extend here by oldVersion.
        if (event.oldVersion < 1) {
          db.createObjectStore('places', { keyPath: 'id' });
          var people = db.createObjectStore('people', { keyPath: 'id' });
          people.createIndex('placeId', 'placeId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Could not open local storage.')); };
      req.onblocked = function () { reject(new Error('Local storage is busy in another tab. Close other People Here tabs and reload.')); };
    });
    return dbPromise;
  }

  function tx(stores, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode);
        var out;
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error || new Error('Could not save. Please try again.')); };
        t.onabort = function () { reject(t.error || new Error('The write was cancelled.')); };
        try {
          out = work(t);
        } catch (err) {
          try { t.abort(); } catch (e) {}
          reject(err);
        }
      });
    });
  }

  function req(request, onResult) {
    request.onsuccess = function () { onResult(request.result); };
  }

  function all(store) {
    return new Promise(function (resolve, reject) {
      var r = store.getAll();
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function id() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function now() { return new Date().toISOString(); }

  function trim(v) { return typeof v === 'string' ? v.trim() : ''; }

  /* ---------------- places ---------------- */

  var Places = {
    list: function () {
      return tx(['places'], 'readonly', function (t) {
        return all(t.objectStore('places'));
      }).then(function (rows) {
        return (rows || []).sort(function (a, b) { return a.name.localeCompare(b.name); });
      });
    },

    get: function (placeId) {
      return tx(['places'], 'readonly', function (t) {
        var out = null;
        req(t.objectStore('places').get(placeId), function (r) { out = r || null; });
        return new Promise(function (resolve) {
          t.addEventListener('complete', function () { resolve(out); });
        });
      }).then(function (p) { return p; });
    },

    create: function (data) {
      var record = {
        id: id(),
        name: trim(data.name),
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        radiusMeters: Number(data.radiusMeters) || 150,
        createdAt: now(),
        updatedAt: now()
      };
      validatePlace(record);
      return tx(['places'], 'readwrite', function (t) {
        t.objectStore('places').add(record);
        return record;
      });
    },

    update: function (placeId, patch) {
      return Places.get(placeId).then(function (existing) {
        if (!existing) throw new Error('That place no longer exists.');
        var record = Object.assign({}, existing, {
          name: patch.name !== undefined ? trim(patch.name) : existing.name,
          latitude: patch.latitude !== undefined ? Number(patch.latitude) : existing.latitude,
          longitude: patch.longitude !== undefined ? Number(patch.longitude) : existing.longitude,
          radiusMeters: patch.radiusMeters !== undefined ? Number(patch.radiusMeters) || 150 : existing.radiusMeters,
          updatedAt: now()
        });
        validatePlace(record);
        return tx(['places'], 'readwrite', function (t) {
          t.objectStore('places').put(record);
          return record;
        });
      });
    },

    /* Removes the place and every person saved under it. */
    remove: function (placeId) {
      return tx(['places', 'people'], 'readwrite', function (t) {
        t.objectStore('places').delete(placeId);
        var index = t.objectStore('people').index('placeId');
        var cursorReq = index.openCursor(IDBKeyRange.only(placeId));
        cursorReq.onsuccess = function () {
          var cursor = cursorReq.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
        return true;
      });
    }
  };

  function validatePlace(record) {
    if (!record.name) throw new Error('Please give the place a name.');
    if (!global.Distance.isValidLat(record.latitude)) throw new Error('Latitude must be a number between -90 and 90.');
    if (!global.Distance.isValidLon(record.longitude)) throw new Error('Longitude must be a number between -180 and 180.');
    if (!(record.radiusMeters > 0)) throw new Error('Radius must be greater than zero.');
  }

  /* ---------------- people ---------------- */

  function byAdded(a, b) {
    return a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
  }

  var People = {
    listByPlace: function (placeId) {
      return tx(['people'], 'readonly', function (t) {
        var out = [];
        var r = t.objectStore('people').index('placeId').getAll(IDBKeyRange.only(placeId));
        r.onsuccess = function () { out = r.result || []; };
        return new Promise(function (resolve) {
          t.addEventListener('complete', function () { resolve(out); });
        });
      }).then(function (rows) {
        return (rows || []).sort(byAdded);
      });
    },

    countsByPlace: function () {
      return tx(['people'], 'readonly', function (t) {
        return all(t.objectStore('people'));
      }).then(function (rows) {
        var map = {};
        (rows || []).forEach(function (p) {
          (map[p.placeId] = map[p.placeId] || []).push(p);
        });
        Object.keys(map).forEach(function (k) { map[k].sort(byAdded); });
        return map;
      });
    },

    get: function (personId) {
      return tx(['people'], 'readonly', function (t) {
        var out = null;
        req(t.objectStore('people').get(personId), function (r) { out = r || null; });
        return new Promise(function (resolve) {
          t.addEventListener('complete', function () { resolve(out); });
        });
      });
    },

    create: function (data) {
      var record = {
        id: id(),
        placeId: data.placeId,
        name: trim(data.name),
        role: trim(data.role),
        note: trim(data.note),
        pronunciation: trim(data.pronunciation),
        lastSeenAt: trim(data.lastSeenAt),
        createdAt: now(),
        updatedAt: now()
      };
      if (!record.name) throw new Error('Please enter a name.');
      if (!record.placeId) throw new Error('That person needs a place.');
      return tx(['people'], 'readwrite', function (t) {
        t.objectStore('people').add(record);
        return record;
      });
    },

    update: function (personId, patch) {
      return People.get(personId).then(function (existing) {
        if (!existing) throw new Error('That person no longer exists.');
        var record = Object.assign({}, existing, {
          name: trim(patch.name !== undefined ? patch.name : existing.name),
          role: trim(patch.role !== undefined ? patch.role : existing.role),
          note: trim(patch.note !== undefined ? patch.note : existing.note),
          pronunciation: trim(patch.pronunciation !== undefined ? patch.pronunciation : existing.pronunciation),
          lastSeenAt: trim(patch.lastSeenAt !== undefined ? patch.lastSeenAt : existing.lastSeenAt),
          updatedAt: now()
        });
        if (!record.name) throw new Error('Please enter a name.');
        return tx(['people'], 'readwrite', function (t) {
          t.objectStore('people').put(record);
          return record;
        });
      });
    },

    remove: function (personId) {
      return tx(['people'], 'readwrite', function (t) {
        t.objectStore('people').delete(personId);
        return true;
      });
    }
  };

  /* Export/import hooks — the shape a future Backup feature would use. */
  function exportAll() {
    return Promise.all([Places.list(), People.countsByPlace()]).then(function (r) {
      var people = [];
      Object.keys(r[1]).forEach(function (k) { people = people.concat(r[1][k]); });
      return { version: DB_VERSION, exportedAt: now(), places: r[0], people: people };
    });
  }

  global.DB = { open: open, Places: Places, People: People, exportAll: exportAll };
})(window);
