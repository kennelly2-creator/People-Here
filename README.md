# People Here

A private, location-aware memory aid for the names of people you meet at places you visit often — baristas, trainers, front-desk staff.

Open it, tap **Where am I?**, and it shows the people you have saved at the place you are standing in.

It is a mobile-first static website. Add it to your iPhone Home Screen and it behaves like a small utility app.

---

## Privacy model

All of your data — place names, coordinates, people's names, roles, notes, pronunciations, last-seen dates — is stored **only in your browser on your device**, in IndexedDB.

- No account, no login, no server, no cloud database.
- No analytics, no advertising, no third-party APIs.
- No facial recognition or automatic identification of anyone. You type everything in yourself.
- Nothing personal is ever transmitted anywhere, and nothing personal is stored in this repository.

Your location is read only when you tap a button that asks for it, and it is used only to compare against the places you already saved.

**Data-loss warning:** because your data lives only in this browser, clearing Safari/site data — or deleting the Home Screen web app's website data — will delete your saved places and people. There is no backup yet.

---

## Technology

- HTML, CSS, vanilla JavaScript. No frameworks, no build step.
- IndexedDB for local storage (`js/db.js`).
- Browser Geolocation API (`js/location.js`).
- Haversine distance (`js/distance.js`), with a test page at `tests.html`.
- `manifest.webmanifest` + a minimal service worker (`sw.js`) that caches only the application shell.
- Hash-based single-page navigation, so reloading never produces a GitHub Pages 404.

```
index.html
tests.html
manifest.webmanifest
sw.js
css/styles.css
js/{app,db,distance,location}.js
icons/{icon-192,icon-512}.png
```

---

## Run it locally

Service workers and IndexedDB need a real origin, so open it over HTTP rather than `file://`:

```sh
cd app
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>. Geolocation works on `localhost` without HTTPS.

Open <http://localhost:8000/tests.html> to run the distance tests; every check should read ✓.

---

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch.**
3. Branch: `main`. Folder: `/` if these files are at the repository root, or `/docs` if you move them there. (If you keep them in an `app/` subfolder, either move them to the root or copy them into `docs/`; GitHub Pages can only publish the root or `docs/`.)
4. Wait for the deployment, then open `https://USERNAME.github.io/people-here/`.

Every path in the project is relative (`./css/styles.css`, `./js/app.js`, `./sw.js`, `./manifest.webmanifest`), and the service worker registers with `scope: './'`, so the app works under a project subpath without changes.

---

## Add it to your iPhone Home Screen

1. Open the published URL in **Safari** on the iPhone (not Chrome — only Safari can install it).
2. Tap the **Share** button.
3. Tap **Add to Home Screen**, then **Add**.
4. Launch it from the Home Screen icon. It opens full-screen with no browser chrome.

The first time you tap **Where am I?** or **Use my current location**, iOS asks for location permission. Allow it.

Note that the Home Screen web app and Safari can keep separate website data. Add places from the Home Screen app if that is where you plan to use it.

---

## Current MVP limitations

- Location is checked only when you tap a button. There is no background geofencing and no arrival notifications — by design.
- No backup, export, or sync. Data exists on one device, in one browser.
- No map view, no business search; you type place names yourself.
- No photos and no recognition of any kind.
- Places are matched by a simple radius (default 150 m), so two saved places within the same radius will resolve to the nearer one.

### Recommended next step

`DB.exportAll()` in `js/db.js` already returns the whole dataset as plain JSON. A small **Export backup / Import backup** screen built on it would remove the single biggest risk in the MVP (device data loss) without adding a server. It was left out of this build to keep the core loop small.

---

## Troubleshooting location

- **"Location permission is off."** iOS: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App. Also Settings → Safari → Location → Ask/Allow. Then reload.
- **Nothing happens on tap.** Geolocation requires a secure origin. Use the `https://` GitHub Pages URL or `localhost`.
- **"Your location is unavailable."** Common indoors or with Wi-Fi off. Step outside, or type the latitude and longitude by hand on the Add Place screen.
- **Took too long.** The first fix after launching can be slow; tap **Try again**.
- **Wrong place matched.** Open the place, tap **Edit place**, and lower the radius (or recapture the location while standing there).
- **Everything disappeared.** Website data was cleared, or you are in a different browser or in Private Browsing. Private Browsing cannot persist IndexedDB.
