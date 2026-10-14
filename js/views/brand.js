// Brand and strategy: everything that steers the engine, editable in plain forms. Each tab saves its own files.
// Tabs: overview · destination · goals · topics · moves · lenses · voice · profile · sources · schedule · reviews

import { $, $$, html, slug, toast } from "../util.js";
import { pageHead, withSaving, renderInto } from "../ui.js";
import { chainEditor, bindChainEditors, fullSteps, readChain } from "../chain-editor.js";

const TABS = [
  ["overview", "Overview"], ["destination", "Destination"], ["goals", "Goals"], ["topics", "Topics"], ["moves", "Post strategies"],
  ["lenses", "Lenses"], ["voice", "Voice"], ["profile", "Boundaries and profile"], ["sources", "Sources"], ["schedule", "Schedule and email"],
  ["reviews", "Reviews and proposals"],
];
const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const lines = (t) => String(t || "").split("\n").map((s) => s.trim()).filter(Boolean);
const csv = (t) => String(t || "").split(",").map((s) => s.trim()).filter(Boolean);
const join = (a, sep = ", ") => (a || []).join(sep);

function savebar(label = "Save") {
  return html`<div class="savebar"><button class="btn primary" id="save">${label}</button><span class="small muted" id="dirty"></span></div>`;
}

// ------------------------------------------------------------------------------------------------ tabs
const T = {};

T.overview = async (ctx, d) => {
  const ledger = d.mem.ledger;
  const b = d.brand;
  const sum = (b.goals.goals || []).reduce((a, g) => a + Number(g.weight || 0), 0);
  const checks = [
    [!!b.strategy.destination, "Destination written", "destination"],
    [(b.goals.goals || []).length >= 2, `${(b.goals.goals || []).length} brand goals (weights ${sum})`, "goals"],
    [(b.topics.primary || []).length >= 1 && (b.topics.primary || []).length <= 3, `${(b.topics.primary || []).length} primary topics (1-3 keeps your topic fingerprint clear)`, "topics"],
    [(b.moves.moves || []).length >= 1 && (b.moves.moves || []).length <= 3, `${(b.moves.moves || []).length} post strateg${(b.moves.moves || []).length === 1 ? "y" : "ies"} (1-3 keeps your brand clear)`, "moves"],
    [(b.lenses.lenses || []).length >= 2, `${(b.lenses.lenses || []).length} lenses`, "lenses"],
    [!!d.voiceMd, "Voice guide", "voice"],
    [!!d.profileMd, "Verified profile facts", "profile"],
    [d.sourcesCount > 0, `${d.sourcesCount} active sources`, "sources"],
  ];
  return {
    html: html`
      <section class="card stack" style="background:var(--nav);color:#EEF2EE;border-color:var(--nav)">
        <span class="eyebrow" style="color:#A9B5AE">Your destination</span>
        <p style="font-size:20px;line-height:1.4">${b.strategy.destination || "Not written yet."}</p>
        ${b.strategy.current_focus ? html`<p class="small" style="color:#C9D3CC"><strong>Current focus:</strong> ${b.strategy.current_focus}</p>` : ""}
      </section>
      <div class="grid-2">
        <section class="card stack"><h2>How your settings shape each week</h2>
          <ol class="small" style="margin:0;padding-left:18px;line-height:1.7">
            <li><strong>Topics</strong> and <strong>sources</strong> decide where the engine looks.</li>
            <li><strong>Goals</strong> decide which story builds your brand most this week (the largest share of a card's score).</li>
            <li><strong>Post strategies</strong> (signature moves) decide the kind of material and post: news analysis, research, your practice, stories. The strategy furthest behind its weight gets cards first.</li>
            <li><strong>Lenses</strong> give each post an angle only you would take.</li>
            <li><strong>Voice</strong>, <strong>profile</strong> and <strong>boundaries</strong> decide how it is written and what is never said.</li>
          </ol></section>
        <details class="stack" ${checks.some(([ok]) => !ok) ? "open" : ""}><summary>Setup check · ${checks.filter(([ok]) => !ok).length ? "needs attention" : "complete"}</summary>
          <ul style="list-style:none;margin:0;padding:0" class="stack-s">${checks.map(([ok, label, tab]) => html`<li class="row between">
            <span><span class="chip ${ok ? "ok" : "warn"}">${ok ? "OK" : "To do"}</span> ${label}</span><a class="small" href="#/brand/${tab}?author=${ctx.author}">Edit</a></li>`)}</ul></details>
      </div>
      <section class="card row between" style="gap:16px"><div class="stack-s" style="flex:1 1 320px"><h2>Recalibrate from your CV</h2>
        <p class="small muted">New role, new market, or just a fresh look? Upload your CV: Claude compares it with this brand, asks a few questions, and every suggested change comes back as a proposal you approve.</p></div>
        <a class="btn" href="#/onboarding?author=${ctx.author}&mode=recalibrate">Start with my CV</a></section>
      <section class="card stack"><h2>Goals right now</h2>
        ${ledger ? html`<div class="table-wrap"><table><thead><tr><th>Goal</th><th class="num">Weight</th><th class="num">Posts</th><th class="num">Need</th></tr></thead>
          <tbody>${ledger.goals.map((g) => html`<tr><td>${g.question}</td><td class="num">${g.weight}</td><td class="num">${g.served}</td><td class="num">${Math.round(g.need)}/10</td></tr>`)}</tbody></table></div>`
          : html`<p class="muted small">The goal ledger appears after the first run.</p>`}
      </section>`,
  };
};

