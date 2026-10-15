// Gate 1: pick the story. Cards come from weeks/<week>/candidates.json; the choice is written to decisions/story.json.

import { $, $$, html, toast } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, engineNote, renderInto, atLeast, READER_OUTCOMES, brandStory, arcFromLedger } from "../ui.js";

function card(c, chosen, goalsById, movesById) {
  const g = goalsById[c.goal];
  const tierCls = (t) => (t === "primary" || t === "research" ? "ok" : t === "lead" ? "warn" : "");
  return html`<article class="card story ${chosen ? "chosen" : ""} ${c.eligible === false ? "ineligible" : ""}" data-id="${c.id}">
    <div class="top"><span class="eyebrow">${c.rank || ""}${c.rank === 1 && c.eligible !== false ? " · top pick" : ""}</span>
      <span class="score" title="Total score out of 100">${c.total ?? "–"}</span></div>
    <h3>${c.headline}</h3>
    ${c.thread ? html`<p class="thread small">${c.thread}</p>` : ""}
    <p class="why"><strong>Why it matters:</strong> ${c.summary}</p>
    <p class="why"><strong>Your angle:</strong> ${c.angle}</p>
    <div class="chips">
      <span class="chip ${c.brand_fit >= 7 ? "warn" : ""}" title="${g?.question || ""}">Goal · ${c.goal}${c.brand_fit >= 7 ? " (needs a post)" : ""}</span>
      ${c.lens && c.lens !== "none" ? html`<span class="chip">Lens · ${c.lens}</span>` : ""}
      ${c.move ? html`<span class="chip ${c.focus || c.move_fit >= 7 ? "warn" : ""}" title="${movesById[c.move]?.idea || ""}">Strategy · ${movesById[c.move]?.name || c.move}${c.focus ? " (this week's choice)" : c.move_fit >= 7 ? " (behind)" : ""}</span>` : ""}
      ${c.playbook ? html`<span class="chip">Shape · ${c.playbook}</span>` : ""}
      ${c.reader_outcome ? html`<span class="chip">${READER_OUTCOMES[c.reader_outcome] || c.reader_outcome}</span>` : ""}
    </div>
    <div class="small muted">Sources: ${(c.sources || []).map((s, i) => html`${i ? " · " : ""}<a href="${s.url}" target="_blank" rel="noopener">${s.publisher || "source"}</a>${s.tier ? html` <span class="chip ${tierCls(s.tier)}" style="padding:1px 7px;font-size:11px">${s.tier}</span>` : ""}`)}</div>
    ${c.link?.type === "stated" ? html`<div class="small"><span class="chip ok">Connection stated by a source</span> ${c.link.note || ""}</div>` : ""}
    ${c.link?.type === "reading" ? html`<div class="small"><span class="chip reading">Your reading</span> labelled in the post: ${c.link.note || ""}</div>` : ""}
    ${c.ask_me ? html`<div class="notice info small"><strong>Ask me:</strong> ${c.ask_me}</div>` : ""}
    ${c.eligible === false ? html`<div class="notice warn small">Not eligible: ${(c.problems || []).join("; ")}</div>` : ""}
    <details class="small"><summary>Why it ranks here</summary><p class="muted" style="margin:6px 0 0">Goal “${g?.question || c.goal}” needs a post ${c.brand_fit ?? "–"}/10.
      ${c.focus ? "It uses the strategy chosen for this week (strategy fit 10/10)." : `Its strategy needs a post ${c.move_fit ?? "–"}/10.`}
      Significance ${c.scores?.significance ?? "–"}, your angle ${c.scores?.angle ?? "–"}, freshness ${c.scores?.freshness ?? "–"} (0-10, judged by the engine).</p></details>
    <div class="row small muted"><span>Goal need ${c.brand_fit ?? "–"}</span><span>Strategy need ${c.move_fit ?? "–"}</span><span>Significance ${c.scores?.significance ?? "–"}</span><span>Angle ${c.scores?.angle ?? "–"}</span><span>Freshness ${c.scores?.freshness ?? "–"}</span></div>
    <button class="btn ${c.rank === 1 ? "primary" : ""} choose" data-id="${c.id}" ${c.eligible === false ? "disabled" : ""} style="align-self:flex-start">${chosen ? "Chosen" : "Choose this story"}</button>
  </article>`;
}

