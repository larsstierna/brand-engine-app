// App entry: connects to the backend, keeps the chosen author and week, routes #/page?author=..&week=.. to a view.

import { makeBackend } from "./backend.js";
import { Data } from "./data.js";
import { mountPackageProgress, packageStatus, clearProgressDisclosure } from "./progress.js";
import { $, $$, esc, html, loadSettings, postingWeek, saveSettings, toast, weekRange } from "./util.js";
import { icon } from "./icons.js";
import { pageTransition } from "./motion.js";
import { clearOrb } from "./orb.js";

const VIEWS = {
  week: () => import("./views/week.js"),
  strategy: () => import("./views/strategy.js"),
  pick: () => import("./views/pick.js"),
  opinion: () => import("./views/opinion.js"),
  draft: () => import("./views/draft.js"),
  ready: () => import("./views/ready.js"),
  posts: () => import("./views/posts.js"),
  runs: () => import("./views/runs.js"),
  brand: () => import("./views/brand.js"),
  inputs: () => import("./views/inputs.js"),
  settings: () => import("./views/settings.js"),
  onboarding: () => import("./views/onboarding.js"),
  connect: () => import("./views/settings.js"),
};
const NAV_PAGE = { strategy: "week", pick: "week", opinion: "week", draft: "week", ready: "week", onboarding: "settings", connect: "settings" };

const app = { settings: loadSettings(), data: null, backend: null, authors: [], author: null, authorCfg: {}, renderId: 0 };
let dirty = false;
let refreshTimer;
let acceptedHash = location.hash;
let restoringHash = false;

function mayLeave() {
  return !dirty || window.confirm("Discard your unsaved changes?");
}

window.addEventListener("beforeunload", (event) => {
  if (dirty) { event.preventDefault(); event.returnValue = ""; }
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (link && !link.download && link.target !== "_blank" && dirty) {
    if (!mayLeave()) event.preventDefault();
    else dirty = false;
  }
});

function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [page = "week", ...rest] = path.split("/");
  return { page: page || "week", sub: rest.join("/"), params: new URLSearchParams(query) };
}

export function go(page, params = {}) {
  const q = new URLSearchParams({ author: app.author || "", ...params });
  for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
  location.hash = `#/${page}${q.toString() ? "?" + q : ""}`;
}

async function connect() {
  app.backend = makeBackend(app.settings);
  app.data = app.backend ? new Data(app.backend) : null;
  if (!app.data) return false;
  try {
    app.authors = await app.data.authors();
  } catch (e) {
    toast(`Could not read the repository: ${e.message}`, "bad");
    app.authors = [];
    app.data = null;
    return false;
  }
  const want = parseHash().params.get("author") || app.settings.author;
  app.author = app.authors.some((a) => a.id === want) ? want : app.authors[0]?.id || null;
  return true;
}

function renderNav() {
  const sel = $("#author-select");
  sel.innerHTML = app.authors.map((a) => `<option value="${esc(a.id)}"${a.id === app.author ? " selected" : ""}>${esc(a.display_name || a.id)}</option>`).join("")
    + `<option value="__new">+ Add an author</option>`;
  const cfg = app.authors.find((a) => a.id === app.author) || {};
  const week = postingWeek(cfg.timezone || "Europe/Stockholm");
  $("#nav-week").textContent = app.author ? `${week} · ${weekRange(week)}` : "";
  const release = document.querySelector('meta[name="app-release"]')?.content || "development";
  $("#nav-foot").textContent = `${app.backend ? `Data: ${app.backend.label()}` : "Not connected"} · App ${release}`;
  $$("#nav-links a").forEach((a) => {
    if (!a.querySelector(".icon")) a.insertAdjacentHTML("afterbegin", icon(a.dataset.page === "week" ? "calendar" : a.dataset.page));
    const href = a.getAttribute("href").split("?")[0];
    a.setAttribute("href", `${href}${app.author ? `?author=${encodeURIComponent(app.author)}` : ""}`);
  });
}

