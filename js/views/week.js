// This week: the one thing that needs the author now, the week's progress, and how the brand is moving.

import { html, niceDate, shiftWeek, toast } from "../util.js";
import { pageHead, stepper, goalBars, moveBars, weekEyebrow, withSaving, engineNote, renderInto } from "../ui.js";

const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const when = (s) => (s ? `${DAY[s.day] || s.day} ${s.time}` : "");

function nextAction(ctx, wk) {
  const { state, candidates, decisions } = wk;
  const sched = ctx.authorCfg.schedule || {};
  const q = { author: ctx.author, week: ctx.week };
  const link = (page) => `#/${page}?${new URLSearchParams(q)}`;
  const gate = sched.strategy_gate !== false;
  const chosen = decisions.strategy;
  switch (state.stage) {
    case "new":
      if (chosen) return { tone: "info", title: "Finding stories for your strategy", text: "Your choice is in. Story cards arrive in about half an hour; you will get an email.", href: link("strategy"), cta: "See your choice", secondary: true };
      if (gate) return { tone: "info", title: "First: which strategy this week?",
        text: `The question arrives ${when(sched.strategy_prompt) || "on Saturday"}, with a recommendation from your brand balance. You can answer now.`,
        href: link("strategy"), cta: "Choose the strategy", secondary: true };
      return { tone: "info", title: "Story cards are on their way",
        text: `Discovery runs ${when(sched.discover) || "on schedule"} and finds 3-5 stories for your goals. You can also start it now.`,
        button: { id: "run-discover", label: "Find stories now" } };
    case "strategy":
      if (chosen) return { tone: "info", title: "Finding stories for your strategy", text: "Your choice is in. Story cards arrive in about half an hour; you will get an email.", href: link("strategy"), cta: "See your choice", secondary: true };
      return { tone: "warn", pill: `Needs you · due ${when(sched.strategy_by)}`, title: "Which strategy this week?",
        text: `Pick the post strategy for ${ctx.week}, or let the engine use its recommendation. If you don't answer, the recommendation is used.`,
        href: link("strategy"), cta: "Choose the strategy" };
    case "discovered": {
      const n = (candidates?.candidates || []).filter((c) => c.eligible !== false).length;
      return { tone: "warn", pill: `Needs you · due ${when(sched.pick_by)}`, title: "Pick this week's story",
        text: `${n} story cards are ready. If you don't answer, ${ctx.authorCfg.defaults?.no_pick === "skip_week" ? "the week is skipped" : "the top card is used"}.`,
        href: link("pick"), cta: "Choose a story" };
    }
    case "picked":
      return { tone: "info", title: "Writing your draft", text: "Researching the primary sources and drafting in your voice. You will get an email when it is ready.", href: link("pick"), cta: "See your pick", secondary: true };
    case "revising":
      return { tone: "info", title: "Revising your draft", text: `Working on your change request (round ${state.round + 1}).`, href: link("draft"), cta: "Open the draft", secondary: true };
    case "drafted":
      return { tone: "warn", pill: `Needs you · due ${when(sched.approve_by)}`, title: "Review your draft",
        text: decisions.draft?.action === "change" ? "Your change request is queued." : "Check every claim and its source, then approve or ask for a change.",
        href: link("draft"), cta: "Review the draft" };
    case "approved":
      return { tone: "info", title: "Making the final package", text: "Image, first comment and reply kit.", href: link("draft"), cta: "Open the draft", secondary: true };
    case "ready":
      return { tone: "warn", pill: "Needs you", title: "Ready to post",
        text: `Post it ${ctx.authorCfg.schedule?.posting_time || "this week"}, then mark it as posted.`, href: link("ready"), cta: "Open the package" };
    case "posted":
      return { tone: "ok", title: "Posted", text: "The engine will ask for your numbers on day 2 and day 7.", href: `#/posts?author=${ctx.author}`, cta: "Add numbers now", secondary: true };
    case "measured":
      return { tone: "ok", title: "Done for this week", text: "Numbers saved. They now shape next week's scoring.", href: `#/posts?author=${ctx.author}`, cta: "See posts", secondary: true };
    case "skipped":
      return { tone: "info", title: "Week skipped", text: "Nothing will be posted this week.", button: { id: "run-discover", label: "Find stories after all" } };
    case "failed":
      return { tone: "bad", title: "A step failed", text: (state.history?.slice(-1)[0]?.note) || "See the run log in Settings.", button: { id: "run-discover", label: "Try discovery again" } };
    default:
      return { tone: "info", title: state.stage, text: "" };
  }
}

