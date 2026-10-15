import { html, niceDate } from "./util.js";
import { stagesFor, stageIndex, weekFlow } from "./ui.js";
import { ACTION_NAMES, elapsed, jobAction, weeklyJob } from "./operations.js";
import { automationCard } from "./automation.js";

const JOB_STEPS = { strategy: "strategy", discover: "discovered", research: "research", opinion: "researched", draft: "drafted", revise: "drafted", finalize: "ready", pick: "picked", approve: "approved", posted: "posted", metrics: "measured" };
const PAGES = { strategy: "strategy", discovered: "pick", picked: "pick", research: "opinion", researched: "opinion", drafted: "draft", approved: "draft", ready: "ready", posted: "ready", measured: "posts" };
const ACTORS = { app: "You in the app", email: "You by email", deadline: "Deadline default", engine: "Engine", auto: "Engine recommendation" };
const name = (value = "") => value.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());
let disclosureEvents;

export function clearProgressDisclosure() {
  disclosureEvents?.abort();
  disclosureEvents = null;
}

export function bindProgressDisclosure(root) {
  clearProgressDisclosure();
  const details = root.querySelector(".progress-details");
  if (!details) return;
  disclosureEvents = new AbortController();
  const mobile = window.matchMedia("(max-width: 820px)");
  const resize = () => { details.open = !mobile.matches; };
  resize();
  mobile.addEventListener("change", resize, { signal: disclosureEvents.signal });
}

export { weeklyJob };

