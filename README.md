# Discoverr for Sonarr

**Discoverr for Sonarr** is a lightweight userscript that seamlessly integrates a custom **Discover** menu item directly into your Sonarr UI. It fetches trending and newly airing shows from TheTVDB ("On Today") and embeds them smoothly into Sonarr's native interface, allowing you to quickly browse and add new series with a single click.

---

## Features

- **Seamless UI Integration**: Injects a native-looking "Discover" link directly inside Sonarr's sidebar under the **Series** menu category.
- **Dynamic CSS Matching**: Dynamically detects and matches Sonarr's compiled CSS-module classes at runtime to ensure active item highlights look native across different updates.
- **TheTVDB Integration**: Fetches today's TV shows from TheTVDB (`/on-today`) and renders them in a responsive card grid.
- **One-Click Add**: Resolves TVDB series IDs in the background and converts show cards into direct links to Sonarr's internal `Add New` search page (`/add/new?term=tvdb:<id>`).
- **Smart Caching**:
  - Caches grid HTML locally for 6 hours to minimize external network requests.
  - Caches resolved TVDB series IDs persistently using user script storage (`GM.setValue` / `GM.getValue`).
- **Non-Disruptive SPA Navigation**: Works cleanly with Sonarr's single-page application (SPA) routing without breaking React's internal state.

---

## Requirements

- **Browser**: Any modern browser supporting userscripts (Chrome, Firefox, Edge, Brave, etc.).
- **Userscript Manager**: [Tampermonkey](https://www.tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/), or [Greasemonkey](https://www.greasemonkey.nz/).
- **Sonarr**: Standard local web interface running on port `8989` (`http://localhost:8989/*` or `http://127.0.0.1:8989/*`).

---

## Installation

1. Install a userscript manager extension in your web browser (e.g., Tampermonkey).
2. Create a new script in your userscript manager.
3. Paste the contents of [`discoverr-for-sonarr.user.js`](./discoverr-for-sonarr.user.js) into the editor.
4. Save the script and enable it.
5. Open or refresh your Sonarr web dashboard.

> **Note**: If your Sonarr instance runs on a custom host, domain, or port, add your URL pattern to the script header `@match` rules:
> ```javascript
> // @match        http://your-custom-ip:port/*
> // @match        [https://sonarr.yourdomain.com/](https://sonarr.yourdomain.com/)*
> ```

---

## How It Works

1. **Sidebar Injection**: Listens to DOM mutations and injects a cloned sidebar navigation link labeled **Discover** when viewing the Series section.
2. **Route Handling**: Intercepts clicks on the **Discover** link to update the URL path to `/add/discover` without performing a hard page reload.
3. **Data Retrieval & Resolution**:
   - Queries `https://www.thetvdb.com/on-today` via `GM_xmlhttpRequest`.
   - Resolves individual numeric TVDB IDs asynchronously from show page metadata or slug formats.
   - Updates show cards with direct link targets formatted as `/add/new?term=tvdb:<id>`.
4. **Manual Refresh**: Includes a **Refresh** button at the top of the grid to force a fresh fetch from TheTVDB on demand.

---

## Permissions & Host Access

The script requests cross-origin permissions (`@connect`) for the following domains to fetch poster assets and show metadata:
- `www.thetvdb.com` / `thetvdb.com`
- `graphql.imdb.com` / `caching.graphql.imdb.com`
- `media-amazon.com` / `m.media-amazon.com` / `ssl-images-amazon.com`

---

## License

Distributed under the Creative Commons Attribution-ShareAlike 3.0 Unported License (CC BY-SA 3.0).