export default async function view(ctx, root) {
  const [wk, brand, lib, mem] = await Promise.all([ctx.data.week(ctx.author, ctx.week), ctx.data.brand(ctx.author), ctx.data.moveLibrary(), ctx.data.memory(ctx.author)]);
  const arc = wk.arc || arcFromLedger(mem.ledger, brand.strategy, mem.posts, lib.moves, ctx.authorCfg.calibration_start || "");
  const goalsById = Object.fromEntries((brand.goals.goals || []).map((g) => [g.id, g]));
  const movesById = Object.fromEntries((lib.moves || []).map((m) => [m.id, m]));
  const cands = wk.candidates?.candidates || [];
  const story = wk.decisions.story;
  const sdec = wk.decisions.strategy;
  const chosenName = sdec ? (sdec.action === "auto" ? `${arc.recommended?.name || "the recommendation"} (the engine's recommendation)` : movesById[sdec.move]?.name || sdec.move) : null;
  const locked = atLeast(wk.state.stage, "drafted") && wk.state.stage !== "discovered";
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };

  if (!cands.length) {
    renderInto(root, html`${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Pick this week's story", back })}
      ${empty("No story cards yet", "Discovery has not run for this week. Start it now, or wait for the scheduled run.",
        html`<button class="btn primary" id="run">Find stories now</button>`)}`);
    $("#run", root)?.addEventListener("click", (e) => withSaving(e.currentTarget, () => ctx.backend.dispatch({ action: "discover", author: ctx.author, week: ctx.week }), "Discovery started"));
    return;
  }

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Pick this week's story", back,
      sub: "Ranked by the goal and post strategy your brand needs most now, how much the story matters, your own angle, and how fresh it is.",
      right: story ? html`<span class="pill accent">You chose ${story.action === "pick" ? `card ${cands.find((c) => c.id === story.candidate)?.rank || ""}` : story.action}</span>` : "" })}
    ${brandStory(arc, { chosen: chosenName })}
    ${story?.action === "pick" ? html`<div class="notice ok">You chose card ${cands.find((candidate) => candidate.id === story.candidate)?.rank || ""}. The next step is drafting. <a href="#/week?author=${ctx.author}&week=${ctx.week}">Track progress</a>.</div>` : ""}
    ${locked ? html`<div class="notice info">The draft for this pick is already written. Picking again restarts the draft.</div>` : ""}
    <div class="grid-2">${cands.map((c) => card(c, story?.candidate === c.id, goalsById, movesById))}</div>
    <section class="card stack" aria-labelledby="ask">
      <h2 id="ask">Ask me · your first-hand view (optional)</h2>
      <label class="field"><span class="hint">The only thing the engine may use for “I saw” or “a customer told me”. It is saved as your note and quoted as you write it.</span>
        <textarea id="mine" rows="3" placeholder="What did you see or hear about this yourself?">${story?.mine || ""}</textarea></label>
    </section>
    <section class="card stack" aria-labelledby="else">
      <h2 id="else">None of these?</h2>
      <div class="grid-2">
        <label class="field">Search wider<span class="hint">What should the engine look for instead?</span>
          <textarea id="wider-note" rows="2" placeholder="e.g. a regulation story, or news from Asia"></textarea>
          <button class="btn" id="wider" style="align-self:flex-start">Search wider</button></label>
        <label class="field">Use my own story<span class="hint">A story you want to write about this week (a link or a sentence).</span>
          <textarea id="own-story" rows="2"></textarea>
          <button class="btn" id="own" style="align-self:flex-start">Write about this</button></label>
      </div>
      <button class="btn danger small" id="skip" style="align-self:flex-start">Skip this week</button>
    </section>
  `);

  const decide = async (btn, data, msg) => {
    if (locked && !window.confirm("This choice can replace your finished draft. Continue?")) return;
    const mine = $("#mine", root).value.trim();
    await withSaving(btn, () => ctx.data.decide(ctx.author, ctx.week, "story", { ...data, ...(mine ? { mine } : {}) }, wk.package?.id || null), msg);
    toast(engineNote(ctx.backend));
    ctx.refresh();
  };
  $$(".choose", root).forEach((b) => b.addEventListener("click", () => decide(b, { action: "pick", candidate: b.dataset.id }, "Story chosen. Drafting is next; track it on This week.")));
  $("#wider", root).addEventListener("click", (e) => decide(e.currentTarget, { action: "wider", note: $("#wider-note", root).value.trim() }, "Searching wider"));
  $("#own", root).addEventListener("click", (e) => {
    const s = $("#own-story", root).value.trim();
    if (s.length < 10) { toast("Write a sentence or paste a link first", "bad"); return; }
    decide(e.currentTarget, { action: "own", story: s }, "Your story is queued");
  });
  $("#skip", root).addEventListener("click", (e) => {
    if (e.currentTarget.dataset.confirm !== "1") { e.currentTarget.dataset.confirm = "1"; e.currentTarget.textContent = "Tap again to skip this week"; return; }
    decide(e.currentTarget, { action: "skip" }, "Week skipped");
  });
  root.addEventListener("input", () => ctx.setDirty(true));
  ctx.watch(() => ctx.data.week(ctx.author, ctx.week), wk);
}
