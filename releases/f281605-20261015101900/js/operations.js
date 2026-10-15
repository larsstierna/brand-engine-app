export const ACTION_NAMES = { strategy: "Preparing your strategy choice", discover: "Finding stories", draft: "Writing your draft", revise: "Revising your draft", finalize: "Preparing your post package", review: "Reviewing your brand", analyse: "Reading your CV", plan: "Planning your reasoning steps", onboard: "Building your brand", "test-email": "Sending a test email" };
for (const action of ["strategy", "discover", "draft", "revise", "finalize"]) ACTION_NAMES[`restart-${action}`] = ACTION_NAMES[action];
Object.assign(ACTION_NAMES, { "restart-pick": "Opening story selection", "restart-approve": "Opening draft review", "restart-posted": "Opening posting record", "restart-metrics": "Opening metrics" });

export function scopedJob(jobs, author, week) {
  return jobs.find((job) => {
    const match = job.name.match(/(?:^|\/ )run \(([^,]+), ([^,]+), ([^,)]+)/);
    return match && match[1] === author && match[2] === week;
  });
}

export function jobAction(job) {
  return job?.name.match(/(?:^|\/ )run \([^,]+, [^,]+, ([^,)]+)/)?.[1] || null;
}

export function weeklyJob(job) {
  return /^(?:restart-)?(?:strategy|discover|draft|revise|finalize|pick|approve|posted|metrics)$/.test(jobAction(job) || "") ? job : null;
}

export function elapsed(at, now = Date.now()) {
  const milliseconds = now - Date.parse(at);
  if (!Number.isFinite(milliseconds)) return "Start time unavailable";
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return minutes < 1 ? "Started less than a minute ago" : `Started ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

export function failureMessage(note = "") {
  if (/usage_limit|429|rate.limit/i.test(note)) return "Claude reached its usage limit. Check the backup provider or retry after the limit resets.";
  if (/model.*not available|deployment.*not.found/i.test(note)) return "The backup model deployment could not be found. Check its exact deployment name in GitHub Actions variables.";
  if (/401|authentication|invalid.*token/i.test(note)) return "A service rejected its credentials. Check the failed run for which connection needs updating.";
  if (/no candidates|no eligible candidates/i.test(note)) return "Discovery did not produce usable stories. Check the failed run for the research or provider error before retrying.";
  return note || "This step did not finish. Open the run details for the failure reason.";
}