T.destination = async (ctx, d) => {
  const s = d.brand.strategy;
  const readers = s.readers?.length ? s.readers : [{ role: "", wants: "" }];
  return {
    html: html`
      <section class="card stack">
        <p class="lead">The destination is the north star: every story card is scored by how much it moves you toward it.</p>
        <label class="field">Who do you want to be known as, by whom?<span class="hint">One or two sentences. Specific beats grand.</span>
          <textarea id="destination" rows="3">${s.destination || ""}</textarea></label>
        <label class="field">Why you, and not someone else?<span class="hint">The vantage point only you have. Used to choose angles, never quoted as a credential.</span>
          <textarea id="why_me" rows="3">${s.why_me || ""}</textarea></label>
        <fieldset class="stack-s"><legend>Your readers and what makes them stop scrolling</legend>
          <div id="readers" class="stack-s">${readers.map((r, i) => html`<div class="list-row reader">
            <div class="form-grid"><input type="text" class="r-role" aria-label="Reader role ${i + 1}" placeholder="Role" value="${r.role || ""}">
            <input type="text" class="r-wants" aria-label="What they want ${i + 1}" placeholder="What they want from a post" value="${r.wants || ""}"></div>
            <button class="btn small danger rm" type="button" aria-label="Remove reader">Remove</button></div>`)}</div>
          <button class="btn small" type="button" id="add-reader" style="align-self:flex-start">+ Add a reader</button></fieldset>
        <label class="field">What does success look like?<textarea id="success" rows="2">${s.success || ""}</textarea></label>
        <label class="field">Never post about<span class="hint">One per line. The compliance reviewer checks every draft against these and your boundaries.</span>
          <textarea id="no_go" rows="5">${join(s.no_go, "\n")}</textarea></label>
        <label class="field">Current focus<span class="hint">Updated by the monthly review; you can change it any time.</span>
          <textarea id="current_focus" rows="3">${s.current_focus || ""}</textarea></label>
      </section>${savebar()}`,
    bind(root) {
      $("#add-reader", root).addEventListener("click", () => {
        const div = document.createElement("div");
        div.className = "list-row reader";
        div.innerHTML = `<div class="form-grid"><input type="text" class="r-role" placeholder="Role" aria-label="Reader role"><input type="text" class="r-wants" placeholder="What they want from a post" aria-label="What they want"></div><button class="btn small danger rm" type="button">Remove</button>`;
        $("#readers", root).appendChild(div);
      });
      root.addEventListener("click", (e) => { if (e.target.classList.contains("rm")) e.target.closest(".reader")?.remove(); });
    },
    async save(root) {
      const next = { ...s,
        destination: $("#destination", root).value.trim(), why_me: $("#why_me", root).value.trim(),
        readers: $$(".reader", root).map((r) => ({ role: $(".r-role", r).value.trim(), wants: $(".r-wants", r).value.trim() })).filter((r) => r.role),
        success: $("#success", root).value.trim(), no_go: lines($("#no_go", root).value), current_focus: $("#current_focus", root).value.trim() };
      if (!next.destination) throw new Error("Write your destination first");
      return [{ path: `authors/${ctx.author}/brand/strategy.yaml`, content: ctx.data.dumpYaml(next) }];
    },
  };
};

T.goals = async (ctx, d) => {
  const goals = d.brand.goals.goals || [];
  const led = Object.fromEntries((d.mem.ledger?.goals || []).map((g) => [g.id, g]));
  const row = (g) => html`<div class="card flat goal stack-s" data-id="${g.id || ""}">
    <label class="field">Question a post can answer<textarea class="g-q" rows="2" placeholder="Does she turn research into something a manager can do this week?">${g.question || ""}</textarea></label>
    <div class="row between">
      <label class="row small" style="gap:8px">Weight <input type="range" min="1" max="60" class="g-w" value="${g.weight || 10}" aria-label="Weight"><span class="mono g-wv">${g.weight || 10}</span> <span class="muted g-share"></span></label>
      <span class="small muted">${g.id ? html`id <code>${g.id}</code>` : "new"}${led[g.id] ? ` · ${led[g.id].served} recent post${led[g.id].served === 1 ? "" : "s"} · need ${Math.round(led[g.id].need)}/10` : ""}</span>
      <button class="btn small danger rm" type="button">Remove</button></div></div>`;
  return {
    html: html`
      <p class="lead">Goals are questions your posts answer for readers. The engine favours the goal that needs a post most, so weights decide your mix over time.</p>
      <div id="goals" class="stack">${goals.map(row)}</div>
      <button class="btn" id="add" type="button" style="align-self:flex-start">+ Add a goal</button>
      <div class="notice info small">Tip: 4 to 6 goals work best. A goal you never want to write about is better removed than weighted 1.</div>
      ${savebar()}`,
    bind(root) {
      const shares = () => {
        const all = $$(".goal", root);
        const total = all.reduce((a, g) => a + Number($(".g-w", g).value), 0) || 1;
        all.forEach((g) => { $(".g-wv", g).textContent = $(".g-w", g).value; $(".g-share", g).textContent = `(${Math.round((Number($(".g-w", g).value) / total) * 100)}% of posts)`; });
      };
      root.addEventListener("input", (e) => { if (e.target.classList.contains("g-w")) shares(); });
      root.addEventListener("click", (e) => { if (e.target.classList.contains("rm")) { e.target.closest(".goal")?.remove(); shares(); } });
      $("#add", root).addEventListener("click", () => { $("#goals", root).insertAdjacentHTML("beforeend", String(row({ weight: 15 }))); shares(); });
      shares();
    },
    async save(root) {
      const used = new Set();
      const out = $$(".goal", root).map((g) => {
        const question = $(".g-q", g).value.trim();
        let id = g.dataset.id || slug(question.replace(/^(does|can|is|do)\s+(he|she|they|i)\s+/i, "")).slice(0, 30);
        while (used.has(id)) id += "-2";
        used.add(id);
        const old = goals.find((x) => x.id === g.dataset.id) || {};
        return { ...old, id, question, weight: Number($(".g-w", g).value) };
      }).filter((g) => g.question);
      if (out.length < 2) throw new Error("Keep at least 2 goals");
      return [{ path: `authors/${ctx.author}/brand/goals.yaml`, content: ctx.data.dumpYaml({ goals: out }) }];
    },
  };
};

