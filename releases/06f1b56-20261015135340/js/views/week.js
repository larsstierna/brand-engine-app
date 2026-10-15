// This week: the one thing that needs the author now, the week's progress, and how the brand is moving.

import { html, niceDate, shiftWeek, toast } from "../util.js";
import { pageHead, weekEyebrow, withSaving, engineNote, renderInto, weekFlow, opinionDefault } from "../ui.js";
import { ACTION_NAMES, jobAction, elapsed, failureMessage } from "../operations.js";
import { packageControls, bindPackageControls } from "../package-controls.js";
import { packageStatus, progressRail, bindProgressDisclosure } from "../progress.js";

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
      if (chosen) return { tone: "info", title: "Your strategy is chosen", text: "Waiting for discovery to start. Live workflow status appears below.", href: link("strategy"), cta: "See your choice", secondary: true };
      if (gate) return { tone: "info", title: "First: which strategy this week?",
        text: `The question arrives ${when(sched.strategy_prompt) || "on Saturday"}, with a recommendation from your brand balance. You can answer now.`,
        href: link("strategy"), cta: "Choose the strategy", secondary: true };
      return { tone: "info", title: "Story cards are on their way",
        text: `Discovery runs ${when(sched.discover) || "on schedule"} and finds 3-5 stories for your goals. You can also start it now.`,
        button: { id: "run-discover", label: "Find stories now" } };
    case "strategy":
      if (chosen) return { tone: "info", title: "Your strategy is chosen", text: "Waiting for discovery to start. Live workflow status appears below.", href: link("strategy"), cta: "See your choice", secondary: true };
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
      if (weekFlow(wk) === 2) return { tone: "info", title: "Story saved. Research is next.", text: "The research brief and opinion options are the next step. Live status confirms when research starts.", href: link("opinion"), cta: "Open research and opinions", secondary: true };
      return { tone: "info", title: "Your story is chosen", text: "The draft is the next step. Check live workflow status below.", href: link("pick"), cta: "See your pick", secondary: true };
    case "researched": {
      const choice = opinionDefault(wk, ctx.voiceRules);
      const by = sched.opinion_by || { day: "mon", time: "18:00" };
      return { tone: "warn", pill: `Needs you · due ${when(by)}`, title: "Choose your opinion", text: `Your research is ready. No answer by ${when(by)}: option ${choice.option?.id.replace(/^o/, "") || "?"}, ${choice.tone}.`, href: link("opinion"), cta: "Choose the opinion" };
    }
    case "revising":
      return { tone: "info", title: "Revising your draft", text: `Working on your change request (round ${state.round + 1}).`, href: link("draft"), cta: "Open the draft", secondary: true };
    case "drafted":
      return { tone: "warn", pill: `Needs you · due ${when(sched.approve_by)}`, title: "Review your draft",
        text: decisions.draft?.action === "change" ? "Your change request is queued." : `Review the claims, then approve or ask for a change. Without your answer, ${ctx.authorCfg.defaults?.no_approval === "skip_week" ? "the week is skipped" : "the package is sent marked not reviewed; you still post it yourself"}.`,
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
      return { tone: "bad", title: "The engine needs attention", text: failureMessage(state.history?.slice(-1)[0]?.note), href: `#/settings?author=${ctx.author}`, cta: "Check engine health" };
    default:
      return { tone: "info", title: state.stage, text: "" };
  }
}

