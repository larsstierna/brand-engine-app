// Gate 1: pick the story. Cards come from weeks/<week>/candidates.json; the choice is written to decisions/story.json.

import { $, $$, html, toast } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, engineNote, renderInto, atLeast, READER_OUTCOMES, brandStory, arcFromLedger, weekFlow } from "../ui.js";

function hasLessonEvidence(c) {
  return c.link?.type === "case" || (c.sources || []).some((source) => ["case"].includes(source.type || source.kind || source.tier))
    || (c.from_inputs || []).some((input) => String(input).replaceAll("\\", "/").startsWith("mine/"));
}

function strategyChoices(strategies, group, selected, fits = {}, disabled = false, lessonEvidence = false) {
  return html`<fieldset class="strategy-choice"><legend>How would you write it?</legend><div class="strategy-options">
    ${strategies.map((strategy) => {
      const fit = fits[strategy.id];
      const poor = Number.isInteger(fit?.fit) && fit.fit < 4;
      const needsEvidence = strategy.id === "share-lesson" && !lessonEvidence;
      return html`<label class="strategy-option ${poor ? "poor" : ""} ${needsEvidence ? "needs-evidence" : ""} ${disabled || needsEvidence ? "disabled" : ""}" title="${poor ? fit.why : needsEvidence ? "Needs your own note or a sourced case" : ""}">
        <input type="radio" name="${group}" value="${strategy.id}" ${selected === strategy.id ? "checked" : ""} ${disabled || needsEvidence ? "disabled" : ""}>
        <span>${strategy.name}</span>${fit ? html`<small>${fit.fit}/10</small>` : ""}
      </label>`;
    })}</div></fieldset>`;
}

function card(c, chosen, goalsById, strategies, selectedStrategy, hasStoryChoice = false, showStrategyChoice = true) {
  const g = goalsById[c.goal];
  const tierCls = (t) => (t === "primary" || t === "research" ? "ok" : t === "lead" ? "warn" : "");
  const lessonEvidence = hasLessonEvidence(c);
  return html`<article class="card story ${chosen ? "chosen" : ""} ${hasStoryChoice && !chosen ? "dimmed" : ""} ${c.eligible === false ? "ineligible" : ""}" data-id="${c.id}">
    <div class="top"><span class="eyebrow">${c.rank || ""}${c.rank === 1 && c.eligible !== false ? " · top pick" : ""}</span>
      <span class="score" title="Total score out of 100">${c.total ?? "–"}</span></div>
    <h3>${c.headline}</h3>
    ${c.thread ? html`<p class="thread small">${c.thread}</p>` : ""}
    <p class="why"><strong>Why it matters:</strong> ${c.summary}</p>
    <p class="why"><strong>Your angle:</strong> ${c.angle}</p>
    <div class="chips">
      <span class="chip ${c.brand_fit >= 7 ? "warn" : ""}" title="${g?.question || ""}">Goal · ${c.goal}${c.brand_fit >= 7 ? " (needs a post)" : ""}</span>
      ${c.lens && c.lens !== "none" ? html`<span class="chip">Lens · ${c.lens}</span>` : ""}
      ${c.playbook ? html`<span class="chip">Shape · ${c.playbook}</span>` : ""}
      ${c.reader_outcome ? html`<span class="chip">${READER_OUTCOMES[c.reader_outcome] || c.reader_outcome}</span>` : ""}
    </div>
    <div class="small muted">Sources: ${(c.sources || []).map((s, i) => html`${i ? " · " : ""}<a href="${s.url}" target="_blank" rel="noopener">${s.publisher || "source"}</a>${s.tier ? html` <span class="chip ${tierCls(s.tier)}" style="padding:1px 7px;font-size:11px">${s.tier}</span>` : ""}`)}</div>
    ${c.link?.type === "stated" ? html`<div class="small"><span class="chip ok">Connection stated by a source</span> ${c.link.note || ""}</div>` : ""}
    ${c.link?.type === "reading" ? html`<div class="small"><span class="chip reading">Your reading</span> labelled in the post: ${c.link.note || ""}</div>` : ""}
    ${c.link?.type === "case" ? html`<div class="small"><span class="chip ok">Sourced case</span> ${c.link.note || ""}</div>` : ""}
    ${c.ask_me ? html`<div class="notice info small"><strong>Ask me:</strong> ${c.ask_me}</div>` : ""}
    ${c.eligible === false ? html`<div class="notice warn small">Not eligible: ${(c.problems || []).join("; ")}</div>` : ""}
    <details class="small"><summary>Why it ranks here</summary><p class="muted" style="margin:6px 0 0">Goal “${g?.question || c.goal}” needs a post ${c.brand_fit ?? "–"}/10.
      Its story-source need is ${c.move_fit ?? "–"}/10.
      Significance ${c.scores?.significance ?? "–"}, your angle ${c.scores?.angle ?? "–"}, freshness ${c.scores?.freshness ?? "–"} (0-10, judged by the engine).</p></details>
    ${showStrategyChoice ? html`${strategyChoices(strategies, `strategy-${c.id}`, selectedStrategy, c.strategy_fit || {}, hasStoryChoice, lessonEvidence)}
      ${c.suggestion_reason ? html`<p class="small muted strategy-reason">Suggested: ${strategies.find((item) => item.id === c.suggested_strategy)?.name || "your usual strategy"}. ${c.suggestion_reason}</p>` : ""}` : ""}
    <div class="row small muted"><span>Goal need ${c.brand_fit ?? "–"}</span><span>Story-source need ${c.move_fit ?? "–"}</span><span>Significance ${c.scores?.significance ?? "–"}</span><span>Angle ${c.scores?.angle ?? "–"}</span><span>Freshness ${c.scores?.freshness ?? "–"}</span></div>
    <button class="btn ${c.rank === 1 ? "primary" : ""} choose" data-id="${c.id}" ${c.eligible === false || hasStoryChoice ? "disabled" : ""} style="align-self:flex-start">${chosen ? "Chosen" : hasStoryChoice ? "Restart to change story" : "Choose this story"}</button>
  </article>`;
}

