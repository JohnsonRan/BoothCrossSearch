// ==UserScript==
// @name         Booth Cross Search (VRCPirate / RipperStore)
// @namespace    booth-cross-search
// @version      2.1.0
// @description  在 Booth 商品页标题下方增加查 VRCPirate/RipperStore 同ID资源；在 VRCatalogue 点击图片弹出商品详情。
// @author       MelodyBomber
// @match        *://booth.pm/*items/*
// @match        *://*.booth.pm/*items/*
// @match        *://vrcatalogue.com/*
// @connect      api-v2.vrcpirate.com
// @connect      forum.ripper.store
// @connect      booth.pm
// @grant        GM_xmlhttpRequest
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
    @keyframes bcs-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
    .bcs-btn:disabled { opacity: .5; cursor: wait; }
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
    .bcs-var-hidden { display: none !important; }
  `);

  function decodeEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = str;
    return ta.value;
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
    return gmGet(url).then((res) => ({
      status: res.status,
      json: JSON.parse(res.responseText),
    }));
  }

  // VRCPirate needs no login to search. RipperStore's search API returns a
  // {status:{code:"not-authorised"}} envelope when logged out instead of the
  // usual posts payload, so login state is read straight off that response.
  // Results memoize per item id on a shared in-flight promise so an auto-check
  // and a later button click never fire the same request twice; a failure
  // clears the cache so the next click can retry instead of staying rejected.
  function memoized(map, id, run) {
    if (!map.has(id)) {
      map.set(
        id,
        run().catch((e) => {
          map.delete(id);
          throw e;
        }),
      );
    }
    return map.get(id);
  }

  const vrcpCache = new Map();
  function getVrcpMatches(itemId) {
    return memoized(vrcpCache, itemId, () =>
      fetchJson(
        `https://api-v2.vrcpirate.com/assets?page=1&search=${itemId}`,
      ).then(({ json }) =>
        (json.data || []).filter((a) => String(a.boothID) === itemId),
      ),
    );
  }

  const ripperCache = new Map();
  function getRipperResult(itemId) {
    return memoized(ripperCache, itemId, () => {
      const url = `https://forum.ripper.store/api/search?in=titlesposts&term=${itemId}&matchWords=all&by=&categories=&searchChildren=false&hasTags=&replies=&repliesFilter=atleast&timeFilter=newer&timeRange=&sortBy=relevance&sortDirection=desc&showAs=posts&_=${Date.now()}`;
      return fetchJson(url).then(({ json }) => {
        if (json.status && json.status.code === "not-authorised") {
          const err = new Error("not-authorised");
          err.notAuthorised = true;
          throw err;
        }
        return json.posts || [];
      });
    });
  }

  function closePanels(bar) {
    bar.querySelectorAll(".bcs-panel").forEach((p) => p.remove());
  }

  function showPanel(bar, entries) {
    closePanels(bar);
    const panel = document.createElement("div");
    panel.className = "bcs-panel";
    if (!entries.length) {
      panel.innerHTML = '<div class="bcs-panel-empty">没有找到匹配结果</div>';
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

    const vrcpBtn = document.createElement("button");
    vrcpBtn.className = "bcs-btn vrcp";
    vrcpBtn.disabled = true;
    vrcpBtn.title = "加载中…";
    vrcpBtn.innerHTML = '<span class="dot pending"></span>VRCPirate';
    const vrcpDot = vrcpBtn.querySelector(".dot");
    vrcpBtn.addEventListener("click", async () => {
      closePanels(bar);
      vrcpBtn.disabled = true;
      try {
        const matches = await getVrcpMatches(itemId);
        vrcpDot.className = `dot ${matches.length ? "ok" : "none"}`;
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
        vrcpDot.className = "dot none";
        showPanel(bar, []);
      } finally {
        vrcpBtn.disabled = false;
      }
    });

    const ripperBtn = document.createElement("button");
    ripperBtn.className = "bcs-btn ripper";
    ripperBtn.disabled = true;
    ripperBtn.title = "检测登录状态中…";
    ripperBtn.innerHTML = '<span class="dot pending"></span>RipperStore';
    const ripperDot = ripperBtn.querySelector(".dot");
    ripperBtn.addEventListener("click", async () => {
      closePanels(bar);
      ripperBtn.disabled = true;
      try {
        const posts = await getRipperResult(itemId);
        ripperDot.className = `dot ${posts.length ? "ok" : "none"}`;
        showPanel(
          bar,
          posts.map((p) => ({
            title: decodeEntities(p.topic.title),
            sub: p.category ? p.category.name : "",
            url: p.url,
          })),
        );
      } catch (e) {
        ripperDot.className = "dot none";
        showPanel(bar, []);
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
          vrcpDot.className = `dot ${matches.length ? "ok" : "none"}`;
        })
        .catch(() => {
          vrcpDot.className = "dot none";
        });
      // RipperStore: login state comes from the search response itself.
      getRipperResult(itemId)
        .then((posts) => {
          ripperBtn.disabled = false;
          ripperBtn.title = "";
          ripperDot.className = `dot ${posts.length ? "ok" : "none"}`;
        })
        .catch((e) => {
          ripperDot.className = "dot none";
          if (e && e.notAuthorised) {
            ripperBtn.title = "请先登录 RipperStore";
            addWarn("⚠ 未登录 RipperStore", "https://forum.ripper.store/login");
          } else {
            // Network/parse error, not an auth failure — allow a manual retry.
            ripperBtn.disabled = false;
            ripperBtn.title = "";
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

  // Collapse `desc` behind an expand toggle when it's taller than the preview.
  // Returns the toggle (already inserted after `desc`), or null when short
  // enough to leave alone.
  const DESC_PREVIEW = 240;
  function collapseDesc(desc) {
    if (desc.scrollHeight <= DESC_PREVIEW + 60) return null;
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

  // ---------------------------------------------------------------- booth.pm

  function initBooth() {
    const idMatch = location.pathname.match(/\/items\/(\d+)/);
    if (!idMatch) return;
    const itemId = idMatch[1];

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
      const og = document.querySelector('meta[property="og:title"]');
      const wanted = (og ? og.content : document.title).trim();
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
        scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb, #ccc) transparent;
      }
      .bcs-modal::-webkit-scrollbar { width: 8px; }
      .bcs-modal::-webkit-scrollbar-track { background: transparent; }
      .bcs-modal::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, #ccc); border-radius: 4px; }
      .bcs-modal::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover, #bbb); }
      .bcs-modal-top { display: flex; gap: 20px; align-items: flex-start; }
      .bcs-media { flex: 0 0 46%; min-width: 0; position: relative; }
      .bcs-main-img {
        width: 100%; aspect-ratio: 1; object-fit: contain; background: var(--skel, #f4f4f5);
        border-radius: 10px; display: block;
      }
      .bcs-main-img.paginated { cursor: pointer; }
      .bcs-count {
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
      @media (max-width: 640px) {
        .bcs-modal-top { flex-direction: column; }
        .bcs-media { flex: none; width: 100%; }
      }
    `);

    const boothCache = new Map();
    const getBoothItem = (id) =>
      memoized(boothCache, id, () =>
        fetchJson(`https://booth.pm/en/items/${id}.json`).then(
          ({ status, json }) => {
            if (status !== 200 || !json || !json.id) {
              throw new Error(`booth json ${status}`);
            }
            return json;
          },
        ),
      );

    // Render the item's purchasable variations (name + price) — booth.pm
    // items with >1 price tier (e.g. base + support) don't otherwise surface
    // that in the modal, which only shows the single `item.price` summary.
    // `overallPrice` is that summary string (e.g. "800 JPY~"), scraped only
    // for its currency suffix since each variation's own price is a bare
    // number.
    function renderVariations(container, variations, overallPrice) {
      container.innerHTML = "";
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
    }

    function openModal(seed) {
      const overlay = document.createElement("div");
      overlay.className = "bcs-overlay";
      const boothUrl = `https://booth.pm/items/${seed.id}`;
      overlay.innerHTML = `
        <div class="bcs-modal" role="dialog" aria-modal="true">
          <div class="bcs-modal-top">
            <div class="bcs-media">
              <img class="bcs-main-img" alt="">
              <span class="bcs-count" hidden></span>
              <div class="bcs-thumbs" hidden></div>
            </div>
            <div class="bcs-info">
              <a class="bcs-title" target="_blank" rel="noopener noreferrer"></a>
              <div class="bcs-meta"></div>
              <div class="bcs-variations"></div>
              <div class="bcs-tags"></div>
              <a class="bcs-buy" target="_blank" rel="noopener noreferrer">去 Booth 购买</a>
            </div>
          </div>
          <div class="bcs-modal-desc bcs-dim">商品说明加载中…</div>
        </div>`;

      const mainImg = overlay.querySelector(".bcs-main-img");
      const thumbs = overlay.querySelector(".bcs-thumbs");
      const countEl = overlay.querySelector(".bcs-count");
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

      // Multi-image nav: filled in once the Booth .json resolves (see below).
      // Clicking the main image itself pages to the next one; thumbnails
      // below jump straight to a given image.
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
      mainImg.addEventListener("click", () => showImage(idx + 1));

      const bar = buildSearchBar(seed.id);
      metaEl.insertAdjacentElement("afterend", bar);
      bar.autoCheck();

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const close = () => {
        overlay.remove();
        document.body.style.overflow = prevOverflow;
        document.removeEventListener("keydown", onKey, true);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      };
      document.addEventListener("keydown", onKey, true);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      document.body.appendChild(overlay);

      getBoothItem(seed.id)
        .then((item) => {
          if (!overlay.isConnected) return;
          titleEl.textContent = item.name;
          titleEl.href = item.url || boothUrl;
          overlay.querySelector(".bcs-buy").href = item.url || boothUrl;

          metaEl.innerHTML = "";
          if (item.shop && item.shop.name) {
            const s = document.createElement("span");
            s.textContent = item.shop.name;
            metaEl.appendChild(s);
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
          (item.tags || []).forEach((tg) => {
            tagsEl.appendChild(makeLink(tg.name, tg.url, "bcs-tag"));
          });

          images = (item.images || []).filter((im) => im.original);
          if (images.length > 1) {
            mainImg.classList.add("paginated");
            countEl.hidden = false;
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
            collapseDesc(descEl);
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
  }

  // ---------------------------------------------------------------- entry

  if (location.hostname === "vrcatalogue.com") {
    initVrcatalogue();
  } else {
    initBooth();
  }
})();
