// ==UserScript==
// @name         Booth Cross Search (VRCPirate / RipperStore)
// @namespace    booth-cross-search
// @version      1.0.0
// @description  在Booth商品页标题下方增加查VRCPirate/RipperStore同ID资源，需要登录后使用
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
  `);

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

  // /me is account-specific and 401s when logged out; forum's own /search
  // redirects anonymous visitors to /login, so the final landing URL tells us.
  let vrcpLoginPromise = null;
  function checkVrcpLogin() {
    if (!vrcpLoginPromise) {
      vrcpLoginPromise = gmGet("https://api-v2.vrcpirate.com/me")
        .then((res) => res.status >= 200 && res.status < 300)
        .catch(() => false);
    }
    return vrcpLoginPromise;
  }

  let ripperLoginPromise = null;
  function checkRipperLogin() {
    if (!ripperLoginPromise) {
      ripperLoginPromise = gmGet("https://forum.ripper.store/search")
        .then((res) => !/\/login(\?|$)/.test(res.finalUrl || ""))
        .catch(() => false);
    }
    return ripperLoginPromise;
  }

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
        .then(({ json }) => json.posts || [])
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
    vrcpBtn.title = "检测登录状态中…";
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
      checkVrcpLogin()
        .then((loggedIn) => {
          if (loggedIn) {
            vrcpBtn.disabled = false;
            vrcpBtn.title = "";
            getVrcpMatches()
              .then((matches) => {
                vrcpDot.className = `dot ${matches.length ? "ok" : "none"}`;
              })
              .catch(() => {
                vrcpDot.className = "dot none";
              });
          } else {
            vrcpBtn.title = "请先登录 VRCPirate";
            vrcpDot.className = "dot none";
            addWarn("⚠ 未登录 VRCPirate", "https://forum.vrcpirate.com/");
          }
        })
        .catch(() => {
          vrcpDot.className = "dot none";
        });
      checkRipperLogin()
        .then((loggedIn) => {
          if (loggedIn) {
            ripperBtn.disabled = false;
            ripperBtn.title = "";
            getRipperResult()
              .then((posts) => {
                ripperDot.className = `dot ${posts.length ? "ok" : "none"}`;
              })
              .catch(() => {
                ripperDot.className = "dot none";
              });
          } else {
            ripperBtn.title = "请先登录 RipperStore";
            ripperDot.className = "dot none";
            addWarn("⚠ 未登录 RipperStore", "https://forum.ripper.store/login");
          }
        })
        .catch(() => {
          ripperDot.className = "dot none";
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

  if (!insertBar()) {
    const mo = new MutationObserver(() => {
      if (insertBar()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 15000);
  }
})();