export default async function view(ctx, root) {
  const [wk, mem, strategy, onboarding] = await Promise.all([ctx.data.week(ctx.author, ctx.week), ctx.data.memory(ctx.author),
    ctx.data.text(`authors/${ctx.author}/brand/strategy.yaml`), ctx.data.onboarding(ctx.author)]);
  if (!strategy) {
    const msg = {
      none: ["Your brand is not set up yet", "Start with your CV and a few questions.", "Start onboarding"],
      submitted: ["Claude is reading your CV", "You get an email with what it found and a few questions (about 5 minutes).", "See the status"],
      analysed: ["Your analysis is ready", "Answer a few questions and confirm your destination, goals, topics and post strategies.", "Answer and confirm"],
      answered: ["Claude is planning how to reason for you", "One chain of steps per strategy, with an example (about 5 minutes).", "See the status"],
      planned: ["Check how your posts will be reasoned", "Edit the steps, comment, then confirm. Nothing is built before that.", "Review the plan"],
      "plan-revising": ["Claude is revising your plan", "Your edits are kept and your comments applied (about 5 minutes).", "See the status"],
      "plan-confirmed": ["Your brand is being built", "Your confirmed choices are being written; Claude drafts your voice guide and sources (about 10 minutes).", "See the status"],
      built: ["Your brand is set up", "Your first story cards arrive within a few hours.", "Open Brand and strategy"],
    }[onboarding.stage];
    renderInto(root, html`${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Welcome" })}
      <section class="card focus stack"><h2>${msg[0]}</h2><p class="lead">${msg[1]}</p>
        <a class="btn primary" style="align-self:flex-start" href="${onboarding.stage === "built" ? `#/brand/overview?author=${ctx.author}` : `#/onboarding?author=${ctx.author}`}">${msg[2]}</a></section>`);
    return;
  }
  const act = nextAction(ctx, wk);
  const start = String(ctx.authorCfg.calibration_start || "");
  const last = [...mem.posts].reverse().find((p) => p.week < ctx.week && p.status !== "skipped" && !p.history && !(/^\d{4}-W\d{2}$/.test(start) && p.week < start));
  const prev = shiftWeek(ctx.week, -1), next = shiftWeek(ctx.week, 1);
  const lm = last?.metrics?.d7 || last?.metrics?.d2 || {};
  const pillClass = act.tone === "warn" ? "warn" : act.tone === "ok" ? "ok" : act.tone === "bad" ? "bad" : "accent";

  renderInto(root, html`
    ${pageHead({
      eyebrow: weekEyebrow(ctx.week), title: "This week",
      right: html`<div class="row"><a class="btn small" href="#/week?author=${ctx.author}&week=${prev}" aria-label="Previous week">← ${prev}</a>
        <a class="btn small" href="#/week?author=${ctx.author}&week=${next}" aria-label="Next week">${next} →</a></div>`,
    })}
    <section class="card ${act.tone === "warn" ? "focus" : ""} row between" aria-labelledby="next-title" style="gap:20px">
      <div class="stack-s" style="flex:1 1 380px;min-width:0">
        ${act.pill ? html`<span class="pill ${pillClass}" style="align-self:flex-start">${act.pill}</span>` : ""}
        <h2 id="next-title" style="font-size:24px">${act.title}</h2>
        <p class="lead">${act.text}</p>
      </div>
      ${act.href ? html`<a class="btn ${act.secondary ? "" : "primary"}" href="${act.href}">${act.cta}</a>` : ""}
      ${act.button ? html`<button class="btn primary" id="${act.button.id}">${act.button.label}</button>` : ""}
    </section>
    <section class="card" aria-label="Progress">
      <h2 style="margin-bottom:16px">Progress</h2>
      ${stepper(wk.state, { strategy: `By ${when(ctx.authorCfg.schedule?.strategy_by)}`, picked: `By ${when(ctx.authorCfg.schedule?.pick_by)}`, approved: `By ${when(ctx.authorCfg.schedule?.approve_by)}` })}
      ${wk.state.flags?.length ? html`<p class="small muted" style="margin-top:12px">Notes: ${wk.state.flags.join(" · ")}</p>` : ""}
    </section>
    <div class="grid-2">
      <section class="card stack" aria-labelledby="goals-title">
        <h2 id="goals-title">Brand goals · last ${mem.ledger?.window_weeks || 12} weeks</h2>
        ${goalBars(mem.ledger)}
        <h3 style="margin-top:6px">Post strategies</h3>
        ${moveBars(mem.ledger, { limit: 4 })}
        <a href="#/posts?author=${ctx.author}" class="small">See all posts and goals</a>
      </section>
      <section class="card stack" aria-labelledby="last-title">
        <h2 id="last-title">Last post</h2>
        ${last ? html`
          <div class="eyebrow">${last.week} · ${last.status}${last.posted_at ? ` · posted ${last.posted_at}` : ""}</div>
          <p style="font-size:16px">${last.first_line || last.headline}</p>
          <div class="grid-3">
            <div class="stat"><div class="label">Impressions</div><div class="value">${lm.impressions ?? "–"}</div></div>
            <div class="stat"><div class="label">Saves</div><div class="value">${lm.saves ?? "–"}</div></div>
            <div class="stat"><div class="label">Your rating</div><div class="value">${last.rating ? `${last.rating}/5` : "–"}</div></div>
          </div>
          <div class="row between"><span class="small muted">Goal: ${last.goal || "–"}</span>
            <a class="btn small" href="#/posts?author=${ctx.author}&rate=${last.week}">Add numbers or a rating</a></div>`
        : html`<p class="muted">No posts yet. Your brand counts from your first new post.</p>`}
      </section>
    </div>
    <p class="small muted">Busy? Every step also arrives by email. Reply with a number to choose the strategy or a story, or “approve” to approve a draft. ${niceDate(wk.state.updated) ? `Last update: ${niceDate(wk.state.updated)}.` : ""}</p>
  `);

  root.querySelector("#run-discover")?.addEventListener("click", async (e) => {
    await withSaving(e.currentTarget, () => ctx.backend.dispatch({ action: "discover", author: ctx.author, week: ctx.week, force: wk.state.stage === "skipped" }),
      "Discovery started");
    toast(engineNote(ctx.backend));
  });
}
