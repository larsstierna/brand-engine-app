// This week: the one thing that needs the author now, the week's progress, and how the brand is moving.

import { html, raw, niceDate, shiftWeek } from "../util.js";
import { pageHead, weekEyebrow, withSaving, renderInto, weekFlow } from "../ui.js";
import { ACTION_NAMES, jobAction, elapsed, failureMessage } from "../operations.js";
import { packageControls, packageRecoveryAvailable, bindPackageControls } from "../package-controls.js";
import { packageLockBand, packageStatus, progressSteps } from "../progress.js";
import { icon } from "../icons.js";
import { mountOrb } from "../orb.js";
import { crossfadeStep } from "../motion.js";
import { firstDiscovery } from "../automation.js";

const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const when = (s) => (s ? `${DAY[s.day] || s.day} ${s.time}` : "");

function journeyState(step) {
  return ({ done: "Completed", now: "Needs you", scheduled: "Next for you", pending: "Not reached",
    running: "Running", queued: "Queued", handoff: "Waiting", failed: "Needs attention" })[step?.status] || "Not reached";
}

function journeyDetail(week, item, step) {
  if (step?.choice) return step.choice.replace(/^Saved result, awaiting this step: /, "");
  if (item.id === "picked") {
    const cards = (week.candidates?.candidates || []).filter((card) => card.eligible !== false);
    const strategies = new Set(cards.map((card) => card.move).filter(Boolean));
    return cards.length ? `${cards.length} eligible story cards · ${strategies.size} ${strategies.size === 1 ? "strategy" : "strategies"}` : "Story cards are on their way.";
  }
  if (item.id === "researched") return "Your view and tone on the research.";
  if (item.id === "approved") return week.artifacts?.draft ? "Approve the draft or ask for a change." : "Your draft follows the story and research.";
  if (item.id === "posted") return "Post it yourself, then record the date.";
  return "Add results on day 2 and day 7.";
}

function journeyBand(ctx, week, activity, firstWeek = false) {
  const discover = ctx.authorCfg.schedule?.discover;
  const discoverAt = discover ? `${DAY[discover.day] || discover.day} ${discover.time}` : "";
  const progress = progressSteps(week, activity, { firstWeek, discoverAt });
  const flowTwo = weekFlow(week) === 2;
  const items = [
    { id: "picked", label: "Story", page: "pick" },
    ...(flowTwo ? [{ id: "researched", label: "Opinion", page: "opinion" }] : []),
    { id: "approved", label: "Review", page: "draft" },
    { id: "posted", label: "Post", page: "ready" },
    { id: "measured", label: "Results", page: "posts" },
  ];
  const byId = Object.fromEntries(progress.map((step) => [step.id, step]));
  const work = flowTwo
    ? [{ id: "research", label: "Research", duration: "about 10 min" }, { id: "drafted", label: "Draft", duration: "about 25 min" }, { id: "ready", label: "Ready package" }, { id: "measured", label: "Day 2 and 7" }]
    : [{ id: "drafted", label: "Draft", duration: "about 25 min" }, { id: "ready", label: "Ready package" }, { id: "measured", label: "Day 2 and 7" }];
  const status = packageStatus(week, activity);
  const currentStep = activity.job?.steps?.find((step) => step.status === "in_progress");
  const rows = [];
  items.forEach((item, index) => {
    const step = byId[item.id];
    const isCurrent = ["now", "running", "queued", "handoff"].includes(step?.status);
    const href = item.page === "posts" ? `#/posts?author=${encodeURIComponent(ctx.author)}&rate=${ctx.week}`
      : `#/${item.page}?author=${encodeURIComponent(ctx.author)}&week=${ctx.week}`;
    const candidate = week.candidates?.candidates?.find((card) => card.id === week.decisions.story?.candidate);
    const strategyName = candidate && (week.arc?.moves || []).find((move) => move.id === candidate.move)?.name;
    rows.push(html`<li class="journey-node ${step?.status || "pending"}" data-state="${step?.status || "pending"}">
      <div class="journey-track"><span class="journey-marker" aria-hidden="true"><span class="journey-halo"></span>${step?.status === "done" ? raw(icon("check")) : raw(icon("clock"))}</span></div>
      <a class="journey-title" href="${href}" ${isCurrent ? raw('aria-current="step"') : ""}>${item.label}</a>
      <span class="journey-state">${journeyState(step)}</span>
      <div class="journey-detail"><p>${journeyDetail(week, item, step)}</p>
        ${item.id === "picked" && strategyName ? html`<span class="journey-strategy">Strategy · ${strategyName}</span>` : ""}
        ${step?.actor || step?.at ? html`<span class="journey-record">${[step.actor, step.at ? niceDate(step.at) : ""].filter(Boolean).join(" · ")}</span>` : ""}
      </div>
    </li>`);
    const segment = work[index];
    if (!segment) return;
    const workStep = byId[segment.id];
    const workText = workStep?.status === "done" ? `${segment.label} · complete`
      : workStep?.status === "running" ? `${segment.label} · ${status.startedAt ? elapsed(status.startedAt) : "in progress"}`
        : workStep?.status === "queued" ? `${segment.label} · queued`
          : workStep?.status === "handoff" ? `${segment.label} · waiting`
            : `${segment.label}${segment.duration ? ` · ${segment.duration}` : ""}`;
    rows.push(html`<li class="journey-work ${workStep?.status || "pending"}" aria-label="${workText}">
      <span class="journey-work-line"><i></i></span>
      <span class="journey-work-label">${workText}${workStep?.status === "running" && currentStep ? ` · ${currentStep.name}` : ""}</span>
    </li>`);
  });
  return html`<section class="week-journey" aria-labelledby="journey-title">
    <div class="journey-heading"><h2 id="journey-title">This week's post</h2><p>${items.length} decisions. The engine's work runs on the lines between them.</p></div>
    <ol class="journey-list">${rows}</ol>
  </section>`;
}