export default async function view(ctx, root) {
  const [wk, brand, lib, mem, strategyData] = await Promise.all([ctx.data.week(ctx.author, ctx.week), ctx.data.brand(ctx.author), ctx.data.moveLibrary(), ctx.data.memory(ctx.author), ctx.data.strategyLibrary()]);
  const strategies = strategyData.strategies || [];
  const defaultStrategy = brand.voiceRules.default_strategy || strategies[0]?.id;
  const selectedByFit = brand.voiceRules.suggest_other_strategy !== false;
  const arc = wk.arc || arcFromLedger(mem.ledger, brand.strategy, mem.posts, lib.moves, ctx.authorCfg.calibration_start || "");
  const goalsById = Object.fromEntries((brand.goals.goals || []).map((g) => [g.id, g]));
  const cands = wk.candidates?.candidates || [];
  const mixCounts = Object.entries(cands.filter((candidate) => candidate.eligible !== false).reduce((counts, candidate) => {
    if (candidate.suggested_strategy) counts[candidate.suggested_strategy] = (counts[candidate.suggested_strategy] || 0) + 1;
    return counts;
  }, {})).map(([id, count]) => ({ id, count, name: strategies.find((strategy) => strategy.id === id)?.name || id }));
  const mixTotal = mixCounts.reduce((sum, item) => sum + item.count, 0);
  const story = wk.decisions.story;
  const hasStoryChoice = ["pick", "own"].includes(story?.action);
  const locked = atLeast(wk.state.stage, "drafted") && wk.state.stage !== "discovered";
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };

  if (!cands.length) {
    renderInto(root, html`${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Pick this week's story", back })}
      ${empty("No story cards yet", "Story cards are on their way. Start discovery now, or wait for the scheduled run.", html`<button class="btn primary" id="run">Find stories now</button>`)}`);
    $("#run", root)?.addEventListener("click", (e) => withSaving(e.currentTarget, () => ctx.backend.dispatch({ action: "discover", author: ctx.author, week: ctx.week }), "Discovery started"));
    return;
  }

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Pick this week's story", back,
      sub: "Ranked by goal fit, story-source needs, significance, your angle, and freshness.",
      right: story ? html`<span class="pill accent">You chose ${story.action === "pick" ? `card ${cands.find((c) => c.id === story.candidate)?.rank || ""}` : "your story"}${story.strategy ? ` · ${strategies.find((item) => item.id === story.strategy)?.name || story.strategy}` : ""}</span>` : "" })}
    <section class="pick-mix" aria-label="This week's mix">
      <div class="row between"><h2>This week's mix</h2></div>
      ${mixTotal ? html`<div class="pick-mix-track" role="img" aria-label="${mixCounts.map((item) => `${item.name}: ${item.count} ${item.count === 1 ? "card" : "cards"}`).join(", ")}">
        ${mixCounts.map((item) => html`<span class="pick-mix-segment" style="flex-grow:${item.count}"></span>`)}</div>
        <div class="pick-mix-key">${mixCounts.map((item) => html`<span>${item.name} · ${item.count} ${item.count === 1 ? "card" : "cards"}</span>`)}</div>` : html`<p class="small muted">Story cards are on their way.</p>`}
      ${wk.candidates?.notes ? html`<p class="small muted pick-mix-note">${wk.candidates.notes}</p>` : ""}
    </section>
    ${brandStory(arc)}
    ${story?.action === "pick" ? html`<div class="notice ok">You chose card ${cands.find((candidate) => candidate.id === story.candidate)?.rank || ""}${story.strategy ? ` · ${strategies.find((item) => item.id === story.strategy)?.name || story.strategy}` : ""}. ${weekFlow(wk) === 2 ? "Research and an opinion choice come before writing." : "The next step is drafting."} <a href="#/week?author=${ctx.author}&week=${ctx.week}">Track progress</a>.</div>` : ""}
    ${hasStoryChoice ? html`<div class="row"><button class="btn" id="change-story">Change story</button><span class="small muted">The current package will be saved in Runs before story and writing strategy selection reopens.</span></div>` : ""}
    ${locked ? html`<div class="notice info">The draft for this pick is already written. Picking again restarts the draft.</div>` : ""}
    <div class="grid-2">${cands.map((c) => {
      const suggested = selectedByFit ? c.suggested_strategy : defaultStrategy;
      const selected = story?.candidate === c.id ? story.strategy || suggested : suggested || c.suggested_strategy;
      return card(c, story?.candidate === c.id, goalsById, strategies, selected, hasStoryChoice, !(hasStoryChoice && !story.strategy));
    })}</div>
    ${hasStoryChoice ? "" : html`<section class="card stack" aria-labelledby="ask">
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
        <div class="field"><span class="field-title">Use my own story</span><span class="hint">A story you want to write about this week (a link or a sentence).</span>
          <textarea id="own-story" rows="2"></textarea>
          ${strategyChoices(strategies, "own-strategy", defaultStrategy, {}, false, false)}
          <button class="btn" id="own" style="align-self:flex-start">Write about this</button></div>
      </div>
      <button class="btn danger small" id="skip" style="align-self:flex-start">Skip this week</button>
    </section>`}
  `);

  root.querySelector("#change-story")?.addEventListener("click", async (event) => {
    if (!window.confirm(`Save the current package and reopen story selection for ${ctx.week}? Research, opinion and draft results will be cleared from the new package.`)) return;
    await withSaving(event.currentTarget, () => ctx.backend.dispatch({ action: "restart-pick", author: ctx.author, week: ctx.week }), "Story selection restart queued");
    ctx.refresh();
  });

  const decide = async (btn, data, msg) => {
    if (locked && !window.confirm("This choice can replace your finished draft. Continue?")) return;
    const mine = $("#mine", root).value.trim();
    await withSaving(btn, () => ctx.data.decide(ctx.author, ctx.week, "story", { ...data, ...(mine ? { mine } : {}) }, wk.package?.id || null), msg);
    toast(engineNote(ctx.backend));
    ctx.refresh();
  };
  const refreshLessonChoices = () => {
    const hasMine = Boolean($("#mine", root)?.value.trim());
    $$('input[value="share-lesson"]', root).forEach((input) => {
      const storyCard = input.closest(".story");
      const hasEvidence = hasMine || storyCard?.dataset.lessonEvidence === "true";
      input.disabled = hasStoryChoice || !hasEvidence;
      input.closest(".strategy-option")?.classList.toggle("needs-evidence", !hasEvidence);
      input.closest(".strategy-option")?.classList.toggle("disabled", input.disabled);
    });
  };
  root.querySelectorAll(".story").forEach((storyCard) => { storyCard.dataset.lessonEvidence = String(hasLessonEvidence(cands.find((candidate) => candidate.id === storyCard.dataset.id) || {})); });
  refreshLessonChoices();
  $$(".choose", root).forEach((b) => b.addEventListener("click", () => {
    const candidate = cands.find((item) => item.id === b.dataset.id);
    const strategy = $(`input[name="strategy-${b.dataset.id}"]:checked`, root)?.value;
    if (!strategy) { toast("Choose a writing strategy first", "bad"); return; }
    decide(b, { action: "pick", candidate: b.dataset.id, strategy, strategy_suggested: candidate.suggested_strategy || strategy }, "Story and writing strategy saved. Research is next.");
  }));
  $("#wider", root)?.addEventListener("click", (e) => decide(e.currentTarget, { action: "wider", note: $("#wider-note", root).value.trim() }, "Searching wider"));
  $("#own", root)?.addEventListener("click", (e) => {
    const s = $("#own-story", root).value.trim();
    if (s.length < 10) { toast("Write a sentence or paste a link first", "bad"); return; }
    const strategy = $('input[name="own-strategy"]:checked', root)?.value;
    if (!strategy) { toast("Choose a writing strategy first", "bad"); return; }
    decide(e.currentTarget, { action: "own", story: s, strategy, strategy_suggested: strategy }, "Your story and writing strategy are saved");
  });
  $("#skip", root)?.addEventListener("click", (e) => {
    if (e.currentTarget.dataset.confirm !== "1") { e.currentTarget.dataset.confirm = "1"; e.currentTarget.textContent = "Tap again to skip this week"; return; }
    decide(e.currentTarget, { action: "skip" }, "Week skipped");
  });
  root.addEventListener("input", () => ctx.setDirty(true));
  $("#mine", root)?.addEventListener("input", refreshLessonChoices);
  ctx.watch(() => ctx.data.week(ctx.author, ctx.week), wk);
}