T.topics = async (ctx, d) => {
  const t = d.brand.topics;
  const topicRow = (x, kind) => html`<div class="list-row topic" data-kind="${kind}" data-id="${x.id || ""}">
    <div class="form-grid"><input type="text" class="t-name" aria-label="Topic name" placeholder="Topic" value="${x.name || ""}">
    <input type="text" class="t-kw" aria-label="Keywords" placeholder="keywords, comma separated" value="${join(x.keywords)}"></div>
    <button class="btn small danger rm" type="button">Remove</button></div>`;
  const ruleRow = (r, kind) => html`<div class="card flat rule stack-s" data-kind="${kind}">
    <div class="form-grid"><input type="text" class="r-id" aria-label="Rule id" placeholder="id" value="${r.id || ""}"><input type="text" class="r-label" aria-label="Rule label" placeholder="label" value="${r.label || ""}"></div>
    <label class="field"><span class="hint">Patterns (regular expressions, one per line)</span><textarea class="r-pat mono" rows="3">${join(r.patterns, "\n")}</textarea></label>
    ${kind === "exclude" ? html`<label class="row small"><input type="checkbox" class="r-strict" ${r.strict ? "checked" : ""}> Always exclude, even if a preferred type also matches</label>` : ""}
    <button class="btn small danger rm-rule" type="button" style="align-self:flex-start">Remove rule</button></div>`;
  const limits = Object.entries(t.theme_limits || {});
  return {
    html: html`
      <p class="lead">LinkedIn shows your posts to people interested in your topics. Two or three primary topics, held for months, build that fingerprint.</p>
      <section class="card stack"><h2>Primary topics (max 3)</h2><div id="primary" class="stack-s">${(t.primary || []).map((x) => topicRow(x, "primary"))}</div>
        <button class="btn small add-topic" data-kind="primary" type="button" style="align-self:flex-start">+ Add</button></section>
      <section class="card stack"><h2>Secondary topics</h2><p class="small muted">Allowed now and then; they never dominate.</p>
        <div id="secondary" class="stack-s">${(t.secondary || []).map((x) => topicRow(x, "secondary"))}</div>
        <button class="btn small add-topic" data-kind="secondary" type="button" style="align-self:flex-start">+ Add</button></section>
      <section class="card stack"><h2>Theme limits</h2><p class="small muted">For example: AI at most 3 posts in 12, never two weeks in a row.</p>
        <div id="limits" class="stack-s">${limits.map(([k, v]) => html`<div class="row limit"><input type="text" class="l-id" aria-label="Theme" value="${k}" style="max-width:180px">
          at most <input type="number" class="l-max" aria-label="Maximum" value="${v.max ?? ""}" min="0"> in <input type="number" class="l-win" aria-label="Window" value="${v.window ?? 12}" min="1"> posts,
          in a row <input type="number" class="l-con" aria-label="Maximum in a row" value="${v.max_consecutive ?? ""}" min="1">
          <button class="btn small danger rm-limit" type="button">Remove</button></div>`)}</div>
        <button class="btn small" id="add-limit" type="button" style="align-self:flex-start">+ Add a limit</button></section>
      <details class="card"><summary>Advanced: story filters</summary>
        <p class="small muted">Preferred story types rank higher and decide the story type; excluded types never become cards. Patterns are case-insensitive regular expressions.</p>
        <h3 style="margin:12px 0 8px">Prefer (in this order)</h3><div id="prefer" class="stack-s">${((t.story_filters || {}).prefer || []).map((r) => ruleRow(r, "prefer"))}</div>
        <button class="btn small add-rule" data-kind="prefer" type="button" style="margin-top:8px">+ Add preferred type</button>
        <h3 style="margin:16px 0 8px">Exclude</h3><div id="exclude" class="stack-s">${((t.story_filters || {}).exclude || []).map((r) => ruleRow(r, "exclude"))}</div>
        <button class="btn small add-rule" data-kind="exclude" type="button" style="margin-top:8px">+ Add excluded type</button>
      </details>
      ${savebar()}`,
    bind(root) {
      root.addEventListener("click", (e) => {
        const el = e.target;
        if (el.classList.contains("rm")) el.closest(".topic")?.remove();
        if (el.classList.contains("rm-rule")) el.closest(".rule")?.remove();
        if (el.classList.contains("rm-limit")) el.closest(".limit")?.remove();
        if (el.classList.contains("add-topic")) $(`#${el.dataset.kind}`, root).insertAdjacentHTML("beforeend", String(topicRow({}, el.dataset.kind)));
        if (el.classList.contains("add-rule")) $(`#${el.dataset.kind}`, root).insertAdjacentHTML("beforeend", String(ruleRow({}, el.dataset.kind)));
        if (el.id === "add-limit") $("#limits", root).insertAdjacentHTML("beforeend",
          `<div class="row limit"><input type="text" class="l-id" aria-label="Theme" style="max-width:180px" placeholder="theme id"> at most <input type="number" class="l-max" aria-label="Maximum" min="0" value="3"> in <input type="number" class="l-win" aria-label="Window" min="1" value="12"> posts, in a row <input type="number" class="l-con" aria-label="Maximum in a row" min="1" value="1"><button class="btn small danger rm-limit" type="button">Remove</button></div>`);
      });
    },
    async save(root) {
      const topics = (kind) => $$(`.topic[data-kind="${kind}"]`, root).map((r) => {
        const name = $(".t-name", r).value.trim();
        const prev = [...(t.primary || []), ...(t.secondary || [])].find((x) => x.id && x.id === r.dataset.id) || {};
        return { ...prev, id: r.dataset.id || slug(name), name, keywords: csv($(".t-kw", r).value) };
      }).filter((x) => x.name);
      const primary = topics("primary");
      if (!primary.length) throw new Error("Keep at least one primary topic");
      if (primary.length > 3) toast("More than 3 primary topics blurs your topic fingerprint", "bad");
      const rules = (kind) => $$(`.rule[data-kind="${kind}"]`, root).map((r) => {
        const pats = lines($(".r-pat", r).value);
        pats.forEach((p) => { try { new RegExp(p, "i"); } catch { throw new Error(`Bad pattern: ${p}`); } });
        const o = { id: $(".r-id", r).value.trim() || slug($(".r-label", r).value), label: $(".r-label", r).value.trim(), patterns: pats };
        if (kind === "exclude" && $(".r-strict", r)?.checked) o.strict = true;
        return o;
      }).filter((r) => r.patterns.length);
      const theme_limits = {};
      $$(".limit", root).forEach((l) => {
        const id = $(".l-id", l).value.trim();
        if (!id) return;
        const o = { max: Number($(".l-max", l).value), window: Number($(".l-win", l).value) || 12 };
        if ($(".l-con", l).value) o.max_consecutive = Number($(".l-con", l).value);
        theme_limits[id] = o;
      });
      const next = { ...t, primary, secondary: topics("secondary"), story_filters: { prefer: rules("prefer"), exclude: rules("exclude") }, theme_limits };
      return [{ path: `authors/${ctx.author}/brand/topics.yaml`, content: ctx.data.dumpYaml(next) }];
    },
  };
};

