// ==UserScript==
// @name         Booth Cross Search (VRCPirate / RipperStore)
// @namespace    booth-cross-search
// @version      2.12.0
// @description  在 Booth 商品页标题下方增加查 VRCPirate/RipperStore 同ID资源；在 VRCatalogue 点击图片弹出商品详情。
// @author       MelodyBomber
// @match        *://booth.pm/*items/*
// @match        *://*.booth.pm/*items/*
// @match        *://vrcatalogue.com/*
// @connect      api-v2.vrcpirate.com
// @connect      forum.ripper.store
// @connect      booth.pm
// @connect      accounts.booth.pm
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ---------------------------------------------------------------- shared

  function addStyle(css) {
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  addStyle(`
    .bcs-bar { position: relative; display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; align-items: center;
      font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif; }
    .bcs-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 16px; border-radius: 20px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: 1px solid var(--border, #dcdcdc); color: var(--text, #222); background: var(--panel, #fff);
      line-height: 1.4; transition: background .15s, border-color .15s;
    }
    .bcs-btn:hover { background: var(--item-hover, #f5f5f5); border-color: var(--border, #c8c8c8); }
    .bcs-btn:active { background: var(--item-hover, #ececec); }
    .bcs-btn .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #bbb; transition: background .2s; }
    .bcs-btn .dot.pending { background: #bbb; animation: bcs-pulse 1s ease-in-out infinite; }
    .bcs-btn .dot.ok { background: #2e9e44; }
    .bcs-btn .dot.none { background: #e2394f; }
    .bcs-btn .dot.error { background: #e0a626; }
    @keyframes bcs-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
    .bcs-btn:disabled { opacity: .5; cursor: wait; }
    .bcs-btn .bcs-cnt {
      min-width: 16px; padding: 0 5px; border-radius: 8px; text-align: center;
      font-size: 11px; font-weight: 700; line-height: 16px;
      background: var(--item-hover, #efefef); color: var(--muted, #777);
    }
    .bcs-warn { font-size: 11px; color: #b8860b; font-weight: 600; text-decoration: none; }
    .bcs-warn:hover { text-decoration: underline; }
    .bcs-panel {
      position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 999;
      background: var(--panel, #fff); border: 1px solid var(--border, #ddd); border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.15);
      min-width: 280px; max-width: 420px; max-height: 320px; overflow-y: auto;
    }
    .bcs-panel-item { display: block; padding: 8px 10px; border-bottom: 1px solid var(--border, #eee); text-decoration: none; color: var(--text, #222); }
    .bcs-panel-item:last-child { border-bottom: none; }
    .bcs-panel-item:hover { background: var(--item-hover, #f5f5f5); }
    .bcs-panel-item .t { font-size: 13px; font-weight: 600; display: block; }
    .bcs-panel-item .s { font-size: 11px; color: var(--muted, #888); }
    .bcs-panel-empty { padding: 10px; font-size: 13px; color: var(--muted, #888); }
    .bcs-desc.bcs-collapsed { max-height: 240px !important; overflow: hidden !important; position: relative; }
    .bcs-desc.bcs-desc-hidden { display: none !important; }
    .bcs-desc.bcs-collapsed::after {
      content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 90px;
      background: linear-gradient(rgba(0,0,0,0), var(--panel, #fff) 85%); pointer-events: none;
    }
    .bcs-toggle {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; margin: 12px 0 4px; padding: 10px 16px;
      border: 1px solid var(--border, #e4e4e7); border-radius: 10px; background: var(--panel, #fafafa);
      color: var(--text, #222); cursor: pointer; font-size: 13px; font-weight: 700; line-height: 1.4;
      font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif;
      transition: background .15s, border-color .15s, box-shadow .15s, transform .05s;
    }
    .bcs-toggle:hover { background: var(--item-hover, #f4f4f5); border-color: var(--border, #d4d4d8); box-shadow: 0 1px 5px rgba(0,0,0,.06); }
    .bcs-toggle:active { transform: translateY(1px); }
    .bcs-toggle .bcs-count { color: var(--muted, #888); font-weight: 600; }
    .bcs-toggle .bcs-chev { font-size: 10px; transition: transform .2s ease; }
    .bcs-toggle.is-open .bcs-chev { transform: rotate(180deg); }
    .bcs-toggle-sticky { position: sticky; top: 0; z-index: 3; margin-top: 0; }
    .bcs-var-hidden { display: none !important; }
  `);

  function decodeEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = str;
    return ta.value;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function makeLink(text, href, className) {
    const a = document.createElement("a");
    if (className) a.className = className;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    return a;
  }

  function gmGet(url, opts = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || "GET",
        url,
        headers: opts.headers,
        timeout: 10000,
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function fetchJson(url) {
    return gmGet(url).then((res) => ({
      status: res.status,
      json: JSON.parse(res.responseText),
    }));
  }

  // ---- Booth wish list ("スキ!") sync. Booth is the single source of
  // truth: star state everywhere = membership in the id set from
  // wish_list_name_items.json (paginated, 20/page — pages are walked to a
  // sanity cap; GM_xmlhttpRequest sends the user's booth cookies), fetched
  // lazily and re-walked when the history panel opens. The response carries
  // full item cards, kept in `byId` so the panel's wish strip needs no
  // per-item fetches. Logged out the endpoint 401s — resolved as an empty
  // list so stars just render unfilled. Endpoints are private — if Booth
  // changes them only the star feature degrades; search and history are
  // unaffected.
  // Shared projection of a Booth card object (wish + history endpoints
  // return the same shape) down to what the tiles render.
  function cardEntry(it) {
    return {
      id: String(it.id),
      title: it.name || "",
      img: (it.thumbnail_image_urls && it.thumbnail_image_urls[0]) || "",
      price: it.price || "",
      shop: (it.shop && it.shop.name) || "",
    };
  }

  const WISH_PAGE_CAP = 25;
  // Stable container, mutated in place by every (re)fetch and by setWished:
  // everything holding a reference (badge pass, open modal, panel closures)
  // sees fresh data without re-subscribing. Pass fresh=true to re-walk the
  // endpoint (the history panel does, so likes made on booth.pm show up
  // without a page reload); a failed refresh keeps the previous contents.
  const wishData = { ids: new Set(), byId: new Map(), loggedOut: false };
  let wishListPromise = null;
  function getWishList(fresh) {
    if (!wishListPromise || fresh) {
      const ids = new Set();
      const byId = new Map();
      const done = (loggedOut) => {
        wishData.loggedOut = !!loggedOut;
        wishData.ids.clear();
        wishData.byId.clear();
        ids.forEach((id) => wishData.ids.add(id));
        byId.forEach((v, k) => wishData.byId.set(k, v));
        return wishData;
      };
      const fetchPage = (page) =>
        fetchJson(
          `https://accounts.booth.pm/wish_list_name_items.json?page=${page}`,
        ).then(({ status, json }) => {
          if (status === 401) return done(true); // logged out -> empty
          if (status !== 200 || !json || !Array.isArray(json.items)) {
            throw new Error(`wish_list_name_items ${status}`);
          }
          for (const it of json.items) {
            const entry = cardEntry(it);
            ids.add(entry.id);
            byId.set(entry.id, entry);
          }
          const next = json.pagination && json.pagination.next_page;
          if (next && next <= WISH_PAGE_CAP) return fetchPage(next);
          return done(false);
        });
      const p = fetchPage(1).catch((e) => {
        if (wishListPromise === p) wishListPromise = null;
        throw e;
      });
      wishListPromise = p;
    }
    return wishListPromise;
  }
  function getWishedIds() {
    return getWishList().then((w) => w.ids);
  }

  // Rails CSRF token, scraped from any booth.pm page and memoized. A 422 on
  // a write means it went stale (or there is no session) — refreshed and
  // retried once by setWished.
  let csrfPromise = null;
  function getCsrfToken(fresh) {
    if (fresh || !csrfPromise) {
      csrfPromise = gmGet("https://booth.pm/en")
        .then((res) => {
          const m = (res.responseText || "").match(
            /<meta name="csrf-token" content="([^"]+)"/,
          );
          if (!m) throw new Error("no csrf token");
          return m[1];
        })
        .catch((e) => {
          csrfPromise = null;
          throw e;
        });
    }
    return csrfPromise;
  }

  // Authenticated Booth write with the standard Rails dance: CSRF header,
  // and one refresh-and-retry on 422 (stale token / no session).
  function boothWrite(url, method) {
    const ok = (res) => res.status >= 200 && res.status < 300;
    const send = (token) =>
      gmGet(url, {
        method,
        headers: {
          "X-CSRF-Token": token,
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
    return getCsrfToken()
      .then(send)
      .then((res) => {
        if (ok(res)) return;
        if (res.status !== 422) throw new Error(`${method} ${url}: ${res.status}`);
        return getCsrfToken(true)
          .then(send)
          .then((res2) => {
            if (!ok(res2)) {
              throw new Error(`${method} ${url}: ${res2.status}`);
            }
          });
      });
  }

  function setWished(itemId, on) {
    return boothWrite(
      `https://booth.pm/items/${itemId}/wish_list.json`,
      on ? "POST" : "DELETE",
    ).then(() =>
      getWishedIds().then((set) => {
        if (on) set.add(String(itemId));
        else set.delete(String(itemId));
      }),
    );
  }

  // GM value storage may be missing entirely (manager without the grant, or
  // an older installed script version whose header lacked it) — persistence
  // and history both degrade to no-ops/hidden rather than breaking search.
  const canStore =
    typeof GM_getValue === "function" && typeof GM_setValue === "function";

  // Guarded JSON (de)serialization over GM values — the per-source caches and
  // the history list share this so the try/catch plumbing lives once. Values
  // go through JSON strings (not raw objects) since not every manager
  // serializes objects.
  function gmReadJson(key, fallback) {
    try {
      return JSON.parse(GM_getValue(key, "null")) ?? fallback;
    } catch (e) {
      return fallback;
    }
  }
  function gmWriteJson(key, value) {
    try {
      GM_setValue(key, JSON.stringify(value));
    } catch (e) {
      /* storage full/unavailable — degrade to memory-only */
    }
  }

  // TTL'd per-item cache persisted as one JSON blob per source under a
  // `bcs-cache-<name>` GM value. Expired entries are pruned once on first
  // load; `max` caps the blob by evicting oldest-written entries so a long
  // browsing session can't grow it unbounded.
  function persistentStore(name, ttl, max) {
    if (!canStore) return { get: () => undefined, set: () => {} };
    const key = `bcs-cache-${name}`;
    let data = null;
    const load = () => {
      if (!data) {
        data = gmReadJson(key, {});
        const now = Date.now();
        for (const id of Object.keys(data)) {
          if (!data[id] || now - data[id].t > ttl) delete data[id];
        }
      }
      return data;
    };
    return {
      get(id) {
        const entry = load()[id];
        return entry ? entry.d : undefined;
      },
      set(id, d) {
        const map = load();
        map[id] = { t: Date.now(), d };
        const ids = Object.keys(map);
        if (ids.length > max) {
          ids.sort((a, b) => map[a].t - map[b].t);
          ids.slice(0, ids.length - max).forEach((old) => delete map[old]);
        }
        gmWriteJson(key, map);
      },
    };
  }

  // VRCPirate needs no login to search. RipperStore's search API returns a
  // {status:{code:"not-authorised"}} envelope when logged out instead of the
  // usual posts payload, so login state is read straight off that response.
  // Results memoize per item id on a shared in-flight promise so an auto-check
  // and a later button click never fire the same request twice; a failure
  // clears the cache so the next click can retry instead of staying rejected.
  // An optional persistentStore backs the memo across page loads — only
  // successful results are persisted, so a cached "not-authorised" can never
  // outlive an actual login.
  function memoized(map, id, run, store) {
    if (!map.has(id)) {
      const hit = store && store.get(id);
      map.set(
        id,
        hit !== undefined
          ? Promise.resolve(hit)
          : run().then(
              (d) => {
                if (store) store.set(id, d);
                return d;
              },
              (e) => {
                map.delete(id);
                throw e;
              },
            ),
      );
    }
    return map.get(id);
  }

  const HOUR = 3600e3;
  const vrcpCache = new Map();
  const vrcpStore = persistentStore("vrcp", 6 * HOUR, 120);
  function getVrcpMatches(itemId) {
    return memoized(
      vrcpCache,
      itemId,
      () =>
        fetchJson(
          `https://api-v2.vrcpirate.com/assets?page=1&search=${itemId}`,
        ).then(({ json }) =>
          (json.data || []).filter((a) => String(a.boothID) === itemId),
        ),
      vrcpStore,
    );
  }

  const ripperCache = new Map();
  const ripperStore = persistentStore("ripper", 6 * HOUR, 120);
  function getRipperResult(itemId) {
    return memoized(ripperCache, itemId, () => {
      const url = `https://forum.ripper.store/api/search?in=titlesposts&term=${itemId}&matchWords=all&by=&categories=&searchChildren=false&hasTags=&replies=&repliesFilter=atleast&timeFilter=newer&timeRange=&sortBy=relevance&sortDirection=desc&showAs=posts&_=${Date.now()}`;
      return fetchJson(url).then(({ json }) => {
        if (json.status && json.status.code === "not-authorised") {
          const err = new Error("not-authorised");
          err.notAuthorised = true;
          throw err;
        }
        const posts = json.posts || [];
        posts.sort((a, b) => b.timestamp - a.timestamp);
        return posts;
      });
    }, ripperStore);
  }

  // booth.pximg.net serves a whitelist of resize variants via a /c/<spec>/
  // path prefix — arbitrary sizes 403, and the item JSON's "resized" is a
  // blurry c/72x72. Callers pass canonical full-size URLs around and each
  // render site applies the variant it needs. Non-Booth-CDN URLs pass
  // through untouched.
  function boothImgVariant(url, spec) {
    if (!url || !url.includes("booth.pximg.net/")) return url || "";
    const bare = url.replace(/booth\.pximg\.net\/c\/[^/]+\//, "booth.pximg.net/");
    return spec ? bare.replace("booth.pximg.net/", `booth.pximg.net/${spec}/`) : bare;
  }
  // Whitelisted variant sized for the history grid (130px+ cells on hi-DPI).
  const HIST_IMG_SPEC = "c/300x300_a2_g5";

  // "Recently viewed" comes from Booth's own server-side history
  // (booth.pm/history.json, same card shape as the wish endpoint,
  // unpaginated): Booth records item-page visits natively, and vrcatalogue
  // modal opens hit items/<id>.json with cookies, which Booth records too.
  // Logged out it returns 200 + [] — indistinguishable from an empty
  // history, so login state comes from the wish endpoint's 401 instead
  // (wishData.loggedOut). No local copy is kept.
  const histData = { list: [], ids: new Set() };
  let historyPromise = null;
  function getHistory(fresh) {
    if (!historyPromise || fresh) {
      const p = fetchJson("https://booth.pm/history.json")
        .then(({ status, json }) => {
          if (status !== 200 || !Array.isArray(json)) {
            throw new Error(`history ${status}`);
          }
          histData.list = json.map(cardEntry);
          histData.ids = new Set(histData.list.map((e) => e.id));
          return histData;
        })
        .catch((e) => {
          if (historyPromise === p) historyPromise = null;
          throw e;
        });
      historyPromise = p;
    }
    return historyPromise;
  }
  // Instant local echo for a view made this page load: the modal may serve
  // the item from the 24h persistent cache without ever hitting Booth, so
  // this is also the only "seen" signal for those.
  function markSeen(id) {
    histData.ids.add(String(id));
  }
  // Server-side wipe: DELETE on the same endpoint empties Booth's history
  // for the whole account (irreversible). A successful clear answers with
  // a 302 to booth.pm/history that GM_xmlhttpRequest doesn't follow
  // cleanly (onload fires with status 0), so boothWrite rejects even on
  // success — the catch refetches and lets the server's actual list
  // decide. Local mirrors are cleared so the panel and card veils react
  // without waiting on another fetch.
  function clearHistory() {
    return boothWrite("https://booth.pm/history.json", "DELETE")
      .catch((e) =>
        getHistory(true).then((h) => {
          if (h.list.length) throw e; // genuinely not cleared
        }),
      )
      .then(() => {
        histData.list = [];
        histData.ids = new Set();
      });
  }

  // Single source of truth for the two ways a search request can fail, so the
  // click handler and autoCheck don't each re-derive (and drift on) the copy.
  const RETRY_MSG = "查询失败，点击重试";
  const RIPPER_LOGIN_MSG = "请先登录 RipperStore";
  function classifyRipperError(e) {
    return e && e.notAuthorised
      ? { auth: true, message: RIPPER_LOGIN_MSG }
      : { auth: false, message: RETRY_MSG };
  }

  function closePanels(bar) {
    bar.querySelectorAll(".bcs-panel").forEach((p) => p.remove());
  }

  function showPanel(bar, entries, emptyMessage) {
    closePanels(bar);
    const panel = document.createElement("div");
    panel.className = "bcs-panel";
    if (!entries.length) {
      panel.innerHTML = `<div class="bcs-panel-empty">${emptyMessage || "没有找到匹配结果"}</div>`;
    } else {
      for (const e of entries) {
        const a = document.createElement("a");
        a.className = "bcs-panel-item";
        a.href = e.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.innerHTML = `<span class="t"></span><span class="s"></span>`;
        a.querySelector(".t").textContent = e.title;
        if (e.sub) a.querySelector(".s").textContent = e.sub;
        panel.appendChild(a);
      }
    }
    bar.appendChild(panel);
    const closer = (ev) => {
      if (!panel.contains(ev.target)) {
        panel.remove();
        document.removeEventListener("click", closer);
      }
    };
    setTimeout(() => document.addEventListener("click", closer), 0);
  }

  // The VRCPirate/RipperStore button bar, shared by the Booth item page and the
  // vrcatalogue detail modal. Buttons start disabled and only get re-enabled by
  // runAutoCheck once we know the source is reachable/logged-in, so a click
  // here can trust that login already passed. Call the returned .autoCheck()
  // when the host page is ready (Booth waits for window load, the modal runs
  // it immediately).
  function buildSearchBar(itemId) {
    const bar = document.createElement("div");
    bar.className = "bcs-bar";

    // Paint a lookup result onto a button: green/red status dot plus the
    // count badge next to the label — shown only for 2+ results (at 0 the
    // red dot already says "none", and a lone "1" repeats the green dot;
    // VRCPirate in practice never exceeds one match, so its badge stays off).
    const setResult = (dot, cnt, n) => {
      dot.className = `dot ${n ? "ok" : "none"}`;
      cnt.hidden = n < 2;
      cnt.textContent = n;
    };

    const vrcpBtn = document.createElement("button");
    vrcpBtn.className = "bcs-btn vrcp";
    vrcpBtn.disabled = true;
    vrcpBtn.title = "加载中…";
    vrcpBtn.innerHTML =
      '<span class="dot pending"></span>VRCPirate<span class="bcs-cnt" hidden></span>';
    const vrcpDot = vrcpBtn.querySelector(".dot");
    const vrcpCnt = vrcpBtn.querySelector(".bcs-cnt");
    vrcpBtn.addEventListener("click", async () => {
      closePanels(bar);
      vrcpBtn.disabled = true;
      try {
        const matches = await getVrcpMatches(itemId);
        setResult(vrcpDot, vrcpCnt, matches.length);
        if (matches.length === 1) {
          window.open(
            `https://vrcpirate.com/iviewer/${matches[0].id}`,
            "_blank",
            "noopener,noreferrer",
          );
        } else {
          showPanel(
            bar,
            matches.map((a) => ({
              title: a.name,
              sub: `${a.downloads} downloads`,
              url: `https://vrcpirate.com/iviewer/${a.id}`,
            })),
          );
        }
      } catch (e) {
        vrcpDot.className = "dot error";
        showPanel(bar, [], RETRY_MSG);
      } finally {
        vrcpBtn.disabled = false;
      }
    });

    const ripperBtn = document.createElement("button");
    ripperBtn.className = "bcs-btn ripper";
    ripperBtn.disabled = true;
    ripperBtn.title = "检测登录状态中…";
    ripperBtn.innerHTML =
      '<span class="dot pending"></span>RipperStore<span class="bcs-cnt" hidden></span>';
    const ripperDot = ripperBtn.querySelector(".dot");
    const ripperCnt = ripperBtn.querySelector(".bcs-cnt");
    ripperBtn.addEventListener("click", async () => {
      closePanels(bar);
      ripperBtn.disabled = true;
      try {
        const posts = await getRipperResult(itemId);
        setResult(ripperDot, ripperCnt, posts.length);
        showPanel(
          bar,
          posts.map((p) => ({
            title: decodeEntities(p.topic.title),
            sub: [
              p.category?.name && decodeEntities(p.category.name),
              formatDate(p.timestamp),
            ]
              .filter(Boolean)
              .join(" · "),
            url: p.url,
          })),
        );
      } catch (e) {
        const { auth, message } = classifyRipperError(e);
        ripperDot.className = `dot ${auth ? "none" : "error"}`;
        showPanel(bar, [], message);
      } finally {
        ripperBtn.disabled = false;
      }
    });

    bar.appendChild(vrcpBtn);
    bar.appendChild(ripperBtn);

    function addWarn(text, url) {
      const warn = document.createElement("a");
      warn.className = "bcs-warn";
      warn.textContent = text;
      warn.href = url;
      warn.target = "_blank";
      warn.rel = "noopener noreferrer";
      bar.appendChild(warn);
    }

    // Decides whether each button gets enabled, and colors its dot either way.
    bar.autoCheck = () => {
      // VRCPirate: no login gate, search straight away.
      vrcpBtn.disabled = false;
      vrcpBtn.title = "";
      getVrcpMatches(itemId)
        .then((matches) => {
          setResult(vrcpDot, vrcpCnt, matches.length);
        })
        .catch(() => {
          vrcpDot.className = "dot error";
          vrcpBtn.title = RETRY_MSG;
        });
      // RipperStore: login state comes from the search response itself.
      getRipperResult(itemId)
        .then((posts) => {
          ripperBtn.disabled = false;
          ripperBtn.title = "";
          setResult(ripperDot, ripperCnt, posts.length);
        })
        .catch((e) => {
          const { auth, message } = classifyRipperError(e);
          ripperDot.className = `dot ${auth ? "none" : "error"}`;
          ripperBtn.title = message;
          if (auth) {
            addWarn("⚠ 未登录 RipperStore", "https://forum.ripper.store/login");
          } else {
            // Network/parse error, not an auth failure — allow a manual retry.
            ripperBtn.disabled = false;
          }
        });
    };

    return bar;
  }

  // Shared expand/collapse button: label + right-side count + rotating chevron.
  function makeToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcs-toggle";
    btn.innerHTML =
      '<span class="bcs-label"></span><span class="bcs-count"></span><span class="bcs-chev">▾</span>';
    return btn;
  }

  // Collapse `desc` behind an expand toggle. In "preview" mode (default)
  // it's left alone when already shorter than the preview height, and
  // collapses to a peeking 240px otherwise; the toggle is inserted after
  // the content and collapsing scrolls it back into view.
  //
  // In "hidden" mode it always collapses — fully, to zero height —
  // regardless of length, so every instance starts visually identical; the
  // vrcatalogue modal uses this so per-item description length can't make
  // one card taller than another. The toggle is pinned above the content
  // (sticky, at the section divider) instead of drifting with content
  // length/scroll position.
  //
  // Returns the toggle, or null when preview mode leaves it uncollapsed.
  const DESC_PREVIEW = 240;
  function collapseDesc(desc, mode = "preview") {
    const hidden = mode === "hidden";
    if (!hidden && desc.scrollHeight <= DESC_PREVIEW + 60) return null;
    const collapsedClass = hidden ? "bcs-desc-hidden" : "bcs-collapsed";
    desc.classList.add("bcs-desc", collapsedClass);
    const toggle = makeToggle();
    // Sticks to the top of the scrolling modal once expanded, so collapsing
    // a long description back down never requires scrolling back up to find
    // the button first.
    if (hidden) toggle.classList.add("bcs-toggle-sticky");
    const label = toggle.querySelector(".bcs-label");
    const sync = () => {
      const open = !desc.classList.contains(collapsedClass);
      toggle.classList.toggle("is-open", open);
      label.textContent = open ? "收起商品说明" : "展开商品说明";
    };
    sync();
    toggle.addEventListener("click", () => {
      const collapsing = !desc.classList.contains(collapsedClass);
      desc.classList.toggle(collapsedClass);
      sync();
      if (collapsing && !hidden) desc.scrollIntoView({ block: "nearest" });
    });
    desc.insertAdjacentElement(hidden ? "beforebegin" : "afterend", toggle);
    return toggle;
  }

  // ---------------------------------------------------------------- booth.pm

  function initBooth() {
    const idMatch = location.pathname.match(/\/items\/(\d+)/);
    if (!idMatch) return;
    const itemId = idMatch[1];

    // og: meta is server-rendered, so it's already present at document-idle
    // even while React still fills the body.
    const ogMeta = (p) =>
      document.querySelector(`meta[property="og:${p}"]`)?.content || "";

    // Collapse the item description behind an expand button. On the generic
    // booth.pm/items template, the description body is the .my-40 wrapper
    // that holds the 概要/詳細 (.shop__text) sections — note .shop__text is
    // also used in the shop-profile area, so anchor on the .my-40 that
    // actually contains one. Custom shop subdomains (e.g. foo.booth.pm) use a
    // different template with no .my-40 at all: the sections sit directly in
    // a pair of responsive-duplicate .description blocks (one shown on
    // mobile, one on desktop; .for_mobile.description is a third, unrelated
    // short excerpt already collapsed natively) — fall back to those.
    function findDescCandidates() {
      const legacy = [...document.querySelectorAll(".my-40")].find((el) =>
        el.querySelector(".shop__text"),
      );
      if (legacy) return [legacy];
      return [...document.querySelectorAll(".description")].filter(
        (el) => !el.classList.contains("for_mobile") && el.querySelector(".shop__text"),
      );
    }
    // Cached once found so the MutationObserver driving init() (below) isn't
    // re-querying the whole document on every unrelated DOM mutation.
    let descCandidates = null;
    function setupDescCollapse() {
      if (!descCandidates || !descCandidates.length) {
        descCandidates = findDescCandidates();
      }
      if (!descCandidates.length) return false;
      return descCandidates.every((desc) => {
        if (desc.dataset.bcsCollapse) return true;
        // The hidden half of a responsive-duplicate pair has scrollHeight 0
        // and never "settles" — skip it without blocking on it.
        if (desc.offsetParent === null) return true;
        // Height may read short while React is still filling the block;
        // not settled yet (not a permanent skip) so the observer keeps
        // watching until it does.
        if (desc.scrollHeight <= DESC_PREVIEW + 60) return false;
        desc.dataset.bcsCollapse = "1";
        collapseDesc(desc);
        return true;
      });
    }

    // Collapse the purchasable-variations list (.variations, one
    // .variation-item per row) down to the first few rows behind an expand
    // button. Skips short lists where hiding a row or two isn't worth it.
    const VAR_SHOW = 3;
    function setupVariationsCollapse() {
      const box = document.querySelector(".variations");
      if (!box) return false;
      if (box.dataset.bcsVar) return true;
      const items = [...box.querySelectorAll(".variation-item")];
      if (items.length <= VAR_SHOW + 1) {
        box.dataset.bcsVar = "skip";
        return true;
      }
      box.dataset.bcsVar = "1";
      const hidden = items.slice(VAR_SHOW);
      const setHidden = (h) =>
        hidden.forEach((it) => it.classList.toggle("bcs-var-hidden", h));
      setHidden(true);

      const toggle = makeToggle();
      toggle.querySelector(".bcs-count").textContent = `共 ${items.length} 件`;
      const label = toggle.querySelector(".bcs-label");
      const sync = (open) => {
        toggle.classList.toggle("is-open", open);
        label.textContent = open ? "收起商品" : `展开其余 ${hidden.length} 件`;
      };
      sync(false);
      toggle.addEventListener("click", () => {
        const open = hidden[0].classList.contains("bcs-var-hidden");
        setHidden(!open);
        sync(open);
        if (!open) box.scrollIntoView({ block: "nearest" });
      });
      box.insertAdjacentElement("afterend", toggle);
      return true;
    }

    function findTitleEl() {
      const wanted = (ogMeta("title") || document.title).trim();
      const heads = document.querySelectorAll("h1, h2, h3");
      for (const h of heads) {
        const t = h.textContent.trim();
        if (
          t &&
          (t === wanted ||
            wanted.startsWith(t) ||
            t.startsWith(wanted.split(" - ")[0]))
        ) {
          return h;
        }
      }
      return heads.length ? heads[0] : null;
    }

    function insertBar() {
      if (document.querySelector(".bcs-bar")) return true;
      const titleEl = findTitleEl();
      if (!titleEl) return false;
      const bar = buildSearchBar(itemId);
      titleEl.insertAdjacentElement("afterend", bar);
      // Runs once the page (and its own network activity) has settled.
      if (document.readyState === "complete") {
        bar.autoCheck();
      } else {
        window.addEventListener("load", bar.autoCheck, { once: true });
      }
      return true;
    }

    function init() {
      // Each returns true once handled; the bar, description and variations
      // list can appear at different times, so keep the observer alive until
      // all settle.
      const barDone = insertBar();
      const descDone = setupDescCollapse();
      const varDone = setupVariationsCollapse();
      return barDone && descDone && varDone;
    }

    if (!init()) {
      const mo = new MutationObserver(() => {
        if (init()) mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
    }
  }

  // ----------------------------------------------------------- vrcatalogue

  function initVrcatalogue() {
    addStyle(`
      .bcs-overlay {
        position: fixed; inset: 0; z-index: 99999; background: var(--overlay-bg, rgba(0,0,0,.65));
        display: flex; align-items: center; justify-content: center; padding: 24px;
        font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif;
      }
      .bcs-modal {
        background: var(--panel, #fff); color: var(--text, #222); border-radius: 14px; box-shadow: 0 12px 48px rgba(0,0,0,.4);
        width: min(880px, 100%); max-height: min(720px, 92vh); overflow-y: auto;
        padding: 20px; position: relative; box-sizing: border-box;
        scrollbar-width: thin; scrollbar-color: transparent transparent;
      }
      /* Gutter (scrollbar-width: thin / webkit width: 8px) stays reserved at
         all times so hovering never resizes the modal — only the thumb color
         toggles, keeping an idle view clean while scroll stays discoverable. */
      .bcs-modal:hover { scrollbar-color: var(--scrollbar-thumb, #ccc) transparent; }
      .bcs-modal::-webkit-scrollbar { width: 8px; background: transparent; }
      .bcs-modal::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
      .bcs-modal:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, #ccc); }
      .bcs-modal:hover::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover, #bbb); }
      .bcs-modal-top { display: flex; gap: 20px; align-items: flex-start; }
      .bcs-media { flex: 0 0 46%; min-width: 0; }
      .bcs-img-stage { position: relative; }
      .bcs-main-img {
        width: 100%; aspect-ratio: 1; object-fit: contain; background: var(--skel, #f4f4f5);
        border-radius: 10px; display: block; cursor: zoom-in;
      }
      /* .bcs-nav / .bcs-zoom-overlay mirror vrcatalogue.com's own
         .lightbox-nav / .lightbox styling so the image controls feel native
         to the site rather than bespoke to this script. */
      .bcs-nav, .bcs-znav {
        position: absolute; top: 50%; z-index: 2; border-radius: 3px;
        border: 1px solid rgba(255,255,255,.18); color: #fff;
        display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
        transition: background .12s ease, border-color .12s ease, transform .12s ease;
      }
      .bcs-nav { transform: translateY(-50%); width: 2.25rem; height: 2.25rem; background: rgba(0,0,0,.55); }
      .bcs-nav:hover { background: rgba(0,0,0,.75); border-color: rgba(255,255,255,.35); }
      .bcs-nav svg { width: 18px; height: 18px; }
      .bcs-nav--left { left: 8px; }
      .bcs-nav--right { right: 8px; }
      .bcs-zoom-overlay {
        position: fixed; inset: 0; z-index: 100000; background: #000000eb;
        display: flex; align-items: center; justify-content: center; padding: 24px; cursor: zoom-out;
      }
      /* Fixed-size stage (copies vrcatalogue's .lightbox-main) so nav buttons
         stay put regardless of image aspect — they don't chase the image box.
         Image is object-fit:contain inside; the 9rem width gutter leaves room
         for the outside nav. */
      .bcs-zoom-stage { position: relative; width: min(100vw - 9rem, 1200px); height: min(80vh, 1000px); }
      .bcs-zoom-img { width: 100%; height: 100%; object-fit: contain; display: block; }
      /* .bcs-znav copies vrcatalogue's .lightbox-nav 1:1 (3.5rem square, sits
         .75rem outside the image edge) so the zoom controls match the site.
         Box/appearance base is shared with .bcs-nav above. */
      .bcs-znav { margin-top: -1.75rem; width: 3.5rem; height: 3.5rem; background: #0000008c; }
      .bcs-znav:hover { background: #ffffff26; border-color: #ffffff59; transform: scale(1.1); }
      .bcs-znav:active { transform: scale(1.02); }
      .bcs-znav svg { width: 24px; height: 24px; }
      .bcs-znav--left { right: calc(100% + .75rem); }
      .bcs-znav--right { left: calc(100% + .75rem); }
      @media (max-width: 640px) {
        .bcs-zoom-overlay { padding: 12px; }
        .bcs-znav { width: 2.5rem; height: 2.5rem; margin-top: -1.25rem; }
        .bcs-znav svg { width: 20px; height: 20px; }
        .bcs-znav--left { right: calc(100% + .5rem); }
        .bcs-znav--right { left: calc(100% + .5rem); }
      }
      .bcs-img-count {
        position: absolute; right: 8px; bottom: 8px; z-index: 2;
        background: rgba(0,0,0,.55); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px;
      }
      .bcs-thumbs { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; padding-bottom: 4px; scroll-behavior: smooth; }
      .bcs-thumb {
        flex: none; width: 52px; height: 52px; padding: 0; border-radius: 6px; overflow: hidden;
        border: 2px solid transparent; cursor: pointer; background: var(--skel, #f4f4f5);
      }
      .bcs-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .bcs-thumb.on { border-color: var(--accent, #fc4d50); }
      .bcs-variations { display: flex; flex-direction: column; }
      .bcs-var-item {
        display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px;
        padding: 6px 0; border-bottom: 1px solid var(--border, #f0f0f0);
      }
      .bcs-var-item:last-child { border-bottom: none; }
      .bcs-var-name { color: var(--text, #222); word-break: break-word; }
      .bcs-var-price { color: var(--accent, #fc4d50); font-weight: 700; flex: none; }
      .bcs-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
      .bcs-title-row { display: flex; align-items: flex-start; gap: 8px; }
      .bcs-title-row .bcs-title { flex: 1; min-width: 0; }
      .bcs-star {
        flex: none; border: none; background: none; padding: 2px; cursor: pointer;
        color: var(--muted, #999); transition: color .15s, transform .12s;
      }
      .bcs-star:hover { transform: scale(1.15); }
      .bcs-star.on { color: #f5a623; }
      .bcs-star:disabled { opacity: .5; cursor: wait; }
      .bcs-star svg { width: 20px; height: 20px; display: block; }
      .bcs-title {
        font-size: 17px; font-weight: 700; line-height: 1.45; color: var(--text, #222);
        text-decoration: none; word-break: break-word;
      }
      .bcs-title:hover { color: var(--accent, #fc4d50); text-decoration: underline; }
      .bcs-meta { font-size: 13px; color: var(--muted, #888); display: flex; gap: 10px; flex-wrap: wrap; }
      .bcs-meta .bcs-price { color: var(--accent, #fc4d50); font-weight: 700; }
      .bcs-meta a { color: inherit; text-decoration: none; }
      .bcs-meta a:hover { color: var(--accent, #fc4d50); text-decoration: underline; }
      .bcs-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .bcs-tag {
        font-size: 11px; padding: 3px 10px; border-radius: 12px;
        background: var(--item-hover, #f5f5f5); color: var(--muted, #888);
        text-decoration: none; border: 1px solid transparent;
      }
      .bcs-tag:hover { color: var(--accent, #fc4d50); border-color: var(--accent, #fc4d50); }
      .bcs-buy {
        display: block; text-align: center; padding: 11px 16px; border-radius: 24px;
        background: var(--accent, #fc4d50); color: #fff; font-size: 14px; font-weight: 700;
        text-decoration: none; transition: background .15s;
      }
      .bcs-buy:hover { background: var(--accent-fill, #e63e42); }
      .bcs-modal-desc {
        margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border, #eee);
        font-size: 13px; line-height: 1.7; color: var(--text, #222); white-space: pre-wrap; word-break: break-word;
      }
      .bcs-modal-desc.bcs-dim { color: var(--muted, #888); }
      .bcs-hist-fab {
        position: fixed; right: 18px; bottom: 18px; z-index: 9998;
        width: 44px; height: 44px; border-radius: 50%; padding: 0;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        border: 1px solid var(--border, #ddd); background: var(--panel, #fff); color: var(--text, #222);
        box-shadow: 0 2px 10px rgba(0,0,0,.18); transition: background .15s, transform .12s;
      }
      .bcs-hist-fab:hover { background: var(--item-hover, #f5f5f5); transform: scale(1.06); }
      .bcs-hist-fab svg { width: 20px; height: 20px; }
      .bcs-hist-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 14px; font-size: 15px; font-weight: 700; color: var(--text, #222);
      }
      .bcs-filter-wrap { position: relative; flex: 1; min-width: 0; margin-left: 12px; }
      .bcs-hist-filter {
        width: 100%; box-sizing: border-box; padding: 4px 10px;
        font-size: 12px; font-family: inherit; color: var(--text, #222);
        background: var(--item-hover, #f5f5f5); border: 1px solid var(--border, #ddd);
        border-radius: 6px; outline: none;
      }
      .bcs-hist-filter:focus { border-color: var(--accent, #fc4d50); }
      .bcs-filter-drop {
        position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
        background: var(--panel, #fff); border: 1px solid var(--border, #ddd);
        border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.18);
        max-height: 240px; overflow-y: auto; padding: 4px;
      }
      .bcs-filter-drop[hidden] { display: none; }
      .bcs-filter-row {
        display: flex; align-items: center; gap: 6px; padding: 5px 8px;
        border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--text, #222);
      }
      .bcs-filter-row:hover { background: var(--item-hover, #f5f5f5); }
      .bcs-filter-row .q {
        flex: 1; min-width: 0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .bcs-filter-del {
        border: none; background: none; cursor: pointer; padding: 0 2px;
        font-size: 13px; line-height: 1; font-family: inherit; color: var(--muted, #999);
      }
      .bcs-filter-del:hover { color: var(--accent, #fc4d50); }
      .bcs-hist-clear {
        flex: none; margin-left: 10px; padding: 4px 10px; white-space: nowrap;
        font-size: 12px; font-weight: 400; font-family: inherit; cursor: pointer;
        color: var(--muted, #888); background: var(--item-hover, #f5f5f5);
        border: 1px solid var(--border, #ddd); border-radius: 6px;
        transition: color .15s, border-color .15s, background .15s;
      }
      .bcs-hist-clear:hover { color: var(--accent, #fc4d50); border-color: var(--accent, #fc4d50); }
      .bcs-hist-clear.armed { color: #fff; background: var(--accent, #fc4d50); border-color: var(--accent, #fc4d50); }
      .bcs-hist-clear[disabled] { opacity: .6; cursor: default; }
      .bcs-hist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; align-items: start; }
      .bcs-hist-item { border: none; background: none; padding: 0; cursor: pointer; text-align: left; font-family: inherit; }
      .bcs-hist-thumb { position: relative; }
      .bcs-hist-item img {
        width: 100%; aspect-ratio: 1; object-fit: cover; display: block;
        border-radius: 8px; background: var(--skel, #f4f4f5);
      }
      .bcs-hist-item .ht {
        margin-top: 6px; font-size: 12px; line-height: 1.4; color: var(--text, #222);
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        word-break: break-word; min-height: 2.8em;
      }
      .bcs-hist-item:hover .ht { color: var(--accent, #fc4d50); }
      .bcs-hist-item .hm {
        margin-top: 2px; font-size: 11px; color: var(--muted, #888);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bcs-hist-empty { padding: 32px 0; text-align: center; font-size: 13px; color: var(--muted, #888); }
      .bcs-hist-sub {
        margin: 14px 0 8px; font-size: 12px; font-weight: 700;
        color: var(--muted, #888);
      }
      .bcs-hist-sub-row { display: flex; align-items: center; justify-content: space-between; }
      /* Wish-toggle star shared by history thumbs and product cards:
         hover-revealed when off, constant gold when on. */
      .bcs-tile-star {
        position: absolute; top: 6px; right: 6px; width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        border: none; padding: 0; z-index: 5;
        border-radius: 50%; background: var(--panel, #fff); color: var(--muted, #999);
        box-shadow: 0 1px 4px rgba(0,0,0,.2); cursor: pointer;
        opacity: 0; transition: opacity .12s, color .15s;
      }
      .bcs-tile-star[hidden] { display: none; }
      .bcs-hist-item:hover .bcs-tile-star,
      .cardImgWrap:hover .bcs-tile-star { opacity: 1; }
      .bcs-tile-star.on { opacity: 1; color: #f5a623; }
      .bcs-tile-star svg { width: 14px; height: 14px; }
      @media (max-width: 640px) {
        .bcs-modal-top { flex-direction: column; }
        .bcs-media { flex: none; width: 100%; }
      }
      .cardImgWrap { position: relative; }
      /* Seen = grey veil over the image; sits under the chip and star. */
      .cardImgWrap.bcs-seen::after {
        content: ""; position: absolute; inset: 0; z-index: 4;
        background: rgba(90, 90, 90, .55); pointer-events: none;
        border-radius: inherit;
      }
      .bcs-badges {
        position: absolute; top: 6px; left: 6px; z-index: 5;
        display: flex; gap: 4px; pointer-events: none;
      }
      .bcs-badge {
        padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700;
        background: rgba(0,0,0,.72); color: #fff; backdrop-filter: blur(2px);
        box-shadow: 0 1px 4px rgba(0,0,0,.35); letter-spacing: .5px;
      }
    `);

    const TAG_SHOW = 8;
    const VAR_SHOW = 3;
    const boothCache = new Map();
    const boothStore = persistentStore("booth", 24 * HOUR, 60);
    const getBoothItem = (id) =>
      memoized(
        boothCache,
        id,
        () =>
          fetchJson(`https://booth.pm/en/items/${id}.json`).then(
            ({ status, json }) => {
              if (status !== 200 || !json || !json.id) {
                throw new Error(`booth json ${status}`);
              }
              // Keep only the fields the modal renders — the raw payload runs
              // tens of KB per item and would bloat the persistent cache blob.
              return {
                id: json.id,
                name: json.name,
                url: json.url,
                price: json.price,
                wish_lists_count: json.wish_lists_count,
                shop: json.shop && {
                  name: json.shop.name,
                  url: json.shop.url,
                },
                category: json.category && {
                  name: json.category.name,
                  url: json.category.url,
                  parent: json.category.parent && {
                    name: json.category.parent.name,
                  },
                },
                tags: (json.tags || []).map((t) => ({
                  name: t.name,
                  url: t.url,
                })),
                images: (json.images || []).map((im) => ({
                  original: im.original,
                  resized: im.resized,
                })),
                variations: (json.variations || []).map((v) => ({
                  name: v.name,
                  price: v.price,
                })),
                description: json.description,
                factory_description: json.factory_description,
              };
            },
          ),
        boothStore,
      );

    // Render the item's purchasable variations (name + price) — booth.pm
    // items with >1 price tier (e.g. base + support) don't otherwise surface
    // that in the modal, which only shows the single `item.price` summary.
    // `overallPrice` is that summary string (e.g. "800 JPY~"), scraped only
    // for its currency suffix since each variation's own price is a bare
    // number.
    function renderVariations(container, variations, overallPrice) {
      container.innerHTML = "";
      const nextToggle = container.nextElementSibling;
      if (nextToggle && nextToggle.classList.contains("bcs-toggle")) {
        nextToggle.remove();
      }
      if (!variations || variations.length < 2) return;
      const currency = /([A-Z]{3})\s*~?$/.exec(overallPrice || "")?.[1];
      variations.forEach((v) => {
        const row = document.createElement("div");
        row.className = "bcs-var-item";
        const name = document.createElement("span");
        name.className = "bcs-var-name";
        name.textContent = v.name;
        const price = document.createElement("span");
        price.className = "bcs-var-price";
        price.textContent =
          typeof v.price === "number"
            ? `${v.price.toLocaleString()}${currency ? " " + currency : ""}`
            : String(v.price);
        row.append(name, price);
        container.appendChild(row);
      });

      if (variations.length > VAR_SHOW + 1) {
        const rows = [...container.children];
        const hidden = rows.slice(VAR_SHOW);
        const setHidden = (h) =>
          hidden.forEach((el) => el.classList.toggle("bcs-var-hidden", h));
        setHidden(true);

        const toggle = makeToggle();
        toggle.querySelector(".bcs-count").textContent = `共 ${variations.length} 件`;
        const label = toggle.querySelector(".bcs-label");
        const sync = (open) => {
          toggle.classList.toggle("is-open", open);
          label.textContent = open ? "收起商品" : `展开其余 ${hidden.length} 件`;
        };
        sync(false);
        toggle.addEventListener("click", () => {
          const open = hidden[0].classList.contains("bcs-var-hidden");
          setHidden(!open);
          sync(open);
        });
        container.insertAdjacentElement("afterend", toggle);
      }
    }

    // Shared by the product modal and the zoom overlay so stacking one on top
    // of the other behaves like a real stack: Escape/backdrop-click close, and
    // ArrowLeft/Right paging, are routed to the topmost overlay only. Each
    // overlay registers its own `onArrow` (image paging) via openOverlay, so
    // there's a single key dispatcher rather than per-overlay listeners.
    const overlayStack = [];
    document.addEventListener(
      "keydown",
      (e) => {
        if (!overlayStack.length) return;
        const top = overlayStack[overlayStack.length - 1];
        if (e.key === "Escape") {
          e.stopPropagation();
          top.close();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          if (!top.onArrow) return;
          e.stopPropagation();
          top.onArrow(e.key === "ArrowLeft" ? -1 : 1);
        }
      },
      true,
    );
    // Body scroll is locked while any overlay is up: saved when the stack
    // goes 0→1, restored when it empties — callers never touch overflow.
    let prevBodyOverflow = "";
    function openOverlay(el, { onClose, closeOnAnyClick, onArrow } = {}) {
      if (!overlayStack.length) {
        prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      const entry = {
        onArrow,
        close: () => {
          el.remove();
          const i = overlayStack.indexOf(entry);
          if (i !== -1) overlayStack.splice(i, 1);
          if (!overlayStack.length)
            document.body.style.overflow = prevBodyOverflow;
          onClose?.();
        },
      };
      overlayStack.push(entry);
      el.addEventListener("click", (e) => {
        if (closeOnAnyClick || e.target === el) entry.close();
      });
      document.body.appendChild(el);
      return entry.close;
    }

    // Prev/next arrow buttons, shared by the modal (.bcs-nav, inside the image)
    // and the zoom overlay (.bcs-znav, outside it). Builds a left(-1)/right(+1)
    // pair into `parent`, each wired to step(dir); clicks stopPropagation so a
    // backdrop close-on-click never fires. `cls` is the base class; each button
    // also gets `${cls}--left` / `${cls}--right`. Returns { left, right }.
    const NAV_ARROW = { left: "15 18 9 12 15 6", right: "9 18 15 12 9 6" };
    function buildNavPair(parent, cls, step) {
      const mk = (dir, side, label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `${cls} ${cls}--${side}`;
        btn.setAttribute("aria-label", label);
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${NAV_ARROW[side]}"></polyline></svg>`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          step(dir);
        });
        parent.appendChild(btn);
        return btn;
      };
      return { left: mk(-1, "left", "Previous image"), right: mk(1, "right", "Next image") };
    }

    function openModal(seed, { onClose } = {}) {
      const overlay = document.createElement("div");
      overlay.className = "bcs-overlay";
      const boothUrl = `https://booth.pm/items/${seed.id}`;
      // Booth records the view server-side (the item JSON fetch below carries
      // cookies); mark it locally too so the veil updates without a refetch.
      markSeen(seed.id);
      scheduleBadges();
      overlay.innerHTML = `
        <div class="bcs-modal" role="dialog" aria-modal="true">
          <div class="bcs-modal-top">
            <div class="bcs-media">
              <div class="bcs-img-stage">
                <img class="bcs-main-img" alt="">
                <span class="bcs-img-count" hidden></span>
              </div>
              <div class="bcs-thumbs" hidden></div>
            </div>
            <div class="bcs-info">
              <div class="bcs-title-row">
                <a class="bcs-title" target="_blank" rel="noopener noreferrer"></a>
                <button class="bcs-star" type="button" hidden aria-label="收藏"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
              </div>
              <div class="bcs-meta"></div>
              <div class="bcs-variations"></div>
              <div class="bcs-tags"></div>
              <a class="bcs-buy" target="_blank" rel="noopener noreferrer">去 Booth 购买</a>
            </div>
          </div>
          <div class="bcs-modal-desc bcs-dim">商品说明加载中…</div>
        </div>`;

      const mainImg = overlay.querySelector(".bcs-main-img");
      const stageEl = overlay.querySelector(".bcs-img-stage");
      const thumbs = overlay.querySelector(".bcs-thumbs");
      const countEl = overlay.querySelector(".bcs-img-count");
      const titleEl = overlay.querySelector(".bcs-title");
      const metaEl = overlay.querySelector(".bcs-meta");
      const varEl = overlay.querySelector(".bcs-variations");
      const tagsEl = overlay.querySelector(".bcs-tags");
      const descEl = overlay.querySelector(".bcs-modal-desc");

      // Seed with what the card already shows so the modal never opens blank.
      if (seed.img) mainImg.src = seed.img;
      titleEl.textContent = seed.title || `Booth #${seed.id}`;
      titleEl.href = boothUrl;
      overlay.querySelector(".bcs-buy").href = boothUrl;

      // Star = Booth wish list membership. Hidden until the id set resolves
      // (stays hidden if that fetch fails); optimistic toggle, reverted with
      // a hint on failure. Booth item pages get no script star — the native
      // button is already there.
      const starBtn = overlay.querySelector(".bcs-star");
      const paintStar = (on) => {
        starBtn.classList.toggle("on", on);
        starBtn.title = on ? "取消收藏（Booth スキ!）" : "收藏（Booth スキ!）";
      };
      getWishedIds()
        .then((set) => {
          starBtn.hidden = false;
          paintStar(set.has(String(seed.id)));
        })
        .catch(() => {});
      starBtn.addEventListener("click", () => {
        const on = !starBtn.classList.contains("on");
        paintStar(on);
        starBtn.disabled = true;
        setWished(seed.id, on)
          .then(() => scheduleBadges())
          .catch(() => {
            paintStar(!on);
            starBtn.title = "收藏失败（需登录 Booth？）";
          })
          .finally(() => {
            starBtn.disabled = false;
          });
      });

      // Multi-image nav: filled in once the Booth .json resolves (see below).
      // Dedicated left/right buttons page through images (only shown once
      // there's more than one); thumbnails below jump straight to a given
      // image; clicking the image itself opens a fullscreen zoom.
      let images = [];
      let thumbEls = [];
      let idx = 0;
      const showImage = (i) => {
        if (!images.length) return;
        thumbEls[idx]?.classList.remove("on");
        idx = (i + images.length) % images.length;
        mainImg.src = images[idx].original;
        countEl.textContent = `${idx + 1} / ${images.length}`;
        const activeThumb = thumbEls[idx];
        activeThumb?.classList.add("on");
        activeThumb?.scrollIntoView({ block: "nearest", inline: "nearest" });
      };
      const stepImage = (dir) => showImage(idx + dir);
      const nav = buildNavPair(stageEl, "bcs-nav", stepImage);
      nav.left.hidden = true;
      nav.right.hidden = true;
      mainImg.addEventListener("click", () => openZoom());
      function openZoom() {
        const src = images.length ? images[idx].original : mainImg.src;
        if (!src) return;
        const zoomOverlay = document.createElement("div");
        zoomOverlay.className = "bcs-zoom-overlay";
        // Fixed-size stage (see .bcs-zoom-stage) holds the contained image;
        // nav buttons pin to the stage edges so they stay put across images.
        const stage = document.createElement("div");
        stage.className = "bcs-zoom-stage";
        const img = document.createElement("img");
        img.className = "bcs-zoom-img";
        img.src = src;
        stage.appendChild(img);
        zoomOverlay.appendChild(stage);

        // The zoom pages through the same image list but keeps its OWN index so
        // it only repaints the visible zoom <img> — the occluded modal isn't
        // touched per step (no offscreen decode / thumb-strip reflow). The modal
        // is synced once on close so it lands on the last-viewed image.
        let zi = idx;
        let onArrow;
        if (images.length > 1) {
          const step = (dir) => {
            zi = (zi + dir + images.length) % images.length;
            img.src = images[zi].original;
          };
          buildNavPair(stage, "bcs-znav", step);
          onArrow = step;
        }

        openOverlay(zoomOverlay, {
          closeOnAnyClick: true,
          onArrow,
          onClose: () => {
            if (zi !== idx) showImage(zi);
          },
        });
      }

      const bar = buildSearchBar(seed.id);
      metaEl.insertAdjacentElement("afterend", bar);
      bar.autoCheck();

      openOverlay(overlay, { onArrow: stepImage, onClose });

      getBoothItem(seed.id)
        .then((item) => {
          if (!overlay.isConnected) return;
          titleEl.textContent = item.name;
          titleEl.href = item.url || boothUrl;
          overlay.querySelector(".bcs-buy").href = item.url || boothUrl;

          metaEl.innerHTML = "";
          if (item.shop && item.shop.name) {
            if (item.shop.url) {
              metaEl.appendChild(makeLink(item.shop.name, item.shop.url));
            } else {
              const s = document.createElement("span");
              s.textContent = item.shop.name;
              metaEl.appendChild(s);
            }
          }
          if (item.price) {
            const s = document.createElement("span");
            s.className = "bcs-price";
            s.textContent = item.price;
            metaEl.appendChild(s);
          }
          if (typeof item.wish_lists_count === "number") {
            const s = document.createElement("span");
            s.textContent = `♥ ${item.wish_lists_count}`;
            metaEl.appendChild(s);
          }
          if (item.category && item.category.name) {
            const text = item.category.parent
              ? `${item.category.parent.name} › ${item.category.name}`
              : item.category.name;
            metaEl.appendChild(makeLink(text, item.category.url || boothUrl));
          }

          tagsEl.innerHTML = "";
          const nextTagToggle = tagsEl.nextElementSibling;
          if (nextTagToggle && nextTagToggle.classList.contains("bcs-toggle")) {
            nextTagToggle.remove();
          }
          const tags = item.tags || [];
          tags.forEach((tg) => {
            tagsEl.appendChild(makeLink(tg.name, tg.url, "bcs-tag"));
          });
          if (tags.length > TAG_SHOW + 2) {
            const tagEls = [...tagsEl.children];
            const hidden = tagEls.slice(TAG_SHOW);
            const setHidden = (h) =>
              hidden.forEach((el) => el.classList.toggle("bcs-var-hidden", h));
            setHidden(true);

            const toggle = makeToggle();
            toggle.querySelector(".bcs-count").textContent = `共 ${tags.length} 个`;
            const label = toggle.querySelector(".bcs-label");
            const sync = (open) => {
              toggle.classList.toggle("is-open", open);
              label.textContent = open ? "收起标签" : `展开其余 ${hidden.length} 个标签`;
            };
            sync(false);
            toggle.addEventListener("click", () => {
              const open = hidden[0].classList.contains("bcs-var-hidden");
              setHidden(!open);
              sync(open);
            });
            tagsEl.insertAdjacentElement("afterend", toggle);
          }

          images = (item.images || []).filter((im) => im.original);
          if (images.length > 1) {
            countEl.hidden = false;
            nav.left.hidden = false;
            nav.right.hidden = false;
            thumbs.hidden = false;
            thumbEls = images.map((im, i) => {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "bcs-thumb";
              const t = document.createElement("img");
              t.src = im.resized || im.original;
              t.alt = "";
              t.loading = "lazy";
              b.appendChild(t);
              b.addEventListener("click", () => showImage(i));
              thumbs.appendChild(b);
              return b;
            });
          }
          showImage(0);

          renderVariations(varEl, item.variations, item.price);

          const desc = [item.description, item.factory_description]
            .filter(Boolean)
            .join("\n\n")
            .trim();
          descEl.classList.remove("bcs-dim");
          if (desc) {
            descEl.textContent = desc;
            collapseDesc(descEl, "hidden");
          } else {
            descEl.classList.add("bcs-dim");
            descEl.textContent = "（无商品说明）";
          }
        })
        .catch(() => {
          if (!overlay.isConnected) return;
          descEl.textContent =
            "商品说明加载失败（R18 商品需登录 Booth 后在官网查看）";
        });
    }

    // The site is a Solid.js SPA with delegated click handlers; a capture-phase
    // listener on document runs first, so stopping propagation here keeps the
    // native lightbox from opening. Survives re-renders since it's not bound to
    // card DOM. Cards without a recognizable booth item link fall through to
    // the site's own behavior.
    document.addEventListener(
      "click",
      (e) => {
        if (e.target.closest(".bcs-overlay")) return;
        const wrap = e.target.closest(".cardImgWrap");
        if (!wrap) return;
        // Buttons inside the image area (carousel arrows, R18 reveal, card
        // toggles…) keep their native behavior. Links do NOT bail: the site
        // wraps every slide image in an <a href> (whose default it prevents
        // itself), so treating <a> as "native UI" would swallow every click.
        if (e.target.closest("button")) return;
        const card = wrap.closest("li") || wrap.parentElement;
        const link =
          card && card.querySelector('a[href*="booth.pm"][href*="/items/"]');
        const m = link && link.href.match(/\/items\/(\d+)/);
        if (!m) return;
        e.preventDefault();
        e.stopPropagation();
        const img = wrap.querySelector("img");
        // The matched link may be the (text-less) slide-image anchor; the
        // card title lives in .cardTitle.
        const titleEl = card.querySelector(".cardTitle") || link;
        openModal({
          id: m[1],
          title: titleEl.textContent.trim(),
          img: img ? img.currentSrc || img.src : "",
        });
      },
      true,
    );

    // Wish-toggle star shared by history tiles and product cards: optimistic
    // .on flip, setWished, revert + hint on failure. `tag` is "span" inside a
    // history tile (the tile itself is a <button>; buttons don't nest) and
    // "button" on cards (the card click interceptor lets buttons through).
    // The item id rides on dataset so a badge pass can re-point a recycled
    // card's star without rebuilding it.
    function makeTileStar(id, tag, onDone) {
      const star = document.createElement(tag);
      if (tag === "button") star.type = "button";
      star.className = "bcs-tile-star";
      star.dataset.id = id;
      star.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
      star.addEventListener("click", (e) => {
        // Neither the site's delegated handlers nor the card interceptor
        // should react to a star click.
        e.preventDefault();
        e.stopPropagation();
        const on = !star.classList.contains("on");
        star.classList.toggle("on", on);
        setWished(star.dataset.id, on).then(
          () => onDone && onDone(),
          () => {
            star.classList.toggle("on", !on);
            star.title = "收藏失败（需登录 Booth？）";
          },
        );
      });
      return star;
    }

    // 已看 chip + wish star on product cards. The SPA re-renders freely, so a
    // body-level MutationObserver re-runs the pass (rAF-debounced: a burst
    // of mutations = one pass). The badge container's presence doubles as
    // the per-card "already processed" marker; hidden-toggles keep state
    // fresh without re-creating nodes. The star waits for the wish set; 已看
    // renders regardless.
    let wishedBadgeSet = null;
    let wishedBadgeFetch = false;
    const subscribeWished = () => {
      if (wishedBadgeFetch) return;
      wishedBadgeFetch = true;
      getWishedIds().then(
        (s) => {
          wishedBadgeSet = s;
          scheduleBadges();
        },
        () => {
          wishedBadgeFetch = false; // retry from a later badge pass
        },
      );
    };
    subscribeWished();
    // Same lazy-retry subscription for the seen set (server history).
    let histLoaded = false;
    let histFetch = false;
    const subscribeHistory = () => {
      if (histFetch) return;
      histFetch = true;
      getHistory().then(
        () => {
          histLoaded = true;
          scheduleBadges();
        },
        () => {
          histFetch = false; // retry from a later badge pass
        },
      );
    };
    subscribeHistory();
    let badgeQueued = false;
    function scheduleBadges() {
      if (badgeQueued) return;
      badgeQueued = true;
      requestAnimationFrame(() => {
        badgeQueued = false;
        if (!wishedBadgeSet) subscribeWished();
        if (!histLoaded) subscribeHistory();
        const seen = histData.ids;
        document.querySelectorAll(".cardImgWrap").forEach((wrap) => {
          const card = wrap.closest("li") || wrap.parentElement;
          const link =
            card && card.querySelector('a[href*="booth.pm"][href*="/items/"]');
          const m = link && link.href.match(/\/items\/(\d+)/);
          if (!m) return;
          let box = wrap.querySelector(".bcs-badges");
          if (!box) {
            box = document.createElement("div");
            box.className = "bcs-badges";
            box.innerHTML = '<span class="bcs-badge">已看</span>';
            wrap.appendChild(box);
          }
          let star = wrap.querySelector(".bcs-tile-star");
          if (!star) {
            star = makeTileStar(m[1], "button", scheduleBadges);
            wrap.appendChild(star);
          }
          star.dataset.id = m[1]; // the SPA may recycle the wrap for another item
          // Seen = grey veil over the whole image (class + ::after) plus the
          // chip — the veil reads at grid-scan distance, the chip labels why.
          wrap.classList.toggle("bcs-seen", seen.has(m[1]));
          box.children[0].hidden = !seen.has(m[1]);
          // The star doubles as the wished indicator: hidden until the wish
          // set resolves (same rule as the modal star), then constant gold
          // when wished, hover-revealed when not.
          star.hidden = !wishedBadgeSet;
          star.classList.toggle(
            "on",
            !!(wishedBadgeSet && wishedBadgeSet.has(m[1])),
          );
        });
      });
    }
    new MutationObserver(scheduleBadges).observe(document.body, {
      childList: true,
      subtree: true,
    });
    scheduleBadges();

    // "Recently viewed" panel behind a fixed corner button. Reuses the
    // overlay stack + .bcs-modal shell; a grid entry reopens the product
    // modal with the stored seed (same shape a card click produces).
    function openHistory() {
      const overlay = document.createElement("div");
      overlay.className = "bcs-overlay";
      const modal = document.createElement("div");
      modal.className = "bcs-modal";
      modal.innerHTML = '<div class="bcs-hist-head"><span>最近看过</span></div>';
      overlay.appendChild(modal);

      const filterWrap = document.createElement("div");
      filterWrap.className = "bcs-filter-wrap";
      const filter = document.createElement("input");
      filter.type = "search";
      filter.className = "bcs-hist-filter";
      filter.placeholder = "筛选标题/店铺…";
      filterWrap.appendChild(filter);
      modal.firstElementChild.appendChild(filterWrap);

      // Clear-all for the server-side history. Destructive and irreversible
      // (wipes the whole account's viewed list on Booth, not just this
      // panel), so it arms on first click and only fires on a second click
      // within 3s. Lives in the 最近 section header (render() re-appends it
      // there) so its blast radius reads as that list only, not the wish
      // strip; render() appends it only when the list is non-empty.
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "bcs-hist-clear";
      const CLEAR_LABEL = "清空记录";
      clearBtn.textContent = CLEAR_LABEL;
      let armTimer = 0;
      const disarm = () => {
        clearTimeout(armTimer);
        clearBtn.classList.remove("armed");
        clearBtn.textContent = CLEAR_LABEL;
      };
      const scheduleDisarm = () => {
        clearTimeout(armTimer);
        armTimer = setTimeout(disarm, 3000);
      };
      clearBtn.addEventListener("click", () => {
        if (clearBtn.disabled) return;
        if (!clearBtn.classList.contains("armed")) {
          clearBtn.classList.add("armed");
          clearBtn.textContent = "确认清空？";
          scheduleDisarm();
          return;
        }
        clearTimeout(armTimer);
        clearBtn.disabled = true;
        clearBtn.textContent = "清空中…";
        clearHistory()
          .then(
            () => {
              disarm();
              render(); // shows 暂无浏览记录, drops the button
              scheduleBadges(); // card veils come off
            },
            () => {
              clearBtn.classList.remove("armed");
              clearBtn.textContent = "清空失败";
              scheduleDisarm();
            },
          )
          .finally(() => {
            clearBtn.disabled = false;
          });
      });

      // Past filter queries (GM-stored, deduped, capped) show in a custom
      // dropdown on focus, each row with a ✕ to forget it. Saved after the
      // user pauses typing (plus immediately on Enter or a tile click), so
      // prefixes don't pile up per keystroke. No-ops without storage grants.
      const FILTER_HIST_KEY = "bcs-filter-history";
      const readFilterHist = () => {
        const list = canStore ? gmReadJson(FILTER_HIST_KEY, []) : [];
        return Array.isArray(list) ? list : [];
      };
      const saveFilterHist = (raw) => {
        const q = (raw || "").trim();
        if (!canStore || !q) return;
        gmWriteJson(
          FILTER_HIST_KEY,
          [q, ...readFilterHist().filter((s) => s !== q)].slice(0, 10),
        );
      };
      const drop = document.createElement("div");
      drop.className = "bcs-filter-drop";
      drop.hidden = true;
      filterWrap.appendChild(drop);
      const renderDrop = () => {
        const list = readFilterHist();
        drop.innerHTML = "";
        drop.hidden = !list.length;
        for (const q of list) {
          const row = document.createElement("div");
          row.className = "bcs-filter-row";
          const text = document.createElement("span");
          text.className = "q";
          text.textContent = q;
          const del = document.createElement("button");
          del.type = "button";
          del.className = "bcs-filter-del";
          del.setAttribute("aria-label", "删除搜索记录");
          del.textContent = "✕";
          del.addEventListener("click", (e) => {
            e.stopPropagation();
            gmWriteJson(FILTER_HIST_KEY, readFilterHist().filter((s) => s !== q));
            renderDrop(); // hides itself when the list empties
          });
          row.addEventListener("click", () => {
            filter.value = q;
            saveFilterHist(q); // bump to front
            applyFilter();
            drop.hidden = true;
          });
          row.append(text, del);
          drop.appendChild(row);
        }
      };
      filter.addEventListener("focus", renderDrop);
      filter.addEventListener("click", renderDrop);
      let saveTimer = 0;
      filter.addEventListener("input", () => {
        applyFilter();
        drop.hidden = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveFilterHist(filter.value), 1200);
      });
      filter.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          clearTimeout(saveTimer);
          saveFilterHist(filter.value);
        } else if (e.key === "Escape" && !drop.hidden) {
          // Swallow: close just the dropdown, not the whole panel.
          e.stopPropagation();
          drop.hidden = true;
        }
      });
      overlay.addEventListener("mousedown", (e) => {
        if (!filterWrap.contains(e.target)) drop.hidden = true;
      });

      const applyFilter = () => {
        const q = filter.value.trim().toLowerCase();
        modal.querySelectorAll(".bcs-hist-item").forEach((el) => {
          el.style.display = !q || (el.dataset.ft || "").includes(q) ? "" : "none";
        });
      };

      openOverlay(overlay);

      let wished = null; // Set<string> once resolved; null = unknown/hidden
      let wishInfo = null; // Map<id, {id,title,img,price,shop}> from the endpoint
      let histState = "loading"; // "loading" | "ok" | "fail"
      // fresh: both lists live on Booth's servers now — refetch on every
      // open so likes/views made on booth.pm show up without a page reload.
      getWishList(true)
        .then((w) => {
          wished = w.ids;
          wishInfo = w.byId;
          render();
          scheduleBadges(); // card ★s may have changed too
        })
        .catch(() => render());
      getHistory(true)
        .then(() => {
          histState = "ok";
          render();
          scheduleBadges();
        })
        .catch(() => {
          histState = "fail";
          render();
        });

      // One tile for either section. `entry` needs {id,title,img,price,shop}.
      const makeTile = (entry) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "bcs-hist-item";
        item.dataset.ft = `${entry.title || ""} ${entry.shop || ""}`.toLowerCase();
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        // Grid-sized variant; also normalizes entries written before the
        // canonical-URL change (which stored a baked 72px variant).
        if (entry.img) img.src = boothImgVariant(entry.img, HIST_IMG_SPEC);
        // Star anchors to this wrapper, not the tile: tile heights vary
        // (title lines, optional meta/date), the square thumb never does.
        const thumb = document.createElement("div");
        thumb.className = "bcs-hist-thumb";
        thumb.appendChild(img);
        const title = document.createElement("div");
        title.className = "ht";
        title.textContent = entry.title || `Booth #${entry.id}`;
        const meta = document.createElement("div");
        meta.className = "hm";
        meta.textContent = [entry.shop, entry.price].filter(Boolean).join(" · ");
        meta.hidden = !meta.textContent;
        item.append(thumb, title, meta);
        if (wished) {
          const star = makeTileStar(entry.id, "span", () => {
            render(); // moves the tile between sections
            scheduleBadges();
          });
          star.classList.toggle("on", wished.has(String(entry.id)));
          thumb.appendChild(star);
        }
        item.addEventListener("click", () => {
          // A query that led to opening something earned a history slot.
          saveFilterHist(filter.value);
          // Stack the product modal ON TOP of the history panel (the
          // overlay stack routes Escape/backdrop to the topmost), so
          // closing the modal returns to the list instead of the page.
          // Seed with the full-size image (strip legacy baked variants) —
          // the modal stage is far larger than a grid cell — and re-render
          // the grid on close since the visit just reordered it.
          openModal(
            { id: entry.id, title: entry.title, img: boothImgVariant(entry.img) },
            { onClose: render },
          );
        });
        return item;
      };

      const WISH_SHOW = 12;
      const render = () => {
        modal
          .querySelectorAll(".bcs-hist-grid, .bcs-hist-empty, .bcs-hist-sub, .bcs-toggle")
          .forEach((el) => el.remove());
        const list = histData.list;
        const hasWish = !!(wished && wished.size);

        // Both lists need a Booth session; the wish endpoint's 401 is the
        // only reliable logged-out signal (history.json returns [] either
        // way), so one hint replaces both sections.
        if (wishData.loggedOut) {
          const empty = document.createElement("div");
          empty.className = "bcs-hist-empty";
          empty.textContent = "未登录 Booth — 登录后这里会显示最近看过与收藏";
          modal.appendChild(empty);
          return;
        }

        // 收藏 strip: ids straight from the wish set (newest-first as the
        // endpoint returned them). Tile data comes with the wish response
        // itself (falling back to the history entry for an id just starred
        // this page load, which the memoized response doesn't know about).
        if (hasWish) {
          const byId = new Map(list.map((e) => [String(e.id), e]));
          const sub = document.createElement("div");
          sub.className = "bcs-hist-sub";
          sub.textContent = "★ 收藏";
          modal.appendChild(sub);
          const wgrid = document.createElement("div");
          wgrid.className = "bcs-hist-grid";
          const tiles = [...wished].map((id) => {
            const known =
              (wishInfo && wishInfo.get(id)) || byId.get(id) || { id, title: "", img: "" };
            const tile = makeTile(known);
            wgrid.appendChild(tile);
            return tile;
          });
          modal.appendChild(wgrid);
          if (tiles.length > WISH_SHOW) {
            const hiddenTiles = tiles.slice(WISH_SHOW);
            const setHidden = (h) =>
              hiddenTiles.forEach((el) => el.classList.toggle("bcs-var-hidden", h));
            setHidden(true);
            const toggle = makeToggle();
            toggle.querySelector(".bcs-count").textContent = `共 ${tiles.length} 件`;
            const label = toggle.querySelector(".bcs-label");
            const sync = (open) => {
              toggle.classList.toggle("is-open", open);
              label.textContent = open ? "收起收藏" : `展开其余 ${hiddenTiles.length} 件`;
            };
            sync(false);
            toggle.addEventListener("click", () => {
              const open = hiddenTiles[0].classList.contains("bcs-var-hidden");
              setHidden(!open);
              sync(open);
            });
            wgrid.insertAdjacentElement("afterend", toggle);
          }
        }

        // 最近 header row also hosts the clear button (re-appended each
        // render — the node persists so its armed/disabled state survives;
        // appending only on a non-empty list is what hides it otherwise).
        // Header only when there is something to separate or clear.
        if (hasWish || list.length) {
          const sub2 = document.createElement("div");
          sub2.className = "bcs-hist-sub bcs-hist-sub-row";
          const label = document.createElement("span");
          label.textContent = "最近";
          sub2.append(label);
          if (list.length) sub2.append(clearBtn);
          modal.appendChild(sub2);
        }

        if (!list.length) {
          const empty = document.createElement("div");
          empty.className = "bcs-hist-empty";
          empty.textContent =
            histState === "loading"
              ? "加载中…"
              : histState === "fail"
                ? "历史加载失败，稍后再试"
                : "暂无浏览记录";
          modal.appendChild(empty);
          applyFilter();
          return;
        }
        const grid = document.createElement("div");
        grid.className = "bcs-hist-grid";
        for (const entry of list) grid.appendChild(makeTile(entry));
        modal.appendChild(grid);
        applyFilter();
      };
      render();
    }

    // History lives on Booth's servers now, so the entry point needs no
    // storage grant; logged out, the panel shows its own login hint.
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "bcs-hist-fab";
    fab.title = "最近看过";
    fab.setAttribute("aria-label", "最近看过");
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>';
    fab.addEventListener("click", openHistory);
    document.body.appendChild(fab);
  }

  // ---------------------------------------------------------------- entry

  if (location.hostname === "vrcatalogue.com") {
    initVrcatalogue();
  } else {
    initBooth();
  }
})();
