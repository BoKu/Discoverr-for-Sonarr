// ==UserScript==
// @name         Discoverr for Sonarr
// @tag          utilities
// @match        *://localhost:8989/*
// @match        *://127.0.0.1:8989/*
// @namespace    https://greasyfork.org
// @version      2026.1
// @description  Safely inject custom navigation items into Sonarr's navigation sidebar.
// @author       BoKu
// @license      The Pirate Bay Cleaner is licensed under a Creative Commons Attribution-ShareAlike 3.0 Unported License.
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sonarr.tv
// @noframes
// @resource     bootstrapCss https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css#sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB
// @require      https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js#sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI
// @require      https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js#sha384-I7E8VVD/ismYTF4hNIPjVp/Zjvgyol6VFvRkX/vR+Vc4jQkC+hVqc2pM8ODewa9r
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.openInTab
// @grant        GM_xmlhttpRequest
// @connect      caching.graphql.imdb.com
// @connect      graphql.imdb.com
// @connect      www.imdb.com
// @connect      imdb.com
// @connect      media-amazon.com
// @connect      m.media-amazon.com
// @connect      ssl-images-amazon.com
// @connect      thetvdb.com
// @connect      www.thetvdb.com
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.clear();

    const DISCOVER_PATH = '/add/discover';
    const INJECTION_ID = 'discoverr-custom-injection';
    const CONTENT_ID = 'discoverr-content';

    // Sonarr's real (CSS-module hashed) active classes, learned at runtime.
    // Never invent fake ones like "...-discovered": they do not exist in
    // Sonarr's stylesheet, so they style nothing, and they poison every
    // [class*="PageSidebarItem-isActiveItem"] lookup (including our own node).
    let activeItemClass = null; // e.g. "PageSidebarItem-isActiveItem-gDKch"
    let activeLinkClass = null; // e.g. "PageSidebarItem-isActiveLink-_3fm9"

    const onDiscoverRoute = () => window.location.pathname === DISCOVER_PATH;

    function scrubActiveClasses(node) {
        const stale = Array.from(node.classList).filter((cls) =>
            cls.startsWith('PageSidebarItem-isActive')
        );
        if (stale.length) node.classList.remove(...stale);
    }

    /* ---------- learn Sonarr's real active classes ---------- */

    function learnFromStylesheets() {
        try {
            for (const sheet of document.styleSheets) {
                let rules;
                try {
                    rules = sheet.cssRules;
                } catch (e) {
                    continue; // cross-origin sheet, skip
                }
                if (!rules) continue;
                for (const rule of rules) {
                    const selector = rule.selectorText;
                    if (!selector) continue;
                    if (!activeItemClass) {
                        const match = selector.match(/PageSidebarItem-isActiveItem-[a-zA-Z0-9_-]+/);
                        if (match) activeItemClass = match[0];
                    }
                    if (!activeLinkClass) {
                        const match = selector.match(/PageSidebarItem-isActiveLink-[a-zA-Z0-9_-]+/);
                        if (match) activeLinkClass = match[0];
                    }
                }
            }
        } catch (e) {
            // Stylesheets not readable yet - the DOM observer covers us later.
        }
    }

    function learnFromDom() {
        const activeItem = document.querySelector(
            `div[class*="PageSidebarItem-isActiveItem"]:not(#${INJECTION_ID})`
        );
        if (activeItem) {
            const cls = Array.from(activeItem.classList).find((c) =>
                c.startsWith('PageSidebarItem-isActiveItem')
            );
            if (cls && !cls.endsWith('-discovered')) activeItemClass = cls;
        }

        for (const link of document.querySelectorAll('a[class*="PageSidebarItem-isActiveLink"]')) {
            if (link.closest(`#${INJECTION_ID}`)) continue; // never learn from ourselves
            const cls = Array.from(link.classList).find((c) =>
                c.startsWith('PageSidebarItem-isActiveLink')
            );
            if (cls && !cls.endsWith('-discovered')) {
                activeLinkClass = cls;
                break;
            }
        }
    }

    function learnActiveClasses() {
        if (!activeItemClass || !activeLinkClass) learnFromStylesheets();
        learnFromDom();
    }

    /* ---------- sidebar injection ---------- */

    // Discover is a Series submenu, not a permanently visible top-level item.
    function inSeriesSection() {
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        return path === '/' ||
            /^\/(?:add|series)(?:\/|$)/.test(path);
    }

    function getSeriesGroup() {
        const importItem = document
            .querySelector('a[href="/add/import"]')
            ?.closest('div[class*="PageSidebarItem-item"]');
        if (importItem?.parentElement) return importItem.parentElement;

        const seriesLink = document.querySelector('div[class*="PageSidebar"] a[href="/"]');
        return seriesLink?.closest('div[class*="PageSidebarItem-item"]') || null;
    }

    function buildInjection() {
        const group = getSeriesGroup();
        if (!group) return null;

        // Clone a real child item ("Add New" / "Library Import") so all
        // CSS-module classes stay exactly in sync with this Sonarr build.
        let templateItem = document
            .querySelector('a[href="/add/new"]')
            ?.closest('div[class*="PageSidebarItem-item"]');
        if (!templateItem || !group.contains(templateItem) || templateItem.id === INJECTION_ID) {
            templateItem = Array.from(group.children).find(
                (child) => child.tagName === 'DIV' && child.id !== INJECTION_ID
            );
        }
        if (!templateItem) return null;

        const injection = templateItem.cloneNode(true);
        injection.id = INJECTION_ID;
        // Drop any active styling the template happened to carry.
        scrubActiveClasses(injection);
        injection.querySelectorAll('*').forEach(scrubActiveClasses);

        const link = injection.querySelector('a');
        if (!link) return null;
        link.setAttribute('href', DISCOVER_PATH);
        link.addEventListener('click', onDiscoverClick);

        const label =
            link.querySelector('span[class*="PageSidebarItem-noIcon"]') ||
            link.querySelector('span');
        if (label) label.textContent = 'Discover';

        return injection;
    }

    function ensureInjected() {
        if (!inSeriesSection()) {
            document.getElementById(INJECTION_ID)?.remove();
            return;
        }
        const group = getSeriesGroup();
        if (!group) return; // sidebar not rendered yet - observer will retry

        let injection = document.getElementById(INJECTION_ID);
        if (injection && injection.parentElement === group) return; // already in place

        injection?.remove();
        const fresh = buildInjection();
        if (fresh) group.append(fresh);
    }

    /* ---------- highlight handling ---------- */

    function updateHighlight() {
        learnActiveClasses();

        const injection = document.getElementById(INJECTION_ID);
        if (!injection) return;
        const link = injection.querySelector('a');

        // isActiveItem gives top-level groups their blue marker. Child links
        // use only isActiveLink. Also clear a marker left by an older version.
        scrubActiveClasses(injection);

        if (onDiscoverRoute()) {
            // Sonarr's router never navigated (we pushed state ourselves), so
            // it still marks the previous menu item as active. Clear those
            // marks, then light up ours with the real classes we learned.
            document
                .querySelectorAll(
                    'div[class*="PageSidebarItem-isActiveItem"],' +
                    'a[class*="PageSidebarItem-isActiveLink"],' +
                    'a[class*="PageSidebarItem-isActiveParentLink"]'
                )
                .forEach((node) => {
                    if (node.closest(`#${INJECTION_ID}`)) return;
                    scrubActiveClasses(node);
                });

            if (activeLinkClass && link && !link.classList.contains(activeLinkClass)) {
                link.classList.add(activeLinkClass);
            }
            if (link && link.getAttribute('aria-current') !== 'page') {
                link.setAttribute('aria-current', 'page');
            }
        } else {
            // A real Sonarr route owns the sidebar again; drop our highlight
            // and let React's own active classes do their job.
            if (link) {
                scrubActiveClasses(link);
                if (link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
            }
        }
    }

    /* ---------- page content ---------- */

    const TVDB_URL = 'https://www.thetvdb.com/on-today';
    const TVDB_SELECTOR = '#app > div.container > div.container > div > div.col-xs-12.col-sm-8 > div';
    const CACHE_KEY = 'discoverr-tvdb-ontoday';
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
    let fetchInFlight = false;

    GM_addStyle(`
        /* Anchor our scroller to Sonarr's page-content box (the same pattern
           Sonarr's own Scroller components use). */
        div[class*="PageContent-content"] { position: relative; }
        #${CONTENT_ID} {
            position: absolute;
            inset: 0;
            padding: 20px;
            overflow-y: auto;
            color: var(--bs-body-color);
        }
        #${CONTENT_ID} .discoverr-header {
            display: flex; align-items: baseline; gap: 12px;
            margin-bottom: 16px; flex-wrap: wrap;
        }
        #${CONTENT_ID} .discoverr-updated { font-size: 12px; opacity: 0.6; }
        #${CONTENT_ID} .discoverr-refresh {
            background: none; border: none; padding: 0;
            color: var(--bs-primary, #5c9fd6); font-size: 12px;
            cursor: pointer; text-decoration: underline;
        }
        #${CONTENT_ID} .discoverr-grid-body {
            display: flex; flex-direction: row; flex-wrap: wrap;
        }
        #${CONTENT_ID} .discoverr-grid-body .filterableitem {
            flex: 0 0 auto; width: 180px; margin: 0 14px 14px 0;
        }
        #${CONTENT_ID} .discoverr-grid-body .thumbnail { padding: 0; }
        #${CONTENT_ID} .discoverr-grid-body h3 {
            font-size: 14px; margin: 8px 0 4px; font-weight: normal;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 180px;
        }
        /* TVDB cards wrap titles in links; keep them legible on Sonarr's
           dark theme instead of inheriting the browser link colour. */
        #${CONTENT_ID} .discoverr-grid-body a { color: inherit; text-decoration: none; }
        #${CONTENT_ID} .discoverr-grid-body a:hover h3 { text-decoration: underline; }
        #${CONTENT_ID} .discoverr-grid-body img { width: 100%; border-radius: 6px; }
    `);

    function ensureContent() {
        const pageContent = document.querySelector('div[class*="PageContent-content"]');
        if (!pageContent) return;

        let content = pageContent.querySelector(`:scope > #${CONTENT_ID}`);
        if (!content) {
            content = document.createElement('div');
            content.id = CONTENT_ID;

            const header = document.createElement('div');
            header.className = 'discoverr-header';
            header.innerHTML = `
                <h3 style="margin: 0;">Discover</h3>
                <span class="discoverr-updated"></span>
                <button type="button" class="discoverr-refresh">Refresh</button>`;
            header.querySelector('.discoverr-refresh').addEventListener('click', () => {
                loadGrid(content, true);
            });

            const gridBody = document.createElement('div');
            gridBody.className = 'discoverr-grid-body';

            content.append(header, gridBody);
            pageContent.append(content);
        }

        // Keep Sonarr's stale page hidden while we are on the custom route.
        // Hiding (instead of wiping innerHTML) keeps React's owned nodes
        // intact, so re-renders cannot crash or resurrect old content.
        for (const child of pageContent.children) {
            if (child !== content) {
                child.style.setProperty('display', 'none', 'important');
            }
        }

        // Only kick off a grid load when nothing is rendered yet.
        // ensureContent runs on every sync; re-rendering here would loop
        // endlessly (render -> mutation -> sync -> render -> ...), which
        // rebuilds the cards and their data-tvdb attributes over and over.
        const gridBody = content.querySelector('.discoverr-grid-body');
        if (gridBody && gridBody.childElementCount === 0) {
            loadGrid(content);
        }
    }

    function loadGrid(content, forceRefresh = false) {
        const gridBody = content.querySelector('.discoverr-grid-body');
        if (!gridBody) return;

        // Serve from cache when fresh enough.
        if (!forceRefresh) {
            GM.getValue(CACHE_KEY, null)
                .then((cached) => {
                    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
                        renderGrid(content, cached.html, cached.ts);
                    } else {
                        fetchGrid(content);
                    }
                })
                .catch(() => fetchGrid(content));
            return;
        }
        fetchGrid(content);
    }

    function fetchGrid(content) {
        if (fetchInFlight) return;
        fetchInFlight = true;

        const gridBody = content.querySelector('.discoverr-grid-body');
        if (gridBody && !gridBody.childElementCount) {
            gridBody.innerHTML = '<p>Loading today\'s shows from TheTVDB...</p>';
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: TVDB_URL,
            timeout: 15000,
            headers: { Accept: 'text/html' },
            onload: (response) => {
                fetchInFlight = false;
                if (response.status !== 200) {
                    showGridError(content, 'HTTP ' + response.status);
                    return;
                }
                const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                const grid = doc.querySelector(TVDB_SELECTOR);
                if (!grid) {
                    showGridError(content, 'could not find the shows grid on the page');
                    return;
                }
                const timestamp = Date.now();
                const payload = { ts: timestamp, html: grid.innerHTML };
                GM.setValue(CACHE_KEY, payload).catch(() => {});
                renderGrid(content, payload.html, timestamp);
            },
            onerror: () => {
                fetchInFlight = false;
                showGridError(content, 'network error');
            },
            ontimeout: () => {
                fetchInFlight = false;
                showGridError(content, 'request timed out');
            }
        });
    }

    function renderGrid(content, html, timestamp) {
        if (window.location.pathname !== DISCOVER_PATH) return; // user navigated away mid-fetch

        const gridBody = content.querySelector('.discoverr-grid-body');
        if (!gridBody) return;

        gridBody.innerHTML = html;

        // TheTVDB uses lazy-loaded images and root-relative links - fix both
        // so the grid works inside Sonarr.
        gridBody.querySelectorAll('img[data-src]').forEach((img) => {
            img.setAttribute('src', img.getAttribute('data-src'));
            img.removeAttribute('data-src');
        });
        gridBody.querySelectorAll('a[href^="/"]').forEach((link) => {
            // Fallback only: until a card's numeric id is resolved it points
            // at TheTVDB. applyCardId rewrites it to Sonarr's Add New search
            // (term=tvdb:<id>) as soon as the id is known.
            link.setAttribute('href', 'https://www.thetvdb.com' + link.getAttribute('href'));
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noreferrer');
        });

        lastGridTimestamp = timestamp;
        refreshIdCount();

        applyTvdbIds(gridBody);
    }

    /* ---------- TVDB series ids (data-tvdb) ---------- */

    // The On Today grid only carries series slugs. Numeric TVDB ids are
    // scraped once per slug from the series page ("/series/<id>/edit" markup)
    // and cached forever - slugs of the form "<id>-show" already contain the
    // id and need no fetch at all.
    const ID_CACHE_KEY = 'discoverr-tvdb-ids';
    const ID_FETCH_DELAY_MS = 200;
    let idCache = null;
    let idCacheDirty = false;
    let processingIdQueue = false;
    const queuedSlugs = new Set();
    const idQueue = [];

    function slugFromHref(href) {
        const match = /\/series\/([^/?#]+)/.exec(href || '');
        return match ? match[1] : null;
    }

    function ensureIdCache() {
        if (idCache) return Promise.resolve();
        return GM.getValue(ID_CACHE_KEY, {})
            .then((stored) => { idCache = stored || {}; })
            .catch(() => { idCache = {}; });
    }

    function persistIdCache() {
        if (!idCache || !idCacheDirty) return;
        GM.setValue(ID_CACHE_KEY, idCache)
            .then(() => { idCacheDirty = false; })
            .catch(() => {});
    }

    function setCardTvdbId(slug, id) {
        document.querySelectorAll('.discoverr-grid-body .filterableitem').forEach((card) => {
            const link = card.querySelector('a[href*="/series/"]');
            if (link && slugFromHref(link.getAttribute('href')) === slug) {
                applyCardId(card, id);
            }
        });
    }

    // Called as soon as a card's numeric id is known: stamps data-tvdb and
    // points the card's link at Sonarr's own Add New search for that id.
    function applyCardId(card, id) {
        card.setAttribute('data-tvdb', String(id));
        const title = card.querySelector('h3')?.textContent;
        if (title) card.setAttribute('title', title);
        const link = card.querySelector('a');
        if (link) {
            link.setAttribute('href', '/add/new?term=tvdb:' + id);
            link.removeAttribute('target');
            link.removeAttribute('rel');
        }
        refreshIdCount();
    }

    // Keep "n/60 ids" in the header visible so resolution failures are
    // obvious at a glance instead of silently leaving cards without ids.
    let lastGridTimestamp = 0;
    function refreshIdCount() {
        const updated = document.querySelector(`#${CONTENT_ID} .discoverr-updated`);
        const body = document.querySelector('.discoverr-grid-body');
        if (!updated || !body) return;

        const cards = body.querySelectorAll('.filterableitem');
        const withIds = body.querySelectorAll('.filterableitem[data-tvdb]').length;
        updated.textContent =
            'Updated ' + new Date(lastGridTimestamp).toLocaleString();
    }

    function applyTvdbIds(gridBody) {
        ensureIdCache().then(() => {
            gridBody.querySelectorAll('.filterableitem').forEach((card) => {
                const link = card.querySelector('a[href*="/series/"]');
                const slug = link && slugFromHref(link.getAttribute('href'));
                if (!slug) return;

                // Slugs like "328775-show" carry the id in the slug itself.
                const idShow = /^(\d+)-show$/.exec(slug);
                if (idShow) {
                    idCache[slug] = idShow[1];
                    idCacheDirty = true;
                    applyCardId(card, idShow[1]);
                    return;
                }

                if (idCache[slug]) {
                    applyCardId(card, idCache[slug]);
                } else {
                    queueSlugForId(slug);
                }
            });
            persistIdCache();
        });
    }

    function queueSlugForId(slug) {
        if (queuedSlugs.has(slug)) return;
        queuedSlugs.add(slug);
        idQueue.push(slug);
        processIdQueue();
    }

    function processIdQueue() {
        if (processingIdQueue) return;
        processingIdQueue = true;

        const step = () => {
            const slug = idQueue.shift();
            if (!slug) {
                processingIdQueue = false;
                persistIdCache();
                return;
            }
            fetchSeriesIdWithRetry(slug).then((id) => {
                if (id) {
                    idCache[slug] = id;
                    idCacheDirty = true;
                    setCardTvdbId(slug, id);
                } // failures are not cached - they retry on the next visit
                persistIdCache();
                setTimeout(step, ID_FETCH_DELAY_MS);
            });
        };
        step();
    }

    function fetchSeriesId(slug) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://www.thetvdb.com/series/' + slug,
                timeout: 15000,
                onload: (response) => {
                    const html = response.responseText || '';
                    // The id appears in several places on a series page; try
                    // them all so a markup change on TVDB's side cannot break
                    // the extraction.
                    const patterns = [
                        /data-type="series" data-id="(\d+)"/,
                        /\/series\/(\d+)\/(?:edit|translate)/,
                        /data-permission="series-(\d+)-/,
                        /banners\/(?:v4\/)?series\/(\d+)\//
                    ];
                    for (const pattern of patterns) {
                        const match = pattern.exec(html);
                        if (match) {
                            resolve(match[1]);
                            return;
                        }
                    }
                    resolve(null);
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    // One retry (after a pause) before giving up on a slug for this visit.
    function fetchSeriesIdWithRetry(slug) {
        return fetchSeriesId(slug).then((id) => {
            if (id) return id;
            return new Promise((resolve) => {
                setTimeout(() => resolve(fetchSeriesId(slug)), 1000);
            });
        });
    }

    function showGridError(content, reason) {
        if (window.location.pathname !== DISCOVER_PATH) return;
        const gridBody = content.querySelector('.discoverr-grid-body');
        if (!gridBody) return;
        gridBody.innerHTML = `<p>Could not load TheTVDB On Today (${reason}).</p>`;
    }

    function restoreContent() {
        const pageContent = document.querySelector('div[class*="PageContent-content"]');
        if (!pageContent) return;

        const content = pageContent.querySelector(`:scope > #${CONTENT_ID}`);
        content?.remove();

        // Always un-hide the native page - our content node may already be
        // gone (React re-render) while its siblings still carry our override.
        for (const child of pageContent.children) {
            child.style.removeProperty('display');
        }
    }

    /* ---------- navigation ---------- */

    function onDiscoverClick(event) {
        event.preventDefault();
        if (!onDiscoverRoute()) {
            window.history.pushState({}, '', DISCOVER_PATH);
        }
        sync();
    }

    function sync() {
        ensureInjected();
        updateHighlight();
        if (onDiscoverRoute()) {
            ensureContent();
        } else {
            restoreContent();
        }
    }

    /* ---------- wiring ---------- */

    // Coalesce mutation bursts into one sync per frame so the observer can
    // never recurse into itself.
    let syncQueued = false;
    const observer = new MutationObserver(() => {
        if (syncQueued) return;
        syncQueued = true;
        requestAnimationFrame(() => {
            syncQueued = false;
            sync();
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    // Back/forward navigation: React's router may re-render the page after
    // popstate; the observer re-asserts our content right after it.
    window.addEventListener('popstate', sync);

    // pushState/replaceState do not emit popstate. Check for URL changes
    // without modifying Sonarr's history methods or rebuilding the grid.
    let lastNavigationUrl = window.location.href;
    window.setInterval(() => {
        if (window.location.href === lastNavigationUrl) return;
        lastNavigationUrl = window.location.href;
        sync();
    }, 250);

    sync();
})();