T.moves = async (ctx, d) => {
  const [libData, box, chains] = await Promise.all([ctx.data.moveLibrary(), ctx.data.toolbox(), ctx.data.chains(ctx.author)]);
  const lib = libData.moves || [];
  const mine = Object.fromEntries((d.brand.moves.moves || []).map((m) => [m.id, m.weight]));
  const bal = Object.fromEntries((d.mem.ledger?.move_balance || []).map((m) => [m.id, m]));
  const entries = (m) => chains[m.id]?.steps?.length ? chains[m.id].steps : (m.steps || []);
  return {
    html: html`
      <p class="lead">Your post strategies: the seven ways authors build a brand post after post. Each one is a chain of reasoning
        steps: where the engine looks, and what a draft must do (find the opposing view, put a deal in proportion, name the limits).
        Every week starts with choosing the strategy for that week; the engine recommends the one furthest behind its weight.</p>
      <div class="grid-2">${lib.map((m) => html`<label class="card move-card ${m.id in mine ? "on" : ""}" data-id="${m.id}">
        <div class="row between"><span class="row" style="gap:10px"><input type="checkbox" class="m-on" ${m.id in mine ? "checked" : ""}><strong>${m.name}</strong></span>
          <span class="small muted">like ${m.known_example}</span></div>
        <p class="small">${m.feels_like || m.idea}</p>
        <p class="small muted">Shapes: ${join(m.playbooks)}</p>
        ${bal[m.id] ? html`<p class="small ${bal[m.id].need >= 7 ? "" : "muted"}" style="${bal[m.id].need >= 7 ? "color:var(--warn);font-weight:600" : ""}">${bal[m.id].served} recent post${bal[m.id].served === 1 ? "" : "s"} · need ${Math.round(bal[m.id].need)}/10</p>` : ""}
        <span class="row small">Weight <input type="number" class="m-w" min="1" max="100" value="${mine[m.id] ?? 30}" aria-label="Weight for ${m.name}"></span>
      </label>`)}</div>
      <section class="card stack" aria-labelledby="ch-h"><h2 id="ch-h">How each of your strategies thinks</h2>
        <p class="small muted">The steps run in this order, every week the strategy is used. Required steps must leave proof (a saved source, your note, or a sentence on what was found); the draft shows any that could not run. Add your own step when the library misses one.</p>
        ${lib.filter((m) => m.id in mine).map((m) => html`<details class="card flat" ${Object.keys(mine).length === 1 ? "open" : ""}>
          <summary><strong>${m.name}</strong> <span class="small muted">· ${chains[m.id]?.steps?.length ? "your version" : "library version"} · ${entries(m).length} steps</span></summary>
          <div style="margin-top:10px">${chainEditor(m.id, fullSteps(entries(m), box), box)}</div>
          ${chains[m.id]?.steps?.length ? html`<button type="button" class="btn small reset-chain" data-move="${m.id}" style="margin-top:8px">Back to the library version</button>` : ""}
        </details>`)}
        <p class="small muted">A strategy you just ticked gets its library chain; save, then adjust it here.</p></section>
      ${savebar()}`,
    bind(root) {
      root.addEventListener("change", (e) => { if (e.target.classList.contains("m-on")) e.target.closest(".move-card").classList.toggle("on", e.target.checked); });
      bindChainEditors(root, box);
      root.addEventListener("click", (e) => {
        if (!e.target.classList.contains("reset-chain")) return;
        e.target.closest("details").dataset.reset = "1";
        e.target.textContent = "Will use the library version when you save";
        e.target.disabled = true;
      });
    },
    async save(root) {
      const moves = $$(".move-card", root).filter((c) => $(".m-on", c).checked).map((c) => ({ id: c.dataset.id, weight: Number($(".m-w", c).value) || 10 }));
      if (!moves.length) throw new Error("Choose at least one strategy");
      if (moves.length > 3) toast("More than three strategies blurs what you are known for", "bad");
      const next = { ...chains };
      for (const ed of $$(".chain-editor", root)) {
        const move = ed.dataset.move;
        const libSteps = (lib.find((m) => m.id === move)?.steps || []);
        const steps = readChain(ed, box);
        if (ed.closest("details")?.dataset.reset === "1" || JSON.stringify(steps) === JSON.stringify(libSteps)) delete next[move];
        else {
          if (!steps.length) throw new Error("A strategy needs at least one step");
          next[move] = { ...(chains[move] || {}), steps };
        }
      }
      return [
        { path: `authors/${ctx.author}/brand/moves.yaml`, content: ctx.data.dumpYaml({ moves }) },
        { path: `authors/${ctx.author}/brand/chains.yaml`, content: ctx.data.dumpYaml({ chains: next }, "# Your reasoning chains (Brand > Post strategies). Toolbox: library/steps.yaml. Field guide: docs/FILE_FORMATS.md\n") },
      ];
    },
  };
};

T.lenses = async (ctx, d) => {
  const L = d.brand.lenses;
  const card = (l) => html`<section class="card lens-card" data-id="${l.id || ""}">
    <div class="form-grid"><label class="field">Name<input type="text" class="l-title" value="${l.title || ""}"></label>
      <label class="field">Use it when<input type="text" class="l-when" value="${l.applies_when || ""}" placeholder="the story touches …"></label></div>
    <label class="field">What you notice first<input type="text" class="l-first" value="${l.notices_first || ""}"></label>
    <label class="field">Phrases you would really say (one per line, optional)<textarea class="l-say" rows="2">${join(l.say_it_like, "\n")}</textarea></label>
    <div class="form-grid"><label class="field">Words you use<input type="text" class="l-use" value="${join(l.words_used)}"></label>
      <label class="field">Words you never use<input type="text" class="l-avoid" value="${join(l.words_avoided)}"></label></div>
    <label class="field">Concrete anchors (products, applications, markets)<input type="text" class="l-anchors" value="${join(l.anchors)}"></label>
    <button class="btn small danger rm" type="button" style="align-self:flex-start">Remove lens</button></section>`;
  return {
    html: html`
      <p class="lead">A lens is the angle only you would take. Each post uses one, in natural words. Connections between facts must come from a source, or are labelled as your reading.</p>
      <div id="lenses" class="stack">${(L.lenses || []).map(card)}</div>
      <button class="btn" id="add" type="button" style="align-self:flex-start">+ Add a lens</button>
      <section class="card stack-s"><label class="field">Reader roles your posts may name<span class="hint">Comma separated.</span>
        <input type="text" id="readers" value="${join(L.readers)}"></label></section>
      ${savebar()}`,
    bind(root) {
      $("#add", root).addEventListener("click", () => $("#lenses", root).insertAdjacentHTML("beforeend", String(card({}))));
      root.addEventListener("click", (e) => { if (e.target.classList.contains("rm")) e.target.closest(".lens-card")?.remove(); });
    },
    async save(root) {
      const lenses = $$(".lens-card", root).map((c) => {
        const title = $(".l-title", c).value.trim();
        const prev = (L.lenses || []).find((x) => x.id && x.id === c.dataset.id) || {};   // keep fields the form does not show
        const o = { ...prev, id: c.dataset.id || slug(title), title, applies_when: $(".l-when", c).value.trim(), notices_first: $(".l-first", c).value.trim() };
        const say = lines($(".l-say", c).value); if (say.length) o.say_it_like = say; else delete o.say_it_like;
        o.words_used = csv($(".l-use", c).value); o.words_avoided = csv($(".l-avoid", c).value); o.anchors = csv($(".l-anchors", c).value);
        return o;
      }).filter((l) => l.title);
      return [{ path: `authors/${ctx.author}/brand/lenses.yaml`, content: ctx.data.dumpYaml({ ...L, lenses, readers: csv($("#readers", root).value) }) }];
    },
  };
};