export function packageStatus(week, activity = {}) {
  const stage = week.state.stage;
  const decisions = week.decisions;
  const currentDraftDecision = !decisions.draft || Number(decisions.draft.round ?? decisions.draft.email_round ?? 0) === Number(week.state.round || 0);
  const opinionFlow = weekFlow(week) === 2;
  const job = weeklyJob(activity.job);
  const action = jobAction(job)?.replace(/^restart-/, "");
  const active = JOB_STEPS[action];
  if (job && ["queued", "pending", "waiting", "in_progress"].includes(job.status)) {
    const running = job.status === "in_progress";
    return { phase: running ? "running" : "queued", title: ACTION_NAMES[action] || "Preparing the next step",
      detail: running ? `${elapsed(job.at)}${job.steps?.find((step) => step.status === "in_progress") ? ` · ${job.steps.find((step) => step.status === "in_progress").name}` : ""}. Your saved choices are kept below.` : "Your choice is saved. GitHub has queued the next step; no further choice is needed yet.", active };
  }
  if (["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(job?.conclusion) || stage === "failed") return { phase: "failed", title: "This step needs attention", detail: "The latest step did not finish. Your recorded choices are preserved.", active: active || "discovered" };
  let pending;
  if (["new", "strategy"].includes(stage) && decisions.strategy) pending = ["Strategy saved", "Finding stories", "discovered"];
  if (stage === "discovered" && ["pick", "own"].includes(decisions.story?.action)) pending = ["Story saved", opinionFlow ? "Research" : "Writing your draft", opinionFlow ? "research" : "drafted"];
  if (stage === "discovered" && decisions.story?.action === "wider") pending = ["Wider search requested", "Finding new story cards", "discovered"];
  if (stage === "picked") pending = ["Story saved", opinionFlow ? "Research" : "Writing your draft", opinionFlow ? "research" : "drafted"];
  if (stage === "researched" && decisions.opinion) pending = ["Opinion saved", "Writing your draft", "drafted"];
  if (stage === "drafted" && currentDraftDecision && decisions.draft?.action === "change") pending = ["Change request saved", "Revising your draft", "drafted"];
  if (["drafted", "approved"].includes(stage) && currentDraftDecision && ["approve", "edit"].includes(decisions.draft?.action)) pending = ["Approval saved", "Building the ready package", "ready"];
  if (stage === "ready" && decisions.posted) pending = ["Posting details saved", "Recording your post", "posted"];
  if (pending) return { phase: "handoff", title: `${pending[0]}. ${pending[1]} is next.`,
    detail: activity.unavailable ? "Your choice is saved, but workflow status is unavailable. We cannot confirm whether the next step has started. This page will check again automatically." : "Waiting for the next workflow to start. No further choice is needed yet; this page checks for updates automatically.", active: pending[2] };
  if (stage === "revising") return { phase: "handoff", title: "Your revision is pending", detail: "A revision was started, but no running workflow is confirmed. Check its status on This week.", active: "drafted" };
  if (stage === "skipped") return { phase: "done", title: "Week skipped", detail: "Nothing will be posted from this package.", active: null };
  const next = { new: "strategy", strategy: "strategy", discovered: "picked", researched: "researched", drafted: "approved", approved: "ready", ready: "posted", posted: "measured" }[stage];
  return { phase: stage === "measured" ? "done" : "decision", title: { new: "Choose your strategy", strategy: "Choose your strategy", discovered: "Choose your story", researched: "Choose your opinion", drafted: "Review your draft", approved: "Build the ready package", ready: "Ready for you to post", posted: "Add your post results", measured: "This week is complete" }[stage] || "Your weekly package",
    detail: activity.unavailable ? "Workflow status is unavailable. The choices below are saved records, not proof that work is running." : week.package?.manual ? "Manual control. Deadline defaults are paused." : "Your recorded choices and completed work are shown below.", active: next };
}

export function retainedResults(week, activity = {}) {
  const status = packageStatus(week, activity);
  const steps = stagesFor(week);
  const awaitingOpinion = weekFlow(week) === 2 && week.state.stage === "researched" && status.phase === "decision";
  const pendingIndex = ["handoff", "queued", "running"].includes(status.phase) || awaitingOpinion ? steps.findIndex((step) => step.id === status.active) : -1;
  return { from: pendingIndex, draft: pendingIndex >= 0 && pendingIndex <= steps.findIndex((step) => step.id === "drafted") && !!week.artifacts?.draft, ready: pendingIndex >= 0 && pendingIndex <= steps.findIndex((step) => step.id === "ready") && !!week.artifacts?.ready };
}

export function progressSteps(week, activity = {}, { firstWeek = false } = {}) {
  const status = packageStatus(week, activity);
  const decisions = week.decisions;
  const currentDraftDecision = !decisions.draft || Number(decisions.draft.round ?? decisions.draft.email_round ?? 0) === Number(week.state.round || 0);
  const chosenCard = (week.candidates?.candidates || []).find((card) => card.id === decisions.story?.candidate);
  const moves = week.arc?.moves || [];
  const strategy = decisions.strategy;
  const strategyName = strategy?.action === "auto" ? week.arc?.recommended?.name || "Engine recommendation" : moves.find((move) => move.id === strategy?.move)?.name || name(strategy?.move || "");
  const count = (week.candidates?.candidates || []).filter((card) => card.eligible !== false).length;
  const choices = {
    strategy: strategy ? { text: strategyName || "Strategy chosen", decision: strategy } : null,
    discovered: count ? { text: `${count} eligible stor${count === 1 ? "y" : "ies"}` } : null,
    picked: ["pick", "own"].includes(decisions.story?.action) ? { text: decisions.story.action === "own" ? `Your story: ${decisions.story.story || "Author-provided"}` : chosenCard?.headline || decisions.story.candidate, decision: decisions.story } : null,
    research: week.artifacts?.research ? { text: "Evidence brief and opinion options" } : null,
    researched: decisions.opinion ? { text: `${decisions.opinion.resolved?.opinion || decisions.opinion.opinion || week.opinions?.options?.find((option) => option.id === decisions.opinion.option)?.opinion || "Recommended opinion"} · ${decisions.opinion.resolved?.tone || decisions.opinion.tone || "tone awaiting resolution"}`, decision: decisions.opinion } : null,
    drafted: week.artifacts?.draft ? { text: currentDraftDecision && decisions.draft?.action === "change" ? "Changes requested" : "Draft prepared" } : null,
    approved: currentDraftDecision && ["approve", "edit"].includes(decisions.draft?.action) ? { text: decisions.draft.action === "edit" ? "Your edit approved" : "Approved", decision: decisions.draft } : currentDraftDecision && decisions.draft?.action === "change" ? { text: decisions.draft.note || (decisions.draft.requests || []).map(name).join(", "), decision: decisions.draft, pending: true } : null,
    ready: week.artifacts?.ready ? { text: "Ready post prepared" } : null,
    posted: decisions.posted ? { text: decisions.posted.posted_at || "Posting details recorded", decision: decisions.posted } : null,
    measured: decisions.metrics ? { text: `Day ${decisions.metrics.day}${typeof decisions.metrics.saves === "number" ? ` · ${decisions.metrics.saves} saves` : ""}`, decision: decisions.metrics } : null,
  };
  const index = stageIndex(week.state.stage, weekFlow(week));
  const retained = retainedResults(week, activity);
  return stagesFor(week).map((step, position) => {
    if (firstWeek && week.state.stage === "new" && !["running", "queued", "failed"].includes(status.phase)) {
      if (step.id === "strategy") return { ...step, choice: "Not required for first discovery", actor: "", at: "", status: "pending" };
      if (step.id === "discovered") return { ...step, choice: "Next available schedule check", actor: "", at: "", status: "scheduled" };
    }
    const event = [...(week.state.history || [])].reverse().find((item) => item.stage === step.id);
    const choice = choices[step.id];
    const current = status.active === step.id;
    const previous = retained.from >= 0 && position >= retained.from && !!choice;
    const done = !previous && !choice?.pending && (step.id === "strategy" ? !!strategy : position <= index || !!choice);
    return { ...step, choice: `${previous ? "Saved result, awaiting this step: " : ""}${choice?.text || ""}`, actor: ACTORS[choice?.decision?.by || event?.by] || choice?.decision?.by || "", at: choice?.decision?.at || event?.at || "",
      status: current && ["running", "queued", "handoff", "failed"].includes(status.phase) ? status.phase : done ? "done" : current ? "now" : "pending" };
  });
}

export function progressRail(ctx, week, { activity = {}, selected = "", archive = false, firstWeek = false } = {}) {
  const status = packageStatus(week, archive ? {} : activity);
  return html`<aside class="week-progress package-progress" aria-label="Progress"><details class="progress-details" open><summary><h2>This week's progress</h2><span class="progress-summary">Choices and history</span></summary><div class="progress-content">
    <p class="progress-caption">${archive ? "Saved choices · read-only" : activity.unavailable ? "Saved choices · workflow status unavailable" : firstWeek ? "First discovery · no strategy answer required" : status.phase === "handoff" ? "Choice saved · waiting for the next step" : status.phase === "running" ? "Engine working" : status.phase === "queued" ? "Queued on GitHub" : "Choices and completed steps"}</p>
    <ol class="stepper choice-stepper" aria-label="This week's progress">${progressSteps(week, archive ? {} : activity, { firstWeek: !archive && firstWeek }).map((step) => {
      const params = new URLSearchParams({ author: ctx.author, week: ctx.week, ...(archive ? { run: week.archive, step: step.id } : step.id === "measured" ? { rate: ctx.week } : {}) });
      const href = `#/${archive ? "runs" : PAGES[step.id]}?${params}`;
      return html`<li class="${step.status === "done" ? "done" : step.status !== "pending" ? "now" : ""} ${selected === step.id ? "selected" : ""}"><div class="bar"></div>
        <a class="name" href="${href}" aria-current="${selected === step.id ? "step" : "false"}">${step.name}</a>
        <span class="when muted">${step.choice || (archive && ["now", "handoff"].includes(step.status) ? "Not completed at snapshot" : activity.unavailable && step.status === "handoff" ? "Status unavailable" : ({ running: "Running", queued: "Queued", handoff: "Waiting to start", failed: "Needs attention", done: "Completed", now: "Needs you", pending: "Not reached" })[step.status])}</span>
        ${step.choice && ["running", "queued", "handoff", "failed"].includes(step.status) ? html`<span class="step-state">${archive ? "Not completed at snapshot" : activity.unavailable && step.status === "handoff" ? "Status unavailable" : { running: "Running", queued: "Queued", handoff: "Waiting to start", failed: "Needs attention" }[step.status]}</span>` : ""}
        ${step.actor || step.at ? html`<span class="step-record">${[step.actor, step.at ? niceDate(step.at) : ""].filter(Boolean).join(" · ")}</span>` : ""}
      </li>`;
    })}</ol></div></details></aside>`;
}

export function mountPackageProgress(ctx, root, week, activity = {}, health = {}, { firstWeek = false } = {}) {
  const archive = !!week.archive;
  const selected = archive ? ctx.params.get("step") || "" : { strategy: "strategy", pick: "picked", opinion: "researched", draft: "drafted", ready: "ready" }[ctx.page] || "";
  const header = root.querySelector(".page-head");
  const layout = document.createElement("div");
  layout.className = "package-layout";
  const main = document.createElement("div");
  main.className = "package-main stack";
  for (const child of [...root.childNodes]) if (child !== header) main.appendChild(child);
  if (!archive) {
    const status = packageStatus(week, activity);
    const banner = document.createElement("section");
    banner.className = `package-handoff ${status.phase}`;
    banner.setAttribute("aria-label", "Package status");
    const retained = retainedResults(week, activity);
    banner.innerHTML = String(html`<h2>${status.title}</h2><p>${status.detail}</p>${retained.draft || retained.ready ? html`<p class="retained-warning">Saved earlier results remain available below. They are not confirmed results of the current choice; review and posting stay unavailable until the new step finishes.</p>` : ""}`);
    if (!["decision", "done"].includes(status.phase) || activity.unavailable) main.prepend(banner);
    if (["strategy", "pick", "opinion", "draft"].includes(ctx.page) && status.phase === "decision") main.prepend(document.createRange().createContextualFragment(String(automationCard(ctx, week, status, { health, compact: true, firstWeek }))));
  }
  layout.appendChild(main);
  layout.insertAdjacentHTML("beforeend", String(progressRail(ctx, week, { activity, selected, archive, firstWeek })));
  root.appendChild(layout);
  bindProgressDisclosure(root);
}