function markNav(page) {
  const p = NAV_PAGE[page] || page;
  $$("#nav-links a").forEach((a) => { if (a.dataset.page === p) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}

async function render() {
  clearOrb();
  clearTimeout(refreshTimer);
  clearProgressDisclosure();
  dirty = false;
  const id = ++app.renderId;
  const { page, sub, params } = parseHash();
  const root = $("#view");
  if (!app.data && page !== "connect") return go("connect");
  if (params.get("author") && params.get("author") !== app.author && app.authors.some((a) => a.id === params.get("author"))) {
    app.author = params.get("author");
    saveSettings({ author: app.author });
    renderNav();
  }
  if (app.data && !app.author && !["onboarding", "settings", "connect"].includes(page)) return go("onboarding");
  markNav(page);
  const loader = VIEWS[page] || VIEWS.week;
  app.authorCfg = app.authors.find((a) => a.id === app.author) || {};
  const tz = app.authorCfg.timezone || "Europe/Stockholm";
  const ctx = {
    data: app.data, backend: app.backend, settings: app.settings, authors: app.authors, author: app.author,
    authorCfg: app.authorCfg, page, sub, params, week: params.get("week") || postingWeek(tz), tz, go,
    refresh: () => { app.data?.invalidate(); render(); },
    setDirty: (value) => { dirty = value; },
    allowNavigation: mayLeave,
    watch: (read, initial) => {
      clearTimeout(refreshTimer);
      const poll = async () => {
        if (id !== app.renderId) return;
        try {
          if (!document.hidden && !dirty) {
            app.data.invalidate();
            const value = await read();
            if (JSON.stringify(value) !== JSON.stringify(initial)) { render(); return; }
          }
        } catch { /* The visible view remains available while a refresh fails. */ }
        refreshTimer = setTimeout(poll, 30000);
      };
      refreshTimer = setTimeout(poll, 30000);
    },
    reconnect: async (patch) => {
      if (patch.backend === "github") {
        const url = new URL(location.href);
        url.searchParams.delete("local");
        history.replaceState(null, "", url);
      }
      app.settings = saveSettings(patch);
      const connected = await connect();
      renderNav();
      dirty = false;
      go(connected ? app.author ? "week" : "onboarding" : "connect");
    },
    reloadAuthors: async () => { app.data.invalidate(); app.authors = await app.data.authors(); renderNav(); },
  };
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const mod = await loader();
    if (id !== app.renderId) return;
    await mod.default(ctx, root);
    if (id === app.renderId && (["strategy", "pick", "opinion", "draft", "ready"].includes(page) || page === "runs" && params.get("run"))) {
      const archived = page === "runs";
      const [week, activity] = await Promise.all([app.data.week(app.author, ctx.week, archived ? params.get("run") : ""), archived ? Promise.resolve({}) : app.data.activity(app.author, ctx.week)]);
      if (id !== app.renderId) return;
      mountPackageProgress(ctx, root, week, activity);
      if (!archived) ctx.watch(async () => ({ week: await app.data.week(ctx.author, ctx.week), activity: await app.data.activity(ctx.author, ctx.week) }), { week, activity });
    }
    if (id === app.renderId) {
      pageTransition(root);
      root.focus({ preventScroll: true });
      if (app.data && app.author) {
        const selectedAuthor = app.author;
        app.data.week(selectedAuthor, postingWeek(tz)).then((week) => {
          if (selectedAuthor !== app.author) return;
          const nav = document.querySelector('[data-page="week"]');
          const needs = packageStatus(week).phase === "decision";
          nav?.classList.toggle("needs-attention", needs);
          if (nav) nav.title = needs ? "A weekly decision is waiting" : "This week";
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error(e);
    if (id !== app.renderId) return;
    root.innerHTML = html`<div class="page-head"><h1>Something went wrong</h1></div>
      <div class="notice bad">${e.message}</div>
      <div class="row"><button class="btn" id="retry">Try again</button><a class="btn" href="#/settings">Settings</a></div>`.s;
    $("#retry", root)?.addEventListener("click", () => ctx.refresh());
  }
}

$("#author-select").addEventListener("change", (e) => {
  if (!mayLeave()) { e.target.value = app.author; return; }
  dirty = false;
  if (e.target.value === "__new") { location.hash = "#/onboarding/new"; return; }
  app.author = e.target.value;
  saveSettings({ author: app.author });
  renderNav();
  go(parseHash().page === "onboarding" ? "week" : parseHash().page);
});
window.addEventListener("hashchange", () => {
  if (restoringHash) { restoringHash = false; return; }
  if (!mayLeave()) { restoringHash = true; location.replace(acceptedHash || "#/week"); return; }
  acceptedHash = location.hash;
  render();
});

(async () => {
  await connect();
  renderNav();
  if (!location.hash) go(app.data ? (app.author ? "week" : "onboarding") : "connect");
  else render();
  acceptedHash = location.hash;
})();