T.voice = async (ctx, d) => {
  const r = d.brand.voiceRules;
  const reg = await ctx.data.lintRules();
  const levels = r.rules || {};
  const NUMS = [["figures_warn_above", "Figures in a post, aim for at most", 8], ["research_figures_warn_above", "Figures in a research post, aim for at most", 6],
    ["negative_parallelism_block_at", "“Not X, but Y”: block from", 2], ["ai_words_block_at", "AI words: block from", 3],
    ["triplets_warn_at", "Lists of three: warn from", 3], ["opening_max_sentences", "Opening paragraph, max sentences", 2], ["opening_window", "Compare the opening with the last N posts", 8]];
  const len = r.length || {};
  const rg = r.reading_grade || [8, 10];
  const disc = r.disclosure || {};
  return {
    html: html`
      <p class="lead">How your posts sound. The voice guide is read by every draft; the limits below are checked by a script, so they always hold.</p>
      <section class="card stack"><h2>Limits</h2>
        <div class="form-grid">
          <label class="field">Length, characters<span class="row"><input type="number" id="len-min" value="${len.min ?? 1000}" aria-label="Minimum"> to <input type="number" id="len-max" value="${len.max ?? 2200}" aria-label="Maximum"> · never above <input type="number" id="len-hard" value="${len.hard_max ?? 2800}" aria-label="Hard maximum"></span></label>
          <label class="field">Opening sentence, max characters<input type="number" id="hook" value="${r.hook_max_chars ?? 140}"></label>
          <label class="field">Reading grade (lower = easier)<span class="row"><input type="number" id="rg-lo" value="${rg[0]}" aria-label="From"> to <input type="number" id="rg-hi" value="${rg[1]}" aria-label="To"></span></label>
          <label class="field">First-person sentences, max<input type="number" id="fp" value="${r.first_person_max ?? 1}" min="0"></label>
          <label class="field">Quote length, max words<input type="number" id="qmax" value="${r.quote_max_words ?? 25}"></label>
          <label class="field">Label for your own reading<input type="text" id="label" value="${r.reading_label || "My reading"}"><span class="hint">Any connection a source does not state appears after this label.</span></label>
          <label class="field">Hashtags, max<input type="number" id="hash" value="${r.hashtags_max ?? 1}" min="0"></label>
          <label class="field">Emoji, max<input type="number" id="emoji" value="${r.emoji_max ?? 2}" min="0"></label>
        </div>
        <div class="form-grid">
          <label class="field">Never start with (one per line)<textarea id="openers" rows="4">${join(r.banned_openers, "\n")}</textarea></label>
          <label class="field">Never write these phrases (one per line)<textarea id="phrases" rows="4">${join(r.banned_phrases, "\n")}</textarea></label>
          <label class="field">Avoid these words (comma separated)<textarea id="words" rows="3">${join(r.banned_words)}</textarea></label>
          <label class="field">Never end with (one per line)<textarea id="endings" rows="3">${join(r.banned_endings, "\n")}</textarea></label>
        </div>
        <div class="form-grid">
          <label class="field">Disclosure line<input type="text" id="disc-line" value="${disc.line || ""}"></label>
          <label class="field">Add it when the post mentions (comma separated)<input type="text" id="disc-when" value="${join(disc.when_any)}"></label>
        </div></section>
      <section class="card stack"><h2>Voice rules</h2>
        <p class="small muted">Every draft passes these numbered checks. A rule that blocks flags the draft until it is fixed; a warning is advice shown with the draft. Change a rule's level, or switch it off, when it does not fit how you write.</p>
        <div class="table-wrap"><table><thead><tr><th>Rule</th><th>What it checks</th><th>Level</th></tr></thead><tbody>
          ${reg.map((x) => html`<tr><td class="mono" style="white-space:nowrap">${x.id}</td><td><strong>${x.name}</strong><div class="small muted">${x.what}</div></td>
            <td><select class="rule-level" data-id="${x.id}" aria-label="Level for ${x.id}">
              ${[["", `Default (${x.level})`], ["block", "Block"], ["warn", "Warn"], ["off", "Off"]].map(([v, l]) => html`<option value="${v}" ${(levels[x.id] || "") === v ? "selected" : ""}>${l}</option>`)}</select></td></tr>`)}
        </tbody></table></div>
        <div class="form-grid">${NUMS.map(([k, label, def]) => html`<label class="field">${label}<input type="number" class="rule-num" data-k="${k}" min="0" step="any" value="${r[k] ?? def}"></label>`)}</div>
        <div class="form-grid">
          <label class="field">Terms to explain the first time, or leave out (comma separated)<textarea id="jargon" rows="2">${join(r.jargon_terms)}</textarea></label>
          <label class="field">Phrases about your own vantage point that are not first-hand events (one per line)<span class="hint">e.g. “from where I sit”. Real events (“a customer told me”) still need a first-hand note.</span><textarea id="persp" rows="2">${join(r.perspective_phrases, "\n")}</textarea></label>
        </div></section>
      <section class="card stack"><h2>Voice guide</h2><p class="small muted">Plain Markdown. The engine adds short dated rules from your feedback under “Lessons from feedback”; edit or delete them here.</p>
        <textarea id="voice-md" class="tall">${d.voiceMd || ""}</textarea></section>
      ${savebar()}`,
    async save(root) {
      const num = (id) => Number($(id, root).value);
      const next = { ...r,
        length: { min: num("#len-min"), max: num("#len-max"), hard_max: num("#len-hard") }, hook_max_chars: num("#hook"),
        reading_grade: [num("#rg-lo"), num("#rg-hi")], first_person_max: num("#fp"), quote_max_words: num("#qmax"),
        reading_label: $("#label", root).value.trim() || "My reading", hashtags_max: num("#hash"), emoji_max: num("#emoji"),
        banned_openers: lines($("#openers", root).value), banned_phrases: lines($("#phrases", root).value),
        banned_words: csv($("#words", root).value), banned_endings: lines($("#endings", root).value),
        disclosure: { when_any: csv($("#disc-when", root).value), line: $("#disc-line", root).value.trim() } };
      const rules = {};
      $$(".rule-level", root).forEach((sel) => { if (sel.value) rules[sel.dataset.id] = sel.value; });
      next.rules = rules;
      $$(".rule-num", root).forEach((i) => { if (i.value !== "") next[i.dataset.k] = Number(i.value); });
      next.jargon_terms = csv($("#jargon", root).value);
      next.perspective_phrases = lines($("#persp", root).value);
      if (next.length.min > next.length.max || next.length.max > next.length.hard_max) throw new Error("Length: min ≤ max ≤ never above");
      return [
        { path: `authors/${ctx.author}/brand/voice-rules.yaml`, content: ctx.data.dumpYaml(next) },
        { path: `authors/${ctx.author}/brand/voice.md`, content: $("#voice-md", root).value.replace(/\s*$/, "\n") },
      ];
    },
  };
};

