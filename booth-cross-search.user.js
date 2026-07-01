// ==UserScript==
// @name         Booth Cross Search (VRCPirate / RipperStore)
// @namespace    booth-cross-search
// @version      1.3.0
// @description  在Booth商品页标题下方增加查VRCPirate/RipperStore同ID资源，需要登录后使用。
// @author       MelodyBomber
// @match        *://booth.pm/*items/*
// @match        *://*.booth.pm/*items/*
// @connect      api-v2.vrcpirate.com
// @connect      forum.ripper.store
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const idMatch = location.pathname.match(/\/items\/(\d+)/);
  if (!idMatch) return;
  const itemId = idMatch[1];

  GM_addStyle(`
    .bcs-bar { position: relative; display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; align-items: center;
      font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif; }
    .bcs-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 16px; border-radius: 20px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: 1px solid #dcdcdc; color: #333; background: #fff;
      line-height: 1.4; transition: background .15s, border-color .15s;
    }
    .bcs-btn:hover { background: #f5f5f5; border-color: #c8c8c8; }
    .bcs-btn:active { background: #ececec; }
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
      background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.15);
      min-width: 280px; max-width: 420px; max-height: 320px; overflow-y: auto;
    }
    .bcs-panel-item { display: block; padding: 8px 10px; border-bottom: 1px solid #eee; text-decoration: none; color: #222; }
    .bcs-panel-item:last-child { border-bottom: none; }
    .bcs-panel-item:hover { background: #f5f5f5; }
    .bcs-panel-item .t { font-size: 13px; font-weight: 600; display: block; }
    .bcs-panel-item .s { font-size: 11px; color: #888; }
    .bcs-panel-empty { padding: 10px; font-size: 13px; color: #888; }
    .bcs-desc.bcs-collapsed { max-height: 240px !important; overflow: hidden !important; position: relative; }
    .bcs-desc.bcs-collapsed::after {
      content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 90px;
      background: linear-gradient(rgba(255,255,255,0), #fff 85%); pointer-events: none;
    }
    .bcs-toggle {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; margin: 12px 0 4px; padding: 10px 16px;
      border: 1px solid #e4e4e7; border-radius: 10px; background: #fafafa;
      color: #3f3f46; cursor: pointer; font-size: 13px; font-weight: 700; line-height: 1.4;
      font-family: -apple-system, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif;
      transition: background .15s, border-color .15s, box-shadow .15s, transform .05s;
    }
    .bcs-toggle:hover { background: #f4f4f5; border-color: #d4d4d8; box-shadow: 0 1px 5px rgba(0,0,0,.06); }
    .bcs-toggle:active { transform: translateY(1px); }
    .bcs-toggle .bcs-count { color: #9ca3af; font-weight: 600; }
    .bcs-toggle .bcs-chev { font-size: 10px; transition: transform .2s ease; }
    .bcs-toggle.is-open .bcs-chev { transform: rotate(180deg); }
    .bcs-var-hidden { display: none !important; }
  `);

  // Collapse the item description behind an expand button. The description body
  // is the .my-40 wrapper that holds the 概要/詳細 (.shop__text) sections — note
  // .shop__text is also used in the shop-profile area, so anchor on the .my-40
  // that actually contains one. Only kicks in when it's taller than the preview.
  const DESC_PREVIEW = 240;
  function setupDescCollapse() {
    const desc = [...document.querySelectorAll(".my-40")].find((el) =>
      el.querySelector(".shop__text"),
    );
    if (!desc) return false;
    if (desc.dataset.bcsCollapse) return true;
    // Height may read short while React is still filling the block; return false
    // (not a permanent skip) so the observer keeps watching until it settles.
    if (desc.scrollHeight <= DESC_PREVIEW + 60) return false;
    desc.dataset.bcsCollapse = "1";
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
    return true;
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

  // Collapse the purchasable-variations list (.variations, one .variation-item
  // per row) down to the first few rows behind an expand button. Skips short
  // lists where hiding a row or two isn't worth it.
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

  function decodeEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = str;
    return ta.value;
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
  // Both getters memoize on a shared in-flight promise so the on-load auto-check
  // and a later button click never fire the same request twice; a failure clears
  // the cache so the next click can retry instead of being stuck rejected forever.
  let vrcpPromise = null;
  function getVrcpMatches() {
    if (!vrcpPromise) {
      vrcpPromise = fetchJson(
        `https://api-v2.vrcpirate.com/assets?page=1&search=${itemId}`,
      )
        .then(({ json }) =>
          (json.data || []).filter((a) => String(a.boothID) === itemId),
        )
        .catch((e) => {
          vrcpPromise = null;
          throw e;
        });
    }
    return vrcpPromise;
  }

  let ripperPromise = null;
  function getRipperResult() {
    if (!ripperPromise) {
      const url = `https://forum.ripper.store/api/search?in=titlesposts&term=${itemId}&matchWords=all&by=&categories=&searchChildren=false&hasTags=&replies=&repliesFilter=atleast&timeFilter=newer&timeRange=&sortBy=relevance&sortDirection=desc&showAs=posts&_=${Date.now()}`;
      ripperPromise = fetchJson(url)
        .then(({ json }) => {
          if (json.status && json.status.code === "not-authorised") {
            const err = new Error("not-authorised");
            err.notAuthorised = true;
            throw err;
          }
          return json.posts || [];
        })
        .catch((e) => {
          ripperPromise = null;
          throw e;
        });
    }
    return ripperPromise;
  }

  function buildBar() {
    const bar = document.createElement("div");
    bar.className = "bcs-bar";

    // Buttons start disabled and only get re-enabled by runAutoCheck once we know
    // the user is logged in, so a click here can trust that login already passed.
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
        const matches = await getVrcpMatches();
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
        const posts = await getRipperResult();
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

    // Runs once the page (and its own network activity) has settled: decides
    // whether each button gets enabled, and colors its dot either way.
    const runAutoCheck = () => {
      // VRCPirate: no login gate, search straight away.
      vrcpBtn.disabled = false;
      vrcpBtn.title = "";
      getVrcpMatches()
        .then((matches) => {
          vrcpDot.className = `dot ${matches.length ? "ok" : "none"}`;
        })
        .catch(() => {
          vrcpDot.className = "dot none";
        });
      // RipperStore: login state comes from the search response itself.
      getRipperResult()
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
    if (document.readyState === "complete") {
      runAutoCheck();
    } else {
      window.addEventListener("load", runAutoCheck, { once: true });
    }

    return bar;
  }

  function insertBar() {
    if (document.querySelector(".bcs-bar")) return true;
    const titleEl = findTitleEl();
    if (!titleEl) return false;
    titleEl.insertAdjacentElement("afterend", buildBar());
    return true;
  }

  function init() {
    // Each returns true once handled; the bar, description and variations list
    // can appear at different times, so keep the observer alive until all settle.
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
})();