export default async function view(ctx, root) {
  const [wk, mem, strategy, onboarding, activity, health] = await Promise.all([ctx.data.week(ctx.author, ctx.week), ctx.data.memory(ctx.author),
    ctx.data.text(`authors/${ctx.author}/brand/strategy.yaml`), ctx.data.onboarding(ctx.author), ctx.data.activity(ctx.author, ctx.week), ctx.data.health(ctx.author)]);
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
  ctx.voiceRules = await ctx.data.yaml(`authors/${ctx.author}/brand/voice-rules.yaml`, {});
  const act = nextAction(ctx, wk);
  const status = packageStatus(wk, activity);
  if (status.phase === "handoff") {
    Object.assign(act, { tone: "info", pill: "Choice saved", title: status.title, text: status.detail, secondary: true });
    delete act.button;
  }
  if (status.phase === "decision" && wk.package?.manual && ["strategy", "discovered", "researched", "drafted"].includes(wk.state.stage)) {
    act.text = "This package is under manual control. Your choice here opens the next step; deadline defaults are paused.";
    act.pill = act.pill ? "Needs you" : "Manual control";
  }
  const job = activity.job;
  const running = job && ["queued", "in_progress", "waiting", "pending"].includes(job.status);
  const failed = job?.conclusion === "failure";
  const action = jobAction(job);
  const currentStep = job?.steps?.find((step) => step.status === "in_progress");
  if (failed) {
    act.tone = "bad";
    act.pill = "Needs attention";
    act.title = `${ACTION_NAMES[action] || "This step"} did not finish`;
    const provider = health.claude;
    act.text = provider?.status === "failed" && provider.week === ctx.week
      ? provider.provider === "foundry" && provider.http_status === 404
        ? "The Foundry endpoint or deployment was not found. Check the endpoint URL and exact deployment name in GitHub Actions variables."
        : failureMessage(`${provider.error || ""} ${provider.http_status || ""}`)
      : failureMessage(wk.state.history?.slice(-1)[0]?.note);
    delete act.button;
  }
  if (running) {
    act.tone = "info";
    act.pill = job.status === "in_progress" ? "Engine working" : "Waiting for GitHub";
    act.title = ACTION_NAMES[action] || "Working on your week";
    act.text = `${job.status === "in_progress" ? elapsed(job.at) : "Queued on GitHub"}${currentStep ? ` · ${currentStep.name}` : ""}. This page checks for updates automatically.`;
    delete act.button;
  }
  const counted = mem.posts.filter((post) => !post.history && post.week >= String(ctx.authorCfg.calibration_start || "") && ["ready", "posted", "measured"].includes(post.status));
  const behind = [...(mem.ledger?.move_balance || [])].sort((first, second) => second.need - first.need)[0];
  const start = String(ctx.authorCfg.calibration_start || "");
  const last = [...mem.posts].reverse().find((p) => p.week < ctx.week && p.status !== "skipped" && !p.history && !(/^\d{4}-W\d{2}$/.test(start) && p.week < start));
  const prev = shiftWeek(ctx.week, -1), next = shiftWeek(ctx.week, 1);
  const lm = last?.metrics?.d7 || last?.metrics?.d2 || {};
  const pillClass = act.tone === "warn" ? "warn" : act.tone === "ok" ? "ok" : act.tone === "bad" ? "bad" : "accent";

  renderInto(root, html`
    ${pageHead({
      title: "This week", sub: weekEyebrow(ctx.week),
      right: html`<div class="row"><a class="btn small" href="#/week?author=${ctx.author}&week=${prev}" aria-label="Previous week">← ${prev}</a>
        <a class="btn small" href="#/week?author=${ctx.author}&week=${next}" aria-label="Next week">${next} →</a></div>`,
    })}
    ${activity.unavailable ? html`<div class="notice warn small">${activity.unavailable}</div>` : ""}
    <div class="week-workspace">
    <div class="week-main">
    <section class="week-action ${act.tone}" aria-labelledby="next-title">
      <div class="stack">
        ${act.pill ? html`<span class="pill ${pillClass}" style="align-self:flex-start">${act.pill}</span>` : ""}
        <h2 id="next-title">${act.title}</h2>
        <p class="lead">${act.text}</p>
      </div>
      ${act.href ? html`<a class="btn ${act.secondary ? "" : "primary"}" href="${act.href}">${act.cta}</a>` : ""}
      ${act.button ? html`<button class="btn primary" id="${act.button.id}">${act.button.label}</button>` : ""}
    </section>
    ${packageControls(ctx, wk, { busy: !!running, job })}
    ${job ? html`<div class="row between small operational-strip"><span>${running ? "Live workflow" : failed ? "Latest workflow failed" : `Latest workflow: ${job.conclusion || job.status}`} · ${niceDate(job.at)}${failed ? ` · ${job.steps?.find((step) => step.conclusion === "failure")?.name || "Step failed"}` : ""}</span><a href="${job.url}" target="_blank" rel="noopener">Run details</a>${failed && action ? html`<button class="btn small" id="retry-step">Retry ${action}</button>` : ""}</div>` : html`<p class="small muted">No matching workflow found in recent runs. A saved choice is not proof that work has started.</p>`}
    <div class="week-record">
      <section class="stack" aria-labelledby="goals-title">
        <h2 id="goals-title">Your brand</h2>
        <p>${counted.length} post${counted.length === 1 ? "" : "s"} since your fresh start.${behind ? ` ${behind.name} is furthest behind its target mix.` : " Your balance will appear after the next ledger update."}</p>
        <a href="#/brand?author=${ctx.author}" class="small">See brand progress and goals</a>
        <a href="#/inputs/mine?author=${ctx.author}" class="btn small">Add a first-hand note</a>
      </section>
      <section class="stack" aria-labelledby="last-title">
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
    </div>
    ${progressRail(ctx, wk, { activity })}
    </div>
    <p class="small muted">${health.email?.status === "sent" ? `Last email accepted by the mail server: ${niceDate(health.email.at)}. Check your inbox or spam folder.` : health.email?.status === "not_configured" ? "Email is not set up. Decisions are available here in the app." : "Email delivery has not been verified for this author."} ${niceDate(wk.state.updated) ? `Week updated: ${niceDate(wk.state.updated)}.` : ""}</p>
  `);

  bindPackageControls(ctx, root, wk);
    bindProgressDisclosure(root);
  root.querySelector("#run-discover")?.addEventListener("click", async (e) => {
    await withSaving(e.currentTarget, () => ctx.backend.dispatch({ action: "discover", author: ctx.author, week: ctx.week, force: wk.state.stage === "skipped" }),
      "Discovery started");
    toast(engineNote(ctx.backend));
  });
  root.querySelector("#retry-step")?.addEventListener("click", async (event) => {
    if (!window.confirm(`Retry ${action} for ${ctx.week} in a new package? The current package will be saved in Runs first.`)) return;
    const retry = action.startsWith("restart-") ? action : `restart-${action}`;
    await withSaving(event.currentTarget, () => ctx.backend.dispatch({ action: retry, author: ctx.author, week: ctx.week }), "Retry queued on GitHub");
    ctx.refresh();
  });
  const needs = status.phase === "decision" && !running;
  const nav = document.querySelector('[data-page="week"]');
  nav?.classList.toggle("needs-attention", needs);
  if (nav) nav.title = needs ? (act.pill || "Your decision is needed") : "This week";
  ctx.watch(async () => ({ week: await ctx.data.week(ctx.author, ctx.week), activity: await ctx.data.activity(ctx.author, ctx.week), health: await ctx.data.health(ctx.author), clock: running ? Math.floor(Date.now() / 60000) : 0 }), { week: wk, activity, health, clock: running ? Math.floor(Date.now() / 60000) : 0 });
}