T.profile = async (ctx, d) => ({
  html: html`
    <div class="notice info">Profile facts are the only facts about you a post may state. First-person events (“I saw…”) come only from your first-hand notes in Inputs.</div>
    <section class="card stack"><h2>Verified profile facts</h2><textarea id="profile" class="tall">${d.profileMd || ""}</textarea></section>
    <section class="card stack"><h2>Boundaries (compliance checklist)</h2><p class="small muted">A numbered pass/fail list. Every draft is checked against each item.</p>
      <textarea id="compliance" class="tall" style="min-height:220px">${d.complianceMd || ""}</textarea></section>
    <section class="card stack"><h2>Glossary</h2><p class="small muted">Plain explanations used the first time a term appears.</p>
      <textarea id="glossary" class="tall" style="min-height:220px">${d.glossaryMd || ""}</textarea></section>
    ${savebar()}`,
  async save(root) {
    const f = (id, name) => ({ path: `authors/${ctx.author}/brand/${name}`, content: $(id, root).value.replace(/\s*$/, "\n") });
    return [f("#profile", "profile.md"), f("#compliance", "compliance.md"), f("#glossary", "glossary.md")];
  },
});

T.sources = async (ctx, d) => {
  const data = (await ctx.data.yaml(`authors/${ctx.author}/sources/sources.yaml`, { sources: [] })) || { sources: [] };
  const health = (await ctx.data.json(`authors/${ctx.author}/sources/health.json`, {})) || {};
  const row = (s) => {
    const h = health[s.name];
    const bad = h && h.fails_in_row >= 3;
    return html`<tr class="src"><td><input type="checkbox" class="s-on" aria-label="Enabled" ${s.enabled === false ? "" : "checked"}></td>
      <td><input type="text" class="s-name" aria-label="Name" value="${s.name || ""}"></td>
      <td><select class="s-type" aria-label="Type">${["rss", "page", "openalex"].map((t) => html`<option ${s.type === t ? "selected" : ""}>${t}</option>`)}</select></td>
      <td><input type="url" class="s-url" aria-label="Address" value="${s.url || ""}"></td>
      <td><select class="s-tier" aria-label="Tier">${["primary", "research", "trade", "vendor", "lead"].map((t) => html`<option ${s.tier === t ? "selected" : ""}>${t}</option>`)}</select></td>
      <td class="small ${bad ? "" : "muted"}" style="${bad ? "color:var(--bad)" : ""}">${h ? `${h.last?.status || ""}${bad ? ` · failed ${h.fails_in_row}×` : ""}` : "–"}</td>
      <td><button class="btn small danger rm" type="button" aria-label="Remove source">✕</button></td></tr>`;
  };
  return {
    html: html`
      <p class="lead">Where the engine looks every week, besides its budgeted web searches. Primary and research sources count as evidence; leads (news aggregators) only point to them.</p>
      <section class="card" style="padding:10px"><div class="table-wrap"><table style="min-width:820px">
        <thead><tr><th>On</th><th>Name</th><th>Type</th><th>Address</th><th>Tier</th><th>Last run</th><th></th></tr></thead>
        <tbody id="rows">${(data.sources || []).map(row)}</tbody></table></div>
        <button class="btn small" id="add" type="button" style="margin:10px">+ Add a source</button></section>
      ${savebar()}`,
    bind(root) {
      $("#add", root).addEventListener("click", () => $("#rows", root).insertAdjacentHTML("beforeend", String(row({ type: "rss", tier: "trade", enabled: true }))));
      root.addEventListener("click", (e) => { if (e.target.classList.contains("rm")) e.target.closest(".src")?.remove(); });
    },
    async save(root) {
      const old = Object.fromEntries((data.sources || []).map((s) => [s.name, s]));
      const sources = $$(".src", root).map((r) => {
        const name = $(".s-name", r).value.trim();
        const url = $(".s-url", r).value.trim();
        if (/linkedin\.com|lnkd\.in/i.test(url)) throw new Error("LinkedIn is never a source");
        return { ...(old[name] || {}), name, type: $(".s-type", r).value, url, tier: $(".s-tier", r).value, enabled: $(".s-on", r).checked };
      }).filter((s) => s.name && s.url);
      return [{ path: `authors/${ctx.author}/sources/sources.yaml`, content: ctx.data.dumpYaml({ sources }) }];
    },
  };
};

