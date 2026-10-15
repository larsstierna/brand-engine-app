// This week: the one thing that needs the author now, the week's progress, and how the brand is moving.

import { html, raw, niceDate, shiftWeek, toast } from "../util.js";
import { pageHead, weekEyebrow, withSaving, engineNote, renderInto, weekFlow, opinionDefault } from "../ui.js";
import { ACTION_NAMES, jobAction, elapsed, failureMessage } from "../operations.js";
import { packageControls, bindPackageControls } from "../package-controls.js";
import { packageStatus, progressSteps } from "../progress.js";
import { icon } from "../icons.js";
import { brandSummary } from "../week-dashboard.js";
import { mountOrb } from "../orb.js";
import { automationCard, firstDiscovery } from "../automation.js";

const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const when = (s) => (s ? `${DAY[s.day] || s.day} ${s.time}` : "");

function weekRibbon(ctx, week, activity, firstWeek = false) {
  const progress = progressSteps(week, activity, { firstWeek });
  const schedule = ctx.authorCfg.schedule || {};
  const items = [
    { id: "strategy", label: "Strategy", page: "strategy", due: schedule.strategy_by },
    { id: "picked", label: "Story", page: "pick", due: schedule.pick_by },
    ...(weekFlow(week) === 2 ? [{ id: "researched", label: "Opinion", page: "opinion", due: schedule.opinion_by }] : []),
    { id: "approved", label: "Review", page: "draft", due: schedule.approve_by },
    { id: "posted", label: "Post", page: "ready" },
  ];
  return html`<section class="week-ribbon" aria-label="Weekly decisions"><ol>${items.map((item) => {
    const step = progress.find((entry) => entry.id === item.id);
    const done = step?.status === "done";
    const active = step && !["pending", "done"].includes(step.status);
    const label = firstWeek && item.id === "strategy" ? "Not required" : done ? "Completed" : active ? ({ now: "Needs you", running: "Running", queued: "Queued", handoff: "Waiting", failed: "Needs attention", scheduled: "Scheduled" })[step.status] : "Not reached";
    return html`<li class="${done ? "done" : active ? "active" : ""}"><span class="ribbon-connector" aria-hidden="true"></span><a href="#/${item.page}?author=${encodeURIComponent(ctx.author)}&week=${ctx.week}" ${active ? raw('aria-current="step"') : ""}><span class="ribbon-node" aria-hidden="true">${done ? raw(icon("check")) : raw(icon("clock"))}</span><span class="ribbon-label">${item.label}</span><span class="ribbon-state">${label}</span>${!week.package?.manual && item.due && !done ? html`<span class="ribbon-due">${when(item.due)}</span>` : ""}</a></li>`;
  })}</ol></section>`;
}

