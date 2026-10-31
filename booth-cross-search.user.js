// ==UserScript==
// @name         Booth Cross Search (VRCPirate / RipperStore)
// @namespace    booth-cross-search
// @version      3.0.2
// @description  在 Booth 商品页与 BoothDex 商品详情中查询 VRCPirate / RipperStore 同 ID 资源。
// @author       MelodyBomber
// @match        *://booth.pm/*items/*
// @match        *://*.booth.pm/*items/*
// @match        *://boothdex.ihtw.moe/*
// @connect      api-v3.vrcpirate.com
// @connect      forum.ripper.store
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js
// @downloadURL  https://github.com/JohnsonRan/BoothCrossSearch/raw/main/booth-cross-search.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ---------------------------------------------------------------- shared

  function addStyle(css) {
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // Token names follow BoothDex's shadcn variables (--popover, --foreground,
  // --muted-foreground, --accent, --muted, --border, --warning); none of them
  // are defined on booth.pm, so booth.pm falls through to the light hex
  // defaults while BoothDex adapts to both its light and dark themes.
  addStyle(`
    .bcs-bar {
      position: relative; display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; align-items: center;
      font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif;
    }
    [role="dialog"] .bcs-bar {
      margin: 0 0 1rem; font-family: inherit;
    }
    .bcs-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; font-family: inherit;
      cursor: pointer; border: 1px solid var(--border, #dcdcdc);
      color: var(--foreground, #222); background: var(--popover, #fff);
      line-height: 1.4; transition: background .15s, border-color .15s;
    }
    .bcs-btn:hover { background: var(--accent, #f5f5f5); border-color: var(--border, #c8c8c8); }
    .bcs-btn:active { background: var(--muted, #ececec); }
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
      background: var(--muted, #efefef); color: var(--muted-foreground, #777);
    }
    .bcs-btn .bcs-cnt[hidden] { display: none; }
    .bcs-warn { font-size: 11px; color: var(--warning, #b8860b); font-weight: 600; text-decoration: none; }
    .bcs-warn:hover { text-decoration: underline; }
    .bcs-panel {
      position: fixed; z-index: 100001;
      background: var(--popover, #fff); border: 1px solid var(--border, #ddd); border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,.22);
      min-width: 280px; max-width: min(420px, calc(100vw - 16px)); max-height: 320px; overflow-y: auto;
      overscroll-behavior: contain; box-sizing: border-box; font-family: inherit;
    }
    .bcs-panel-item {
      display: block; padding: 8px 10px; border-bottom: 1px solid var(--border, #eee);
      text-decoration: none; color: var(--foreground, #222);
    }
    .bcs-panel-item:last-child { border-bottom: none; }
    .bcs-panel-item:hover { background: var(--accent, #f5f5f5); }
    .bcs-panel-item .t { font-size: 13px; font-weight: 600; display: block; }
    .bcs-panel-item .s { font-size: 11px; color: var(--muted-foreground, #888); }
    .bcs-panel-empty { padding: 10px; font-size: 13px; color: var(--muted-foreground, #888); }
    .bcs-desc.bcs-collapsed { max-height: 240px !important; overflow: hidden !important; position: relative; }
    .bcs-desc.bcs-collapsed::after {
      content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 90px;
      background: linear-gradient(rgba(0,0,0,0), var(--popover, #fff) 85%); pointer-events: none;
    }
    .bcs-toggle {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; margin: 12px 0 4px; padding: 10px 16px;
      border: 1px solid var(--border, #e4e4e7); border-radius: 10px; background: var(--popover, #fafafa);
      color: var(--foreground, #222); cursor: pointer; font-size: 13px; font-weight: 700; line-height: 1.4;
      font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif;
      transition: background .15s, border-color .15s, box-shadow .15s, transform .05s;
    }
    .bcs-toggle:hover { background: var(--accent, #f4f4f5); border-color: var(--border, #d4d4d8); box-shadow: 0 1px 5px rgba(0,0,0,.06); }
    .bcs-toggle:active { transform: translateY(1px); }
    .bcs-toggle .bcs-count { color: var(--muted-foreground, #888); font-weight: 600; }
    .bcs-toggle .bcs-chev { font-size: 10px; transition: transform .2s ease; }
    .bcs-toggle.is-open .bcs-chev { transform: rotate(180deg); }
    .bcs-var-hidden { display: none !important; }
  `);

  // One reused textarea rather than one allocation per call — the RipperStore
  // panel decodes 1-2 strings per result row.
  const entityDecoder = document.createElement("textarea");
  function decodeEntities(str) {
    entityDecoder.innerHTML = str;
    return entityDecoder.value;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
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

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 10000,
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function fetchJson(url) {
    return gmGet(url).then((res) => {
      try {
        return {
          status: res.status,
          json: JSON.parse(res.responseText || "null"),
        };
      } catch {
        throw new Error(`invalid json ${res.status}`);
      }
    });
  }

  // GM value storage may be missing entirely (manager without the grant, or
  // an older installed script version whose header lacked it) — persistence
  // degrades to in-memory per-tab caching rather than breaking search.
  const canStore =
    typeof GM_getValue === "function" && typeof GM_setValue === "function";

  function gmReadJson(key, fallback) {
    try {
      return JSON.parse(GM_getValue(key, "null")) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function gmWriteJson(key, value) {
    try {
      GM_setValue(key, JSON.stringify(value));
    } catch {
      /* storage full/unavailable — degrade to memory-only */
    }
  }

  // Coalesce bursty GM writes into one stringify per key; flush immediately
  // when the tab hides or unloads.
  const STORE_FLUSH_MS = 400;
  const pendingGmWrites = new Map(); // key -> { value, timer }
  function gmWriteJsonDeferred(key, value) {
    if (!canStore) return;
    let entry = pendingGmWrites.get(key);
    if (!entry) {
      entry = { value: null, timer: 0 };
      pendingGmWrites.set(key, entry);
    }
    entry.value = value;
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      pendingGmWrites.delete(key);
      gmWriteJson(key, entry.value);
    }, STORE_FLUSH_MS);
  }
  function flushGmWrites() {
    if (!pendingGmWrites.size) return;
    for (const [key, entry] of pendingGmWrites) {
      clearTimeout(entry.timer);
      gmWriteJson(key, entry.value);
    }
    pendingGmWrites.clear();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushGmWrites();
  });
  window.addEventListener("pagehide", flushGmWrites);

  function evictOldest(map, max) {
    const ids = Object.keys(map);
    if (ids.length <= max) return;
    ids.sort((a, b) => (map[a].t || 0) - (map[b].t || 0));
    ids.slice(0, ids.length - max).forEach((old) => delete map[old]);
  }

  // TTL'd per-item cache persisted as one JSON blob per source under a
  // `bcs-cache-<name>` GM value. Expired entries are pruned on first load and
  // re-checked on every read; `max` caps blob size by evicting oldest entries.
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
        const map = load();
        const entry = map[id];
        if (!entry) return undefined;
        if (Date.now() - entry.t > ttl) {
          delete map[id];
          return undefined;
        }
        return entry.d;
      },
      set(id, d) {
        const map = load();
        map[id] = { t: Date.now(), d };
        evictOldest(map, max);
        gmWriteJsonDeferred(key, map);
      },
    };
  }

  // Results memoize per item id on a shared in-flight promise so an auto-check
  // and a later button click never fire the same request twice; a failure
  // clears the cache so the next click can retry. Only fulfilled results are
  // persisted, so RipperStore's "not-authorised" never outlives a login.
  function memoized(map, id, run, store) {
    if (map.has(id)) return map.get(id);

    // Store hits are not memoized and persisted results leave the memo map,
    // so the store's per-read TTL check also covers long-lived tabs. Only
    // in-flight (or unpersistable, e.g. no GM grants) promises stay here.
    const hit = store && store.get(id);
    if (hit !== undefined) return Promise.resolve(hit);

    const promise = run().then(
      (d) => {
        if (store) {
          store.set(id, d);
          if (store.get(id) !== undefined) map.delete(id);
        }
        return d;
      },
      (e) => {
        map.delete(id);
        throw e;
      },
    );
    map.set(id, promise);
    return promise;
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
          `https://api-v3.vrcpirate.com/assets?page=1&search=${encodeURIComponent(itemId)}&searchBy=boothID`,
        ).then(({ status, json }) => {
          if (status !== 200 || !Array.isArray(json?.data)) {
            throw new Error(`vrcp ${status}`);
          }
          return json.data.filter((a) => String(a.boothID) === itemId);
        }),
      vrcpStore,
    );
  }

  const ripperCache = new Map();
  const ripperStore = persistentStore("ripper", 6 * HOUR, 120);
  function getRipperResult(itemId) {
    return memoized(
      ripperCache,
      itemId,
      () => {
        const params = new URLSearchParams({
          in: "titlesposts",
          term: itemId,
          matchWords: "all",
          by: "",
          categories: "",
          searchChildren: "false",
          hasTags: "",
          replies: "",
          repliesFilter: "atleast",
          timeFilter: "newer",
          timeRange: "",
          sortBy: "relevance",
          sortDirection: "desc",
          showAs: "posts",
          _: String(Date.now()),
        });
        const url = `https://forum.ripper.store/api/search?${params}`;
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
      },
      ripperStore,
    );
  }

  const RETRY_MSG = "查询失败，点击重试";
  const RIPPER_LOGIN_MSG = "请先登录 RipperStore";
  function classifyRipperError(e) {
    if (e && e.notAuthorised) {
      return { auth: true, message: RIPPER_LOGIN_MSG };
    }
    return { auth: false, message: RETRY_MSG };
  }

  // At most one search result panel. Radix's DismissableLayer listens for
  // Escape on `document` in the capture phase, so whichever registered first
  // wins there; `window` capture runs before any document listener regardless
  // of order, letting Escape close this panel without dismissing the dialog.
  let activeSearchPanel = null;
  function closePanels() {
    if (activeSearchPanel) activeSearchPanel.close();
  }
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !activeSearchPanel) return;
      if (!activeSearchPanel.panel.isConnected) {
        activeSearchPanel.close();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      activeSearchPanel.close();
    },
    true,
  );

  function showPanel(bar, entries, emptyMessage) {
    closePanels();
    const panel = document.createElement("div");
    panel.className = "bcs-panel";
    panel.setAttribute("role", "listbox");
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "bcs-panel-empty";
      empty.textContent = emptyMessage || "没有找到匹配结果";
      panel.appendChild(empty);
    } else {
      for (const e of entries) {
        const a = makeLink("", e.url, "bcs-panel-item");
        a.setAttribute("role", "option");
        const title = document.createElement("span");
        title.className = "t";
        title.textContent = e.title;
        const sub = document.createElement("span");
        sub.className = "s";
        if (e.sub) sub.textContent = e.sub;
        a.append(title, sub);
        panel.appendChild(a);
      }
    }
    // Inside BoothDex's Radix Dialog, mount into the dialog itself rather than
    // document.body: Radix sets body pointer-events:none, locks outside wheel
    // scroll (RemoveScroll), and treats outside pointerdowns as dialog-dismiss.
    const dialog = bar.closest('[role="dialog"]');
    if (dialog) panel.style.position = "absolute";
    (dialog || document.body).appendChild(panel);
    let closed = false;
    const close = () => {
      closed = true;
      panel.remove();
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (activeSearchPanel && activeSearchPanel.panel === panel) {
        activeSearchPanel = null;
      }
    };
    function place() {
      if (!panel.isConnected || !bar.isConnected) {
        close();
        return;
      }
      const r = bar.getBoundingClientRect();
      let originX = 0;
      let originY = 0;
      let boxW = window.innerWidth;
      let boxH = window.innerHeight;
      if (dialog) {
        const hr = dialog.getBoundingClientRect();
        originX = hr.left + dialog.clientLeft;
        originY = hr.top + dialog.clientTop;
        boxW = dialog.clientWidth;
        boxH = dialog.clientHeight;
      }
      if (r.bottom <= originY || r.top >= originY + boxH) {
        close();
        return;
      }
      const maxH = Math.min(320, Math.max(140, boxH * 0.45));
      panel.style.maxHeight = `${maxH}px`;
      const width = Math.min(
        Math.max(280, r.width),
        Math.min(420, boxW - 16),
      );
      panel.style.width = `${width}px`;
      const ph = panel.offsetHeight;
      const barLeft = r.left - originX;
      const barTop = r.top - originY;
      const barBottom = r.bottom - originY;
      const left = Math.max(8, Math.min(barLeft, boxW - width - 8));
      let top = barBottom + 4;
      if (top + ph > boxH - 8) {
        const above = barTop - ph - 4;
        top = above >= 8 ? above : Math.max(8, boxH - ph - 8);
      }
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
    const onDocClick = (ev) => {
      if (!panel.contains(ev.target)) close();
    };
    activeSearchPanel = { panel, close };
    // Listeners go in before the first place(): it may close() immediately
    // (detached/offscreen bar), and close() must find them to remove them.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    place();
    // Defer so the opening click doesn't immediately dismiss the panel.
    setTimeout(() => {
      if (!closed) document.addEventListener("click", onDocClick);
    }, 0);
  }

  // The VRCPirate/RipperStore button bar, shared by the Booth item page and
  // BoothDex's item detail dialog. Buttons start disabled until autoCheck()
  // confirms reachability/login state.
  function buildSearchBar(itemId) {
    const bar = document.createElement("div");
    bar.className = "bcs-bar";
    bar.dataset.itemId = itemId;

    function resultTitle(n) {
      if (!n) return "未找到匹配结果";
      if (n === 1) return "找到 1 条 · 点击打开";
      return `找到 ${n} 条 · 点击查看`;
    }
    function setResult(btn, dot, cnt, n) {
      dot.className = `dot ${n ? "ok" : "none"}`;
      cnt.hidden = n < 2;
      cnt.textContent = n;
      btn.title = resultTitle(n);
    }

    function makeSearchButton(className, label, title) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bcs-btn ${className}`;
      button.disabled = true;
      button.title = title;
      button.innerHTML = `<span class="dot pending"></span>${label}<span class="bcs-cnt" hidden></span>`;
      return {
        button,
        dot: button.querySelector(".dot"),
        count: button.querySelector(".bcs-cnt"),
      };
    }

    const vrcp = makeSearchButton("vrcp", "VRCPirate", "加载中…");
    const vrcpBtn = vrcp.button;
    vrcpBtn.addEventListener("click", async () => {
      closePanels();
      vrcpBtn.disabled = true;
      try {
        const matches = await getVrcpMatches(itemId);
        setResult(vrcpBtn, vrcp.dot, vrcp.count, matches.length);
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
              sub: `${a.downloads} 次下载`,
              url: `https://vrcpirate.com/iviewer/${a.id}`,
            })),
          );
        }
      } catch {
        vrcp.dot.className = "dot error";
        vrcpBtn.title = RETRY_MSG;
        showPanel(bar, [], RETRY_MSG);
      } finally {
        vrcpBtn.disabled = false;
      }
    });

    const ripper = makeSearchButton("ripper", "RipperStore", "检测登录状态中…");
    const ripperBtn = ripper.button;
    ripperBtn.addEventListener("click", async () => {
      closePanels();
      ripperBtn.disabled = true;
      try {
        const posts = await getRipperResult(itemId);
        setResult(ripperBtn, ripper.dot, ripper.count, posts.length);
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
        ripper.dot.className = `dot ${auth ? "none" : "error"}`;
        ripperBtn.title = message;
        showPanel(bar, [], message);
      } finally {
        ripperBtn.disabled = false;
      }
    });

    bar.appendChild(vrcpBtn);
    bar.appendChild(ripperBtn);

    function addWarn(text, url) {
      bar.appendChild(makeLink(text, url, "bcs-warn"));
    }

    bar.autoCheck = () => {
      vrcpBtn.disabled = false;
      vrcpBtn.title = "查询中…";
      getVrcpMatches(itemId)
        .then((matches) => {
          setResult(vrcpBtn, vrcp.dot, vrcp.count, matches.length);
        })
        .catch(() => {
          vrcp.dot.className = "dot error";
          vrcpBtn.title = RETRY_MSG;
        });
      getRipperResult(itemId)
        .then((posts) => {
          ripperBtn.disabled = false;
          setResult(ripperBtn, ripper.dot, ripper.count, posts.length);
        })
        .catch((e) => {
          const { auth, message } = classifyRipperError(e);
          ripper.dot.className = `dot ${auth ? "none" : "error"}`;
          ripperBtn.title = message;
          if (auth) {
            addWarn("⚠ 未登录 RipperStore", "https://forum.ripper.store/login");
          } else {
            ripperBtn.disabled = false;
          }
        });
    };

    return bar;
  }

  // ---------------------------------------------------------------- booth.pm

  function makeToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcs-toggle";
    btn.innerHTML =
      '<span class="bcs-label"></span><span class="bcs-count"></span><span class="bcs-chev">▾</span>';
    return btn;
  }

  function attachOverflowToggle(items, show, anchor, labels, onExpand) {
    const hidden = items.slice(show);
    const setHidden = (h) =>
      hidden.forEach((el) => el.classList.toggle("bcs-var-hidden", h));
    setHidden(true);
    const toggle = makeToggle();
    toggle.querySelector(".bcs-count").textContent = labels.count;
    const label = toggle.querySelector(".bcs-label");
    const sync = (open) => {
      toggle.classList.toggle("is-open", open);
      label.textContent = open ? labels.collapse : labels.expand(hidden.length);
    };
    sync(false);
    toggle.addEventListener("click", () => {
      const wasHidden = hidden[0].classList.contains("bcs-var-hidden");
      setHidden(!wasHidden);
      sync(wasHidden);
      if (wasHidden && onExpand) onExpand();
    });
    anchor.insertAdjacentElement("afterend", toggle);
    return toggle;
  }

  const VAR_SHOW = 3;
  const DESC_PREVIEW = 240;
  const DESC_SLACK = 60;

  function collapseDesc(desc) {
    if (desc.scrollHeight <= DESC_PREVIEW + DESC_SLACK) return null;
    desc.classList.add("bcs-desc", "bcs-collapsed");
    const toggle = makeToggle();
    const label = toggle.querySelector(".bcs-label");
    const sync = () => {
      const open = !desc.classList.contains("bcs-collapsed");
      toggle.classList.toggle("is-open", open);
      label.textContent = open ? "收起商品说明" : "展开商品说明";
    };
    sync();
    toggle.addEventListener("click", () => {
      const collapsing = !desc.classList.contains("bcs-collapsed");
      desc.classList.toggle("bcs-collapsed");
      sync();
      if (collapsing) desc.scrollIntoView({ block: "nearest" });
    });
    desc.insertAdjacentElement("afterend", toggle);
    return toggle;
  }

  function initBooth() {
    const idMatch = location.pathname.match(/\/items\/(\d+)/);
    if (!idMatch) return;
    const itemId = idMatch[1];

    const ogMeta = (p) =>
      document.querySelector(`meta[property="og:${p}"]`)?.content || "";

    function findDescCandidates() {
      const legacy = [...document.querySelectorAll(".my-40")].find((el) =>
        el.querySelector(".shop__text"),
      );
      if (legacy) return [legacy];
      return [...document.querySelectorAll(".description")].filter(
        (el) =>
          !el.classList.contains("for_mobile") &&
          el.querySelector(".shop__text"),
      );
    }

    let descCandidates = null;
    function setupDescCollapse() {
      if (!descCandidates || !descCandidates.length) {
        descCandidates = findDescCandidates();
      }
      if (!descCandidates.length) return false;
      return descCandidates.every((desc) => {
        if (desc.dataset.bcsCollapse) return true;
        if (desc.offsetParent === null) return true;
        if (desc.scrollHeight <= DESC_PREVIEW + DESC_SLACK) return false;
        desc.dataset.bcsCollapse = "1";
        collapseDesc(desc);
        return true;
      });
    }

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
      attachOverflowToggle(
        items,
        VAR_SHOW,
        box,
        {
          count: `共 ${items.length} 件`,
          collapse: "收起商品",
          expand: (n) => `展开其余 ${n} 件`,
        },
        () => box.scrollIntoView({ block: "nearest" }),
      );
      return true;
    }

    const normalizeTitleText = (text) =>
      (text || "").replace(/\s+/g, " ").trim();

    function findTitleEl() {
      const wanted = normalizeTitleText(ogMeta("title") || document.title);
      const itemTitle = normalizeTitleText(wanted.split(" - ")[0]);
      const matchesTitle = (el) => {
        const t = normalizeTitleText(el.textContent);
        return (
          t &&
          (t === wanted ||
            t === itemTitle ||
            (itemTitle && t.startsWith(itemTitle)))
        );
      };

      const detailHeader = document.querySelector("#js-item-info-detail header");
      if (detailHeader) {
        const heads = [...detailHeader.querySelectorAll("h1, h2, h3")];
        return heads.find(matchesTitle) || heads[0] || null;
      }

      const heads = [...document.querySelectorAll("h1, h2, h3")];
      return heads.find(matchesTitle) || null;
    }

    function insertBar() {
      if (document.querySelector(".bcs-bar")) return true;
      const titleEl = findTitleEl();
      if (!titleEl) return false;
      const bar = buildSearchBar(itemId);
      titleEl.insertAdjacentElement("afterend", bar);
      if (document.readyState === "complete") {
        bar.autoCheck();
      } else {
        window.addEventListener("load", bar.autoCheck, { once: true });
      }
      return true;
    }

    function init() {
      const barDone = insertBar();
      const descDone = setupDescCollapse();
      const varDone = setupVariationsCollapse();
      return barDone && descDone && varDone;
    }

    if (!init()) {
      let scheduled = false;
      const mo = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          if (init()) mo.disconnect();
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
    }
  }

  // ---------------------------------------------------------------- boothdex

  // BoothDex renders item details inside a Radix Dialog ([role="dialog"]) that
  // includes a Booth buy link (`https://booth.pm/ja/items/<id>`) and a visible
  // <h2> title alongside a screen-reader-only DialogTitle (<h2 data-slot="dialog-title">).
  // Other dialogs (sign-in, saved searches, Ctrl+K palette) have no Booth item
  // link and are ignored. Switching items via "more from shop" remounts the
  // dialog body in place, which dataset.itemId detects and replaces.
  function initBoothDex() {
    function injectIntoDialog(dialog) {
      const link = dialog.querySelector('a[href*="booth.pm/"][href*="/items/"]');
      const m = link && link.href.match(/\/items\/(\d+)/);
      if (!m) return;
      const itemId = m[1];
      const existing = dialog.querySelector(".bcs-bar");
      if (existing) {
        if (existing.dataset.itemId === itemId) return;
        existing.remove();
      }
      const titleEl = dialog.querySelector(
        'h2:not([data-slot="dialog-title"]):not(.sr-only)',
      );
      if (!titleEl) return;
      closePanels();
      const bar = buildSearchBar(itemId);
      titleEl.insertAdjacentElement("afterend", bar);
      bar.autoCheck();
    }

    function scanDialogs() {
      document.querySelectorAll('[role="dialog"]').forEach(injectIntoDialog);
    }

    scanDialogs();
    let scheduled = false;
    new MutationObserver((mutations) => {
      if (activeSearchPanel && !activeSearchPanel.panel.isConnected) {
        activeSearchPanel.close();
      }
      if (scheduled) return;
      const relevant = mutations.some((m) => {
        const target = m.target;
        if (
          target.closest &&
          target.closest(".bcs-bar, .bcs-panel")
        ) {
          return false;
        }
        if (target.closest && target.closest('[role="dialog"]')) return true;
        for (const n of m.addedNodes) {
          if (
            n.nodeType === 1 &&
            (n.matches?.('[role="dialog"]') ||
              n.querySelector?.('[role="dialog"]'))
          ) {
            return true;
          }
        }
        return false;
      });
      if (!relevant) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scanDialogs();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------- entry

  if (
    location.hostname === "booth.pm" ||
    location.hostname.endsWith(".booth.pm")
  ) {
    initBooth();
  } else {
    initBoothDex();
  }
})();