T.schedule = async (ctx, d) => {
  const a = await ctx.data.author(ctx.author);
  const s = { strategy_prompt: { day: "sat", time: "18:00" }, strategy_by: { day: "sun", time: "12:00" }, ...(a.schedule || {}) };
  const vis = d.brand.visual || {};
  const sc = { brand_fit: 40, move_fit: 20, significance: 25, angle: 20, freshness: 15, ...(a.scoring || {}) };
  const dayTime = (key, label, hint) => html`<label class="field">${label}<span class="row"><select id="${key}-day" aria-label="${label} day">${DAYS.map(([v, n]) => html`<option value="${v}" ${s[key]?.day === v ? "selected" : ""}>${n}</option>`)}</select>
    <input type="time" id="${key}-time" value="${s[key]?.time || "09:00"}" aria-label="${label} time"></span><span class="hint">${hint}</span></label>`;
  return {
    html: html`
      <section class="card stack"><h2>Your week</h2>
        <div class="form-grid">
          <label class="field">Ask me which strategy each week<select id="gate"><option value="yes" ${s.strategy_gate !== false ? "selected" : ""}>Yes, before the story cards</option><option value="no" ${s.strategy_gate === false ? "selected" : ""}>No, the engine decides</option></select>
            <span class="hint">No answer in time: the engine's recommendation is used.</span></label>
          ${dayTime("strategy_prompt", "Strategy question arrives", "Saturday and Sunday belong to the weekend before the week.")}
          ${dayTime("strategy_by", "Choose the strategy by", "Then story cards are found for your choice.")}
          ${dayTime("discover", "Story cards arrive (at the latest)", "Sunday evening prepares the coming week.")}
          ${dayTime("pick_by", "Pick a story by", "")}
          ${dayTime("approve_by", "Approve the draft by", "")}
          <label class="field">Best posting time (shown in the email)<input type="text" id="posting" value="${s.posting_time || ""}"></label>
          <label class="field">If you don't pick in time<select id="no-pick"><option value="top_card" ${a.defaults?.no_pick !== "skip_week" ? "selected" : ""}>Use the top card</option><option value="skip_week" ${a.defaults?.no_pick === "skip_week" ? "selected" : ""}>Skip the week</option></select></label>
          <label class="field">If you don't approve in time<select id="no-approval"><option value="send_unreviewed" ${a.defaults?.no_approval !== "skip_week" ? "selected" : ""}>Send it marked “not reviewed”</option><option value="skip_week" ${a.defaults?.no_approval === "skip_week" ? "selected" : ""}>Skip the week</option></select></label>
          <label class="field">Story cards per week<input type="number" id="cands" min="2" max="6" value="${a.candidates || 4}"></label>
          <label class="field">Time zone<input type="text" id="tz" value="${a.timezone || "Europe/Stockholm"}"></label>
        </div></section>
      <details class="advanced-controls"><summary>Advanced · story ranking weights</summary><p class="small muted">Goal need favours under-covered goals; strategy balance favours under-used strategies. Significance measures impact, angle measures your distinct perspective, and freshness measures recency.</p>
        <div class="form-grid">${[["brand_fit", "Goal need (brand fit)"], ["move_fit", "Strategy balance"], ["significance", "Significance"], ["angle", "Your own angle"], ["freshness", "Freshness"]].map(([k, n]) => html`
          <label class="field">${n}<input type="number" class="sc" data-k="${k}" min="0" max="100" value="${sc[k] ?? 0}"></label>`)}</div></details>
      <section class="card stack"><h2>Email and image</h2>
        <div class="form-grid">
          <label class="field">Your recipient email<input type="email" id="email" value="${a.email || ""}"></label>
          <label class="field">Also send to (comma separated)<input type="text" id="email-also" value="${join(a.email_also)}"></label>
          <label class="field">Image style<select id="style"><option value="clean" ${vis.style !== "warm" ? "selected" : ""}>Clean (geometric)</option><option value="warm" ${vis.style === "warm" ? "selected" : ""}>Warm (editorial)</option></select></label>
          <label class="field">Default colour<select id="theme">${["blue", "teal", "slate", "terracotta", "sage", "plum", "mustard"].map((t) => html`<option ${vis.default_theme === t ? "selected" : ""}>${t}</option>`)}</select></label>
        </div><div class="row"><button type="button" class="btn small" id="test-email">Send test email</button><span class="small muted">Uses your saved address: ${a.email || "no address saved"}. Save address changes before testing.</span></div></section>
      ${savebar()}`,
    bind(root) {
      $("#test-email", root).addEventListener("click", async (event) => {
        if ($("#email", root).value.trim() !== (a.email || "")) { toast("Save your new email address before sending a test", "bad"); return; }
        if (!a.email) { toast("Save a recipient email first", "bad"); return; }
        await withSaving(event.currentTarget, () => ctx.backend.dispatch({ action: "test-email", author: ctx.author, week: ctx.week }), "Email test queued. Check Settings for the delivery result.");
      });
    },
    async save(root) {
      const v = (id) => $(id, root).value.trim();
      const email = v("#email");
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That email address looks wrong");
      const scoring = { ...(a.scoring || {}) };
      $$(".sc", root).forEach((input) => {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Ranking weights must be between 0 and 100");
        if (value !== sc[input.dataset.k]) scoring[input.dataset.k] = value;
      });
      const next = { ...a,
        email, email_also: csv(v("#email-also")), timezone: v("#tz") || "Europe/Stockholm", candidates: Number(v("#cands")) || 4,
        schedule: { ...s, strategy_gate: v("#gate") !== "no", strategy_prompt: { day: v("#strategy_prompt-day"), time: v("#strategy_prompt-time") },
          strategy_by: { day: v("#strategy_by-day"), time: v("#strategy_by-time") }, discover: { day: v("#discover-day"), time: v("#discover-time") }, pick_by: { day: v("#pick_by-day"), time: v("#pick_by-time") },
          approve_by: { day: v("#approve_by-day"), time: v("#approve_by-time") }, posting_time: v("#posting") },
        defaults: { ...(a.defaults || {}), no_pick: v("#no-pick"), no_approval: v("#no-approval") } };
      if (Object.keys(scoring).length) next.scoring = scoring;
      const visual = { ...vis, style: v("#style"), default_theme: v("#theme") };
      return [
        { path: `authors/${ctx.author}/author.yaml`, content: ctx.data.dumpYaml(next) },
        { path: `authors/${ctx.author}/brand/visual.yaml`, content: ctx.data.dumpYaml(visual) },
      ];
    },
  };
};