function nextAction(ctx, wk, firstWeek = false) {
  const { state, candidates, decisions } = wk;
  const sched = ctx.authorCfg.schedule || {};
  const q = { author: ctx.author, week: ctx.week };
  const link = (page) => `#/${page}?${new URLSearchParams(q)}`;
  const gate = sched.strategy_gate !== false;
  const chosen = decisions.strategy;
  switch (state.stage) {
    case "new":
      if (ctx.authorCfg.enabled === false) return { tone: "info", title: "Automatic schedule is disabled", text: "Review Schedule and email before expecting scheduled work for this author.", href: `#/brand/schedule?author=${ctx.author}`, cta: "Review schedule", secondary: true };
      if (chosen) return { tone: "info", title: "Your strategy is chosen", text: "Waiting for discovery to start. Live workflow status appears below.", href: link("strategy"), cta: "See your choice", secondary: true };
      if (firstWeek) return { tone: "info", title: "Your first stories are next", text: "Discovery can start at the next schedule check without a strategy answer. You can also start it now.", button: { id: "run-discover", label: "Find stories now" } };
      if (gate) return { tone: "info", title: "First: which strategy this week?",
        text: `The question arrives ${when(sched.strategy_prompt) || "on Saturday"}, with a recommendation from your brand balance. You can answer now.`,
        href: link("strategy"), cta: "Choose the strategy", secondary: true };
      return { tone: "info", title: "Story cards are on their way",
        text: `Discovery runs ${when(sched.discover) || "on schedule"} and finds 3-5 stories for your goals. You can also start it now.`,
        button: { id: "run-discover", label: "Find stories now" } };
    case "strategy":
      if (chosen) return { tone: "info", title: "Your strategy is chosen", text: "Waiting for discovery to start. Live workflow status appears below.", href: link("strategy"), cta: "See your choice", secondary: true };
      return { tone: "warn", pill: `Needs you · due ${when(sched.strategy_by)}`, title: "Which strategy this week?",
        text: `Pick the post strategy for ${ctx.week}, or use its recommendation.`,
        href: link("strategy"), cta: "Choose the strategy" };
    case "discovered": {
      const n = (candidates?.candidates || []).filter((c) => c.eligible !== false).length;
      return { tone: "warn", pill: `Needs you · due ${when(sched.pick_by)}`, title: "Pick this week's story",
        text: `${n} eligible story cards are ready for you to compare.`,
        href: link("pick"), cta: "Choose a story" };
    }
    case "picked":
      if (weekFlow(wk) === 2) return { tone: "info", title: "Story saved. Research is next.", text: "The research brief and opinion options are the next step. Live status confirms when research starts.", href: link("opinion"), cta: "Open research and opinions", secondary: true };
      return { tone: "info", title: "Your story is chosen", text: "The draft is the next step. Check live workflow status below.", href: link("pick"), cta: "See your pick", secondary: true };
    case "researched": {
      const by = sched.opinion_by || { day: "mon", time: "18:00" };
      return { tone: "warn", pill: `Needs you · due ${when(by)}`, title: "Choose your opinion", text: "Your research and opinion options are ready. Choose the view and tone you can stand behind.", href: link("opinion"), cta: "Choose the opinion" };
    }
    case "revising":
      return { tone: "info", title: "Revising your draft", text: `Working on your change request (round ${state.round + 1}).`, href: link("draft"), cta: "Open the draft", secondary: true };
    case "drafted":
      return { tone: "warn", pill: `Needs you · due ${when(sched.approve_by)}`, title: "Review your draft",
        text: decisions.draft?.action === "change" ? "Your change request is queued." : "Review the claims, then approve or ask for a change.",
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
  const firstWeek = firstDiscovery(wk, mem, ctx.authorCfg);
  const act = nextAction(ctx, wk, firstWeek);
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
  const start = String(ctx.authorCfg.calibration_start || "");
  const prev = shiftWeek(ctx.week, -1), next = shiftWeek(ctx.week, 1);
  const pillClass = act.tone === "warn" ? "warn" : act.tone === "ok" ? "ok" : act.tone === "bad" ? "bad" : "accent";

  renderInto(root, html`
    ${pageHead({
      title: "This week", sub: weekEyebrow(ctx.week),
      right: html`<div class="row"><a class="btn small" href="#/week?author=${ctx.author}&week=${prev}" aria-label="Previous week" title="Previous week">${raw(icon("previous"))} ${prev}</a>
        <a class="btn small" href="#/week?author=${ctx.author}&week=${next}" aria-label="Next week" title="Next week">${next} ${raw(icon("next"))}</a></div>`,
    })}
    <div class="home-overview">
    <section class="week-action ${act.tone}" aria-labelledby="next-title">
      <div class="decision-copy">
        <h2 id="next-title">${act.title}</h2>
        <div class="row small muted"><span>Current post</span>${act.pill ? html`<span class="pill ${pillClass}">${act.pill.split(" · due ")[0]}</span>` : ""}</div>
        <p class="lead">${act.text}</p>
      </div>
      <div class="decision-visual">
      <figure class="status-orb" role="img" aria-label="${`Package status: ${status.phase === "decision" && !running ? act.pill || act.title : status.title}`}" data-phase="${status.phase}">
        <canvas width="360" height="360" aria-hidden="true"></canvas>
        <figcaption>${raw(icon(status.phase === "done" ? "check" : "clock"))}${running ? "Engine working" : status.phase === "decision" ? "Your turn" : status.phase === "done" ? "Week complete" : status.phase === "failed" ? "Needs attention" : "Choice saved"}</figcaption>
      </figure>
      </div>
    </section>
    ${brandSummary(mem, start, ctx.week, ctx.author)}
    </div>
    <div class="home-primary-actions">${act.href ? html`<a class="btn primary" href="${act.href}">${act.cta}${raw(icon("next"))}</a>` : ""}${act.button ? html`<button class="btn primary" id="${act.button.id}">${act.button.label}</button>` : ""}${packageControls(ctx, wk, { busy: !!running, job, compact: true })}</div>
    ${automationCard(ctx, wk, status, { health, firstWeek })}
    ${weekRibbon(ctx, wk, activity, firstWeek)}
    <nav class="home-menu" aria-label="Workspace"><a href="#/posts?author=${ctx.author}">${raw(icon("posts"))}<span><strong>Posts and results</strong><small>Published posts, saves and ratings</small></span>${raw(icon("next"))}</a><a href="#/brand/progress?author=${ctx.author}&week=${ctx.week}">${raw(icon("brand"))}<span><strong>Brand and goals</strong><small>Coverage, targets and your direction</small></span>${raw(icon("next"))}</a><a href="#/inputs/mine?author=${ctx.author}">${raw(icon("inputs"))}<span><strong>Add a first-hand note</strong><small>Your experience and ideas</small></span>${raw(icon("next"))}</a><a href="#/runs?author=${ctx.author}&week=${ctx.week}">${raw(icon("runs"))}<span><strong>Post history</strong><small>Saved versions and step details</small></span>${raw(icon("next"))}</a></nav>
    <details class="home-diagnostics"><summary>Workflow and delivery status</summary><div class="stack-s">${activity.unavailable ? html`<p class="small muted">${activity.unavailable}</p>` : ""}${job ? html`<div class="row between small"><span>${running ? "Live workflow" : failed ? "Latest workflow failed" : `Latest workflow: ${job.conclusion || job.status}`} · ${niceDate(job.at)}</span><a href="${job.url}" target="_blank" rel="noopener">Run details</a>${failed && action ? html`<button class="btn small" id="retry-step">Retry ${action}</button>` : ""}</div>` : html`<p class="small muted">No matching workflow found in recent runs. A saved choice is not proof that work has started.</p>`}<p class="small muted">${health.email?.status === "sent" ? `Last email accepted by the mail server: ${niceDate(health.email.at)}. Check your inbox or spam folder.` : health.email?.status === "not_configured" ? "Email is not set up. Decisions are available here in the app." : "Email delivery has not been verified for this author."}</p></div></details>
  `);

  bindPackageControls(ctx, root, wk);
  mountOrb(root);
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
  const needs = status.phase === "decision" && !running && !firstWeek;
  const nav = document.querySelector('[data-page="week"]');
  nav?.classList.toggle("needs-attention", needs);
  if (nav) nav.title = needs ? (act.pill || "Your decision is needed") : "This week";
  ctx.watch(async () => ({ week: await ctx.data.week(ctx.author, ctx.week), activity: await ctx.data.activity(ctx.author, ctx.week), health: await ctx.data.health(ctx.author), clock: running ? Math.floor(Date.now() / 60000) : 0 }), { week: wk, activity, health, clock: running ? Math.floor(Date.now() / 60000) : 0 });
}