function nextAction(ctx, wk, firstWeek = false) {
  const { state, candidates, decisions } = wk;
  const sched = ctx.authorCfg.schedule || {};
  const q = { author: ctx.author, week: ctx.week };
  const link = (page) => `#/${page}?${new URLSearchParams(q)}`;
  switch (state.stage) {
    case "new":
      if (ctx.authorCfg.enabled === false) return { tone: "info", title: "Automatic schedule is disabled", text: "Review Schedule and email before expecting scheduled work for this author.", href: `#/brand/schedule?author=${ctx.author}`, cta: "Review schedule", secondary: true };
      if (firstWeek) return { tone: "info", title: "Your first story cards are next", text: "They can arrive at the next schedule check." };
      return { tone: "info", title: "Story cards are on their way", text: `They arrive after the ${when(sched.discover) || "next"} schedule check.` };
    case "strategy":
      return { tone: "info", title: "Story cards are on their way", text: "Your brand and voice shape the mix automatically." };
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
      return { tone: "info", title: "Week skipped", text: "Nothing will be posted from this package. Start again from Week options." };
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
  const busy = ["queued", "running", "handoff"].includes(status.phase);
  const recoveryAvailable = packageRecoveryAvailable(wk, { busy, phase: status.phase, job: activity.job });
  if (status.phase === "handoff") {
    Object.assign(act, { tone: "info", pill: "Choice saved", title: status.title, text: status.detail, secondary: true });
    delete act.button;
    delete act.href;
    delete act.cta;
  }
  if (status.phase === "decision" && wk.package?.manual && ["strategy", "discovered", "researched", "drafted"].includes(wk.state.stage)) {
    act.text = "This package is under manual control. Your choice here opens the next step; deadline defaults are paused.";
    act.pill = act.pill ? "Needs you" : "Manual control";
  }
  const job = activity.job;
  const running = ["queued", "running"].includes(status.phase);
  const failed = job?.conclusion === "failure";
  const action = jobAction(job) || activity.lock?.action;
  const currentStep = job?.steps?.find((step) => step.status === "in_progress");
  const currentStepName = running ? currentStep?.name || "" : "";
  const changedEngineStep = !!currentStepName && !!root.dataset.currentEngineStep && currentStepName !== root.dataset.currentEngineStep;
  root.dataset.currentEngineStep = currentStepName;
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
    act.pill = job ? job.status === "in_progress" ? "Engine working" : "Waiting for GitHub" : "Engine working";
    act.title = ACTION_NAMES[action] || "Working on your week";
    act.text = `${job ? job.status === "in_progress" ? elapsed(job.at) : "Queued on GitHub" : status.startedAt ? elapsed(status.startedAt) : "Engine working"}${currentStep ? ` · ${currentStep.name}` : ""}. This page checks for updates automatically.`;
    delete act.button;
    delete act.href;
    delete act.cta;
  }
  const prev = shiftWeek(ctx.week, -1), next = shiftWeek(ctx.week, 1);
  const pillClass = act.tone === "warn" ? "warn" : act.tone === "ok" ? "ok" : act.tone === "bad" ? "bad" : "accent";

  renderInto(root, html`
    ${pageHead({
      title: "This week", sub: weekEyebrow(ctx.week),
      right: html`<div class="row week-head-actions"><a class="btn small" href="#/week?author=${ctx.author}&week=${prev}" aria-label="Previous week" title="Previous week">${raw(icon("previous"))} ${prev}</a>
        <a class="btn small" href="#/week?author=${ctx.author}&week=${next}" aria-label="Next week" title="Next week">${next} ${raw(icon("next"))}</a>
        ${busy && !recoveryAvailable ? html`<button class="btn small" aria-label="Week options" title="Week options" disabled>${raw(icon("more"))}</button>` : html`<details class="week-options"><summary class="btn small" aria-label="Week options" title="Week options">${raw(icon("more"))}</summary>
          <div class="week-options-menu">${packageControls(ctx, wk, { busy, phase: status.phase, job, compact: true })}
            <a class="week-past-runs" href="#/runs?author=${ctx.author}&week=${ctx.week}">${raw(icon("runs"))}<span>Open past runs</span></a>
          </div>
        </details>`}</div>`,
    })}
    ${packageLockBand(wk, activity)}
    <section class="week-action ${act.tone}" aria-labelledby="next-title">
      <div class="decision-copy">
        <h2 id="next-title">${act.title}</h2>
        <div class="row small muted"><span>Current post</span>${act.pill ? html`<span class="pill ${pillClass}">${act.pill.split(" · due ")[0]}</span>` : ""}</div>
        <p class="lead">${act.text}</p>
        ${act.href ? html`<a class="btn primary" href="${act.href}">${act.cta}${raw(icon("next"))}</a>` : ""}
        ${act.button ? html`<button class="btn primary" id="${act.button.id}">${act.button.label}</button>` : ""}
        ${wk.package?.manual ? html`<details class="manual-control"><summary>Manual control: no automatic choice this week · What this means</summary>
          <p>No answer means no automatic choice. Open each decision yourself; the engine continues after you save it.</p></details>` : ""}
      </div>
      <div class="decision-visual">
      <figure class="status-orb" role="img" aria-label="${`Package status: ${status.phase === "decision" && !running ? act.pill || act.title : status.title}`}" data-phase="${status.phase}">
        <canvas width="360" height="360" aria-hidden="true"></canvas>
        <figcaption>${raw(icon(status.phase === "done" ? "check" : "clock"))}${running ? "Engine working" : status.phase === "decision" ? "Your turn" : status.phase === "done" ? "Week complete" : status.phase === "failed" ? "Needs attention" : "Choice saved"}</figcaption>
      </figure>
      </div>
    </section>
    ${journeyBand(ctx, wk, activity, firstWeek)}
    <nav class="home-menu" aria-label="Workspace"><a href="#/posts?author=${ctx.author}">${raw(icon("posts"))}<span><strong>Posts and results</strong><small>Published posts, saves and ratings</small></span>${raw(icon("next"))}</a><a href="#/brand/progress?author=${ctx.author}&week=${ctx.week}">${raw(icon("brand"))}<span><strong>Brand and goals</strong><small>Coverage, targets and your direction</small></span>${raw(icon("next"))}</a><a href="#/inputs/mine?author=${ctx.author}">${raw(icon("inputs"))}<span><strong>Add a first-hand note</strong><small>Your experience and ideas</small></span>${raw(icon("next"))}</a></nav>
    <details class="home-diagnostics"><summary>Workflow and delivery status</summary><div class="stack-s">${activity.unavailable ? html`<p class="small muted">${activity.unavailable}</p>` : ""}${job ? html`<div class="row between small"><span>${running ? "Live workflow" : failed ? "Latest workflow failed" : `Latest workflow: ${job.conclusion || job.status}`} · ${niceDate(job.at)}</span><a href="${job.url}" target="_blank" rel="noopener">Run details</a>${failed && action ? html`<button class="btn small" id="retry-step">Retry ${action}</button>` : ""}</div>` : html`<p class="small muted">No matching workflow found in recent runs. A saved choice is not proof that work has started.</p>`}<p class="small muted">${health.email?.status === "sent" ? `Last email accepted by the mail server: ${niceDate(health.email.at)}. Check your inbox or spam folder.` : health.email?.status === "not_configured" ? "Email is not set up. Decisions are available here in the app." : "Email delivery has not been verified for this author."}</p></div></details>
  `);

  bindPackageControls(ctx, root, wk);
  mountOrb(root);
  if (changedEngineStep) crossfadeStep(root.querySelector(".journey-work.running .journey-work-label"));
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