T.reviews = async (ctx) => {
  const reviews = await ctx.data.reviews(ctx.author);
  const changes = (await ctx.data.text(`authors/${ctx.author}/brand/changes.md`)) || "";
  return {
    html: html`
      <p class="lead">Once a month the engine reviews what worked, and a CV recalibration compares your CV with your brand. Small changes (focus, context) apply automatically; anything structural waits for your yes.</p>
      ${reviews.length ? reviews.map(({ month, review, decisions }) => html`<section class="card stack">
        <div class="row between"><h2>${review.kind === "cv-calibration" ? `CV calibration · ${month.slice(0, 10)}` : `Monthly review · ${month}`}</h2><span class="small muted">${(review.proposals || []).length} proposals</span></div>
        ${review.summary ? html`<p>${review.summary}</p>` : ""}
        ${review.topic_check ? html`<div class="card flat stack-s topic-check" data-month="${month}">
          <strong>Are these still the right topics?</strong>
          <ul class="small" style="margin:0;padding-left:18px">${review.topic_check.topics.map((t) => html`<li>${t.name} <span class="muted">(${t.kind}): ${t.cards} story card${t.cards === 1 ? "" : "s"} this month</span></li>`)}</ul>
          ${review.topic_check.outside?.length ? html`<p class="small" style="margin:0">Strong stories outside every topic:</p><ul class="small muted" style="margin:0;padding-left:18px">${review.topic_check.outside.map((o) => html`<li>${o}</li>`)}</ul>` : ""}
          ${review.topic_check.answer ? html`<span class="chip ok">${review.topic_check.answer === "keep" ? "You kept your topics" : `Change requested: see ${review.topic_check.answer.proposal}`}</span>`
            : decisions._topics ? html`<span class="small muted">Your answer is being applied.</span>`
            : html`<div class="row"><button class="btn small tc-keep">Keep my topics</button></div>
              <label class="field"><span class="hint">Or say what to change; it becomes a proposal you approve.</span><textarea class="tc-text" rows="2"></textarea></label>
              <button class="btn small tc-change" style="align-self:flex-start">Propose this change</button>`}
        </div>` : ""}
        ${(review.proposals || []).filter((p) => !p.status && !decisions[p.id]).length > 1 ? html`<div class="row bulk" data-month="${month}">
          <button class="btn small all" data-v="approve">Approve all open</button><button class="btn small all" data-v="reject">Reject all open</button>
          <span class="small muted">Or decide one by one below.</span></div>` : ""}
        ${(review.auto_changes || []).length ? html`<details><summary>Changed automatically (${review.auto_changes.length})</summary><ul class="small">${review.auto_changes.map((x) => html`<li>${x}</li>`)}</ul></details>` : ""}
        ${(review.proposals || []).map((p) => {
          const v = p.status === "applied" || p.status === "approved-manual" ? "approve" : p.status === "rejected" ? "reject" : decisions[p.id];
          return html`<div class="card flat stack-s proposal" data-month="${month}" data-id="${p.id}">
            <div><strong>${p.id} · ${p.title}</strong> <span class="small muted">${p.reason || ""}</span></div>
            ${p.evidence ? html`<p class="small muted">${p.evidence}</p>` : ""}
            ${p.status ? html`<span class="chip ${p.status === "rejected" ? "" : "ok"}">${p.status}</span>`
              : html`<div class="row"><button class="btn small ${v === "approve" ? "primary" : ""} vote" data-v="approve">Approve</button>
                <button class="btn small vote" data-v="reject">Reject</button>${v ? html`<span class="small muted">Your answer: ${v}</span>` : ""}</div>`}
          </div>`;
        })}</section>`) : html`<div class="empty"><h2>No review yet</h2><p>The first one runs on the 1st of next month.</p>
          <button class="btn" id="run-review">Run a review now</button></div>`}
      <details class="card"><summary>Change history</summary><pre class="box">${changes || "No changes yet."}</pre></details>`,
    bind(root) {
      root.querySelectorAll(".vote").forEach((b) => b.addEventListener("click", async () => {
        const p = b.closest(".proposal");
        const path = `authors/${ctx.author}/memory/reviews/${p.dataset.month}-decisions.json`;
        const cur = (await ctx.data.json(path, {})) || {};
        cur[p.dataset.id] = b.dataset.v;
        await withSaving(b, () => ctx.data.save([{ path, content: JSON.stringify({ ...cur, _by: "app", _at: new Date().toISOString() }, null, 2) + "\n" }],
          `app: ${ctx.author} review ${p.dataset.month} ${p.dataset.id} ${b.dataset.v}`), b.dataset.v === "approve" ? "Approved; it is applied in a minute" : "Rejected");
        ctx.refresh();
      }));
      root.querySelectorAll(".bulk .all").forEach((b) => b.addEventListener("click", async () => {
        const month = b.closest(".bulk").dataset.month;
        const path = `authors/${ctx.author}/memory/reviews/${month}-decisions.json`;
        const cur = (await ctx.data.json(path, {})) || {};
        const open = $$(`.proposal[data-month="${month}"]`, root).filter((p) => p.querySelector(".vote")).map((p) => p.dataset.id).filter((id) => !cur[id]);
        open.forEach((id) => { cur[id] = b.dataset.v; });
        await withSaving(b, () => ctx.data.save([{ path, content: JSON.stringify({ ...cur, _by: "app", _at: new Date().toISOString() }, null, 2) + "\n" }],
          `app: ${ctx.author} review ${month} ${b.dataset.v} ${open.join(",")}`), `${open.length} ${b.dataset.v === "approve" ? "approved" : "rejected"}`);
        ctx.refresh();
      }));
      root.querySelectorAll(".topic-check").forEach((box) => {
        const send = async (btn, value, msg) => {
          const path = `authors/${ctx.author}/memory/reviews/${box.dataset.month}-decisions.json`;
          const cur = (await ctx.data.json(path, {})) || {};
          cur._topics = value;
          await withSaving(btn, () => ctx.data.save([{ path, content: JSON.stringify({ ...cur, _by: "app", _at: new Date().toISOString() }, null, 2) + "\n" }],
            `app: ${ctx.author} topic check ${box.dataset.month}`), msg);
          ctx.refresh();
        };
        box.querySelector(".tc-keep")?.addEventListener("click", (e) => send(e.currentTarget, "keep", "Topics kept"));
        box.querySelector(".tc-change")?.addEventListener("click", (e) => {
          const t = box.querySelector(".tc-text").value.trim();
          if (!t) { toast("Write what to change", "bad"); return; }
          send(e.currentTarget, { change: t }, "Sent; it becomes a proposal");
        });
      });
      $("#run-review", root)?.addEventListener("click", (e) => withSaving(e.currentTarget, () => ctx.backend.dispatch({ action: "review", author: ctx.author, week: new Date().toISOString().slice(0, 7) }), "Review started"));
    },
  };
};

// ------------------------------------------------------------------------------------------------ page
export default async function view(ctx, root) {
  const tab = TABS.some(([id]) => id === ctx.sub) ? ctx.sub : "overview";
  const [brand, mem, voiceMd, profileMd, complianceMd, glossaryMd, srcs] = await Promise.all([
    ctx.data.brand(ctx.author), ctx.data.memory(ctx.author), ctx.data.brandText(ctx.author, "voice.md"), ctx.data.brandText(ctx.author, "profile.md"),
    ctx.data.brandText(ctx.author, "compliance.md"), ctx.data.brandText(ctx.author, "glossary.md"),
    ctx.data.yaml(`authors/${ctx.author}/sources/sources.yaml`, { sources: [] }),
  ]);
  const d = { brand, mem, voiceMd, profileMd, complianceMd, glossaryMd, sourcesCount: (srcs?.sources || []).filter((s) => s.enabled !== false).length };
  const t = await T[tab](ctx, d);
  renderInto(root, html`
    ${pageHead({ title: "What you are building", sub: "Your destination, your voice, your boundaries." })}
    <details class="small muted"><summary>Saving and change history</summary><p>Saved changes are commits in your private repository. History and restoration are available on GitHub; structured form saves rewrite YAML without its comments.</p></details>
    <a class="small" href="#/brand/profile?author=${ctx.author}">Your boundaries · what must never appear</a>
    <nav class="brand-navigation" aria-label="Brand sections">${[
      ["Overview", ["overview"]], ["What I am building", ["destination", "goals", "topics"]],
      ["How I write", ["moves", "lenses", "voice", "profile"]], ["How it runs", ["sources", "schedule", "reviews"]],
    ].map(([label, ids]) => html`<div><span class="small muted">${label}</span><div class="subtabs" role="tablist" aria-label="${label}">${ids.map((id) => html`<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${TABS.find(([key]) => key === id)[1]}</button>`)}</div></div>`)}</nav>
    <div class="stack" id="tab">${t.html}</div>`);
  $$(".subtabs button", root).forEach((b) => b.addEventListener("click", () => {
    if (!ctx.allowNavigation()) return;
    ctx.setDirty(false);
    location.hash = `#/brand/${b.dataset.tab}?author=${encodeURIComponent(ctx.author)}`;
  }));
  const tabRoot = $("#tab", root);
  t.bind?.(tabRoot);
  const saveBtn = $("#save", tabRoot);
  if (saveBtn && t.save) {
    const markDirty = () => { ctx.setDirty(true); $("#dirty", tabRoot).innerHTML = '<span class="dirty-dot"></span> Unsaved changes'; };
    tabRoot.addEventListener("input", markDirty);
    tabRoot.addEventListener("change", markDirty);
    tabRoot.addEventListener("click", (event) => { if (event.target.closest("button:not(#save):not(#test-email)")) markDirty(); });
    saveBtn.addEventListener("click", async () => {
      let files;
      try { files = await t.save(tabRoot); } catch (e) { toast(e.message, "bad"); return; }
      await withSaving(saveBtn, () => ctx.data.save(files, `app: ${ctx.author} edits ${TABS.find(([id]) => id === tab)[1].toLowerCase()}`), "Saved to your repository");
      $("#dirty", tabRoot).textContent = "";
      ctx.setDirty(false);
      if (tab === "schedule") await ctx.reloadAuthors();
    });
  }
}
