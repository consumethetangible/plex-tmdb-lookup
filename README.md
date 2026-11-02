# Plex TMDB Lookup

A small personal tool for finding TMDB IDs and copying Plex-ready names, built for naming movies on a Plex server.

- Search movies, TV series, movie collections and people by name, or paste a TMDB ID.
- One click to copy the ID, or a Plex-style name like `The Matrix (1999) {tmdb-603}`.
- One click to open the title on themoviedb.org.
- Numeric searches show an **Exact ID match** first, then title matches, so `1917` and `300` still find the movies called that.
- Shorthand searches work too: `lotr`, `hp`, `sw`, `bttf`, and so on.

The page talks straight from your browser to TMDB. There's no proxy, no server of its own, no analytics.

## Two ways to run it

Both use the same page. The only difference is where your TMDB token comes from. Get yours from your TMDB account under Settings > API: use the **API Read Access Token** (the long one starting with `eyJ`). The shorter 32-character API Key works too.

### Hosted (GitHub Pages): paste your token once

This is how it runs as part of the P.A.I.N. Workbench. Open the page and it asks for your token. Paste it, press **Save & test**, and it's checked with TMDB and then kept in that browser's local storage. Use the **Token** button at the top to replace or remove it later.

- The token is **never in the repo**. It lives only in the browser you pasted it into, so each new browser or device needs it pasted once.
- A Content-Security-Policy in `index.html` means the page can only run its own scripts and can only talk to `api.themoviedb.org`.
- All the Pages sites under one GitHub account share a browser "origin", so they can see each other's local storage. That's fine while every site on the account is your own code; keep it in mind before putting anything third-party there.
- To publish: repo **Settings > Pages > Deploy from a branch > `main` / root**. The page lives at `https://<account>.github.io/plex-tmdb-lookup/`. Pages on a private repo needs a paid GitHub plan, so the repo is public. That's safe because no token is ever committed.

### Local: a token file

1. Copy `js/config.local.example.js` to `js/config.local.js` and paste your token into it.
2. Start a local server from the project folder and open the page:

   ```bash
   python3 -m http.server 8080 --bind 127.0.0.1
   # then open http://localhost:8080
   ```

   A server is needed because browsers won't load ES modules from `file://`. Python 3 ships with macOS. Run it from inside the project folder, since it serves whatever folder it was started in.

`js/config.local.js` is gitignored. **Never commit it, and never publish a copy of the site that contains it.** If both a saved token and the file exist, the saved token wins.

## Two-minute smoke test

1. Search `the matrix`. Click **Copy Plex name** on the 1999 film and paste somewhere. Expect `The Matrix (1999) {tmdb-603}`.
2. Search `603`. Expect an **Exact ID match** section with The Matrix at the top.
3. Search `1917`. Expect the ID match (if any) plus the 2019 film from the title search.
4. Search something with a colon in the title, like `mission impossible`. Expect the Plex name to turn `:` into ` - `.
5. Hosted mode: open **Token**, paste garbage, press **Save & test**. Expect a red message saying TMDB rejected it, and your good token still saved.

## About the Plex name

The format is `Title (Year) {tmdb-ID}`. Characters that are illegal in file names on Windows, macOS, Linux and SMB shares are cleaned up (`Mission: Impossible` becomes `Mission - Impossible`). Confirmed on a real Plex server: a movie folder named this way matched correctly on scan. TV shows use the same tag but haven't been tried yet.

## Chrome extension

The same lookup as a toolbar popup, in the `extension/` folder. It's for personal use, loaded unpacked (no Chrome Web Store).

**Install**
1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `extension` folder.
3. Click the extension's icon, then the gear (or right-click the icon > **Options**), paste your TMDB token and press **Save**. It checks the token with TMDB first and refuses one TMDB rejects.
4. Optional: pin it from the puzzle-piece menu. Alt+Shift+T opens it too; change that at `chrome://extensions/shortcuts`.

**Two-minute smoke test**
1. Before saving a token, open the popup. Expect a "One-time setup" notice and a disabled search box.
2. Save your token in settings. Expect "Token works and is saved."
3. Search `the matrix` in the popup. Click **Copy Plex name** and paste. Expect `The Matrix (1999) {tmdb-603}`.
4. Click **Open on TMDB**. Expect a new tab on themoviedb.org.
5. In settings, press **Clear saved token**, then reopen the popup. Expect the setup notice again.

**Privacy and permissions.** The token lives in `chrome.storage.local`, on this computer only; it's never synced to your Google account. The extension asks for two things: `storage` (to keep that token) and access to `api.themoviedb.org` (to search). No other sites, no background process, no tracking. A test fails if either of those ever grows.

**If you change the shared code.** The popup reuses `js/core/`, `js/ui/` and `css/styles.css` through copies in `extension/shared/` (Chrome only loads files from inside the extension folder). After editing any of those, run `npm run sync`, then press the reload arrow on the extension's card in `chrome://extensions`. `npm test` fails if the copies are stale.

## Tests

```bash
node --test
```

46 tests, all offline, with no token needed:

- Plex naming, result shaping, the TMDB client (both token styles, error handling) and the search logic, against a mocked TMDB.
- Page checks: saving, reading and clearing the token (including when the browser blocks storage), the page's Content-Security-Policy (TMDB only, no inline or remote scripts, no analytics), and the stylesheet rule that keeps hidden elements hidden.
- Extension checks: the shared copies are in sync, the manifest asks for only the permissions listed above, every file the pages and scripts reference exists, and nothing logs the token or syncs it to Google.

## Layout

```
index.html              the web page (includes the Content-Security-Policy)
css/styles.css          shared styles (page + extension)
css/page.css            page-only styles
js/app.js               page startup: finds your token, mounts the UI
js/page-token.js        saves/reads/clears the token in the browser
js/ui/search-ui.js      search, rendering and copy buttons (page + extension)
js/core/tmdb.js         TMDB client; takes the token as an argument
js/core/lookup.js       search and ID logic
js/core/results.js      shapes raw TMDB data for display
js/core/plex.js         Plex naming
js/config.local.js      optional: your token for local runs (you create this; gitignored)
extension/              the Chrome extension (manifest, popup, settings, icons)
extension/shared/       generated copies of the shared code (npm run sync)
scripts/sync-core.mjs   keeps extension/shared up to date
tests/                  offline tests
```

`js/core/` and `js/ui/` contain no page-specific or storage code, which is why the page and the extension can share them.

## Credits and license

Adapted in part from [tmdb-id-lookup](https://github.com/davecollections/tmdb-id-lookup) by Dave Collections, published under the MIT License. See [NOTICE.md](NOTICE.md).

This product uses the TMDB API but is not endorsed or certified by TMDB.
