import { html, raw } from "../util.js";
import { pageHead, renderInto, withSaving } from "../ui.js";
import { icon } from "../icons.js";

const validId = (value) => /^chat-[a-z0-9-]{8,80}$/.test(value || "");
const jsonFile = (path, value) => ({ path, content: JSON.stringify(value, null, 2) + "\n" });

export default async function view(ctx, root) {
  const base = `authors/${ctx.author}/brand-chat`;
  const conversations = (await ctx.backend.list(base)).filter((item) => item.type === "dir" && validId(item.name)).sort((first, second) => second.name.localeCompare(first.name));
  const sessions = await Promise.all(conversations.slice(0, 30).map(async (item) => ({ ...item, ...(await ctx.data.json(`${base}/${item.name}/session.json`, {})) })));
  sessions.sort((first, second) => String(second.updated_at || second.name).localeCompare(String(first.updated_at || first.name)));
  const identifier = validId(ctx.sub) ? ctx.sub : null;
  const session = sessions.find((item) => item.name === identifier) || {};
  const path = identifier ? `${base}/${identifier}` : null;
  const load = async () => {
    if (!path) return {};
    const [request, response, context, status, decision, history, activity] = await Promise.all([
      ...["request", "response", "context", "status", "decision", "history"].map((name) => ctx.data.json(`${path}/${name}.json`, {})),
      ctx.data.activity(ctx.author, identifier, true),
    ]);
    if (!request.id && history.id) return {
      request: { id: history.id, title: history.title, messages: (history.messages || []).map((message) => ({ ...message, source: "imported-review" })) },
      response: { request_id: history.id, message: history.conclusion.summary, conclusion: history.conclusion, changes: history.changes || [] },
      context: { id: history.id, files: history.before || {} }, status: { id: history.id, status: "applied", at: history.recorded_at },
      decision: {}, activity, imported: true, provenance: history.provenance,
    };
    return { request, response, context, status, decision, activity, provenance: history.provenance };
  };
  const current = await load();
  const { request = {}, response = {}, context = {}, status = {}, decision = {}, activity = {} } = current;
  const matches = !!request.id && response.request_id === request.id && context.id === request.id;
  const checked = matches && status.id === request.id;
  const applied = checked && status.status === "applied";
  const rejected = checked && status.status === "rejected";
  const decided = decision.id === request.id && ["approve", "reject"].includes(decision.action);
  const running = activity.job && ["queued", "in_progress", "pending", "waiting"].includes(activity.job.status);
  const failed = status.id === request.id && status.status === "failed" || activity.job?.status === "completed" && activity.job.conclusion !== "success";
  const waiting = !!request.id && (!checked || decided && !applied && !rejected);
  const canApprove = checked && status.status === "proposed" && !!status.response_digest && !decided && !running;
  const conclusion = matches ? response.conclusion || { summary: applied ? "Your approved writing changes are saved for future posts." : "The proposed changes are ready for your review.", rules: (response.changes || []).map((change) => change.reason), unchanged: [] } : null;
  const title = request.title || session.title || (request.messages?.[0]?.text || "").split("\n")[0].slice(0, 80);
  const stateLabel = applied ? "Applied" : rejected ? "Not applied" : failed ? "Needs attention" : waiting ? running ? "Working" : "Pending" : status.status === "clarification" ? "Your reply needed" : canApprove ? "Needs approval" : "";
  renderInto(root, html`${pageHead({ title: "Brand chat", sub: "Brand direction and writing voice." })}
    <div class="chat-workspace"><aside class="chat-history"><details class="chat-session-list" open><summary>Sessions</summary>
      <a class="btn chat-new" href="#/brand-chat?author=${ctx.author}">${raw(icon("new-chat"))} New chat</a>
      <nav aria-label="Sessions">${sessions.map((item) => html`<a class="chat-session" href="#/brand-chat/${item.name}?author=${ctx.author}" ${item.name === identifier ? raw('aria-current="page"') : ""}><strong>${item.title || "Saved conversation"}</strong><span>${({ applied: "Applied", proposed: "Needs approval", clarification: "Your reply needed", rejected: "Rejected", failed: "Needs attention", pending: "Waiting for reply" })[item.status] || "Conversation"}</span></a>`)}</nav>
      ${sessions.length ? "" : html`<p class="small muted">No sessions yet.</p>`}</details><div class="chat-history-links"><a href="#/voice?author=${ctx.author}">Your voice</a><a href="#/brand?author=${ctx.author}">Your brand</a></div></aside>
    <section class="chat-main stack">${title ? html`<header class="chat-session-heading"><h2>${title}</h2>${stateLabel ? html`<span class="chip">${stateLabel}</span>` : ""}</header>` : ""}
      ${conclusion ? html`<div class="chat-session-outcome"><p>${conclusion.summary}</p><button class="btn small" id="view-conclusion">${raw(icon("next"))} View conclusion</button></div>` : ""}
      ${current.provenance ? html`<p class="chat-record-note small muted">${current.imported ? current.provenance : "Earlier messages marked Review excerpt or Recorded conclusion come from the imported last-post review. New Brand Engine replies belong to this session."}</p>` : ""}
      <div class="chat-transcript" role="log" aria-label="Conversation">${(request.messages || []).map((message) => html`<article class="chat-message ${message.role === "user" ? "user" : "assistant"}"><h2>${message.role === "user" ? "You" : message.source === "imported-review" ? "Review excerpt" : message.source === "imported-conclusion" ? "Recorded conclusion" : "Brand Engine"}</h2><p>${message.text}</p></article>`)}
        ${matches && !current.imported ? html`<article class="chat-message assistant"><h2>Brand Engine</h2><p>${response.message}</p></article>` : !request.id ? html`<div class="chat-empty"><h2>What should change?</h2><p class="muted">Your brand, your voice, or both.</p></div>` : ""}</div>
      ${request.id ? html`<p class="chat-status ${failed ? "bad" : "muted"}" role="status">${applied ? "Applied to future posts. Existing drafts are unchanged." : rejected ? "Proposal rejected. Your settings are unchanged." : failed ? status.message || "This step failed. Retry it or send a follow-up." : waiting ? ctx.backend.kind === "local" ? "Saved locally. AI replies require the GitHub connection." : running ? "The engine is working on this conversation." : "Saved. Waiting for the workflow to finish." : status.status === "clarification" ? "Your answer is needed." : "Review the proposed changes before approving."}</p>` : ""}
      ${conclusion ? html`<section class="chat-conclusion stack" aria-label="Conclusion" tabindex="-1"><div class="row between"><h2>Conclusion</h2><span class="small muted">${applied ? "Applied" : rejected ? "Not applied" : status.status === "clarification" ? "Needs clarification" : "Proposed"}</span></div><p>${conclusion.summary}</p>
        ${conclusion.rules?.length ? html`<h3>${applied ? "What changed" : "What would change"}</h3><ul>${conclusion.rules.map((rule) => html`<li>${rule}</li>`)}</ul>` : ""}
        ${conclusion.unchanged?.length ? html`<h3>What stays unchanged</h3><ul>${conclusion.unchanged.map((rule) => html`<li>${rule}</li>`)}</ul>` : ""}
        ${matches && response.changes?.length ? html`<details class="chat-proposal"><summary>Exact file changes (${response.changes.length})</summary><section class="stack" aria-label="Proposed changes">${response.changes.map((change) => html`<details class="chat-file"><summary>${change.file}</summary><p>${change.reason}</p><div class="chat-diff"><section><h3>Before</h3><pre>${context.files?.[change.file] || "Empty file"}</pre></section><section><h3>After</h3><pre>${change.content}</pre></section></div></details>`)}</section></details>` : ""}
        ${canApprove ? html`<div class="row chat-decisions"><button class="btn primary" id="approve-changes">${raw(icon("check"))} Approve changes</button><button class="btn" id="refine-changes">Refine first</button><button class="btn danger" id="reject-changes">Reject</button></div>` : ""}</section>` : ""}
      ${failed || waiting && !running ? html`<button class="btn" id="retry-chat">Retry ${decided ? "applying the decision" : "AI reply"}</button>` : ""}
      <form class="chat-composer stack" id="chat-form"><label class="field" for="chat-message">${request.id ? "Your reply" : "Your message"}<textarea id="chat-message" rows="5" maxlength="30000" required></textarea></label>
        <div class="row between"><label class="row small"><input id="include-example" type="checkbox">Include the clarity lessons from my post example</label><button class="btn primary" type="submit">${raw(icon("send"))} Send</button></div><p class="small bad" id="chat-error" role="alert"></p></form>
    </section></div>`);
  const sessionList = root.querySelector(".chat-session-list");
  const mobile = matchMedia("(max-width: 820px)");
  const resizeSessions = () => { sessionList.open = !mobile.matches; };
  resizeSessions();
  mobile.addEventListener("change", resizeSessions, { signal: ctx.signal });
  const composer = root.querySelector("#chat-message");
  const error = root.querySelector("#chat-error");
  root.querySelector("#view-conclusion")?.addEventListener("click", () => {
    const target = root.querySelector(".chat-conclusion");
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  });
  composer.addEventListener("input", () => ctx.setDirty(!!composer.value.trim()));
  const lessons = "Use short, active sentences. Explain my actual concern and the minimum context needed to understand it. Show the reasoning between facts and opinion. Keep only details that serve the argument. Explain necessary jargon. Give the strongest counterargument fair weight. Match conviction to evidence; a source being silent about a safeguard does not mean it is absent. Keep one useful ending, not a rigid template.";
  root.querySelector("#chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    let message = composer.value.trim();
    if (root.querySelector("#include-example").checked) message += `\n\nClarity lessons: ${lessons}`;
    if (!message || message.length > 30000) { error.textContent = "Write a message of up to 30,000 characters."; return; }
    const id = identifier || `chat-${Date.now()}-${crypto.randomUUID()}`;
    const target = `${base}/${id}`;
    const messages = [...(request.messages || [])];
    if (matches) messages.push({ role: "assistant", text: response.message, ...(current.imported ? { source: "imported-conclusion" } : {}) });
    messages.push({ role: "user", text: message });
    if (messages.length > 40) { error.textContent = "This conversation is full. Start a new conversation."; return; }
    const now = new Date().toISOString();
    const sessionTitle = title || message.split("\n")[0].slice(0, 80);
    try {
      await withSaving(event.submitter, () => ctx.data.save([
        jsonFile(`${target}/request.json`, { id: crypto.randomUUID(), title: sessionTitle, messages }),
        jsonFile(`${target}/session.json`, { title: sessionTitle, created_at: session.created_at || now, updated_at: now, status: "pending" }),
      ], `app: ${ctx.author} brand conversation`, identifier ? { path: `${path}/request.json`, id: current.imported ? null : request.id || null } : null), "Message saved");
      ctx.setDirty(false);
      if (identifier) ctx.refresh(); else ctx.go(`brand-chat/${id}`);
    } catch (failure) { error.textContent = failure.message; }
  });
  const decide = async (button, action) => {
    if (composer.value.trim()) { error.textContent = "Send your reply before deciding on this proposal, or clear it to keep the current proposal."; composer.focus(); return; }
    if (action === "approve" && !window.confirm("Apply these exact changes to future posts? Your current draft will not change.")) return;
    try {
      await withSaving(button, () => ctx.data.save([jsonFile(`${path}/decision.json`, { id: request.id, action, response_digest: status.response_digest, at: new Date().toISOString() })], `app: ${ctx.author} ${action} brand proposal`, { path: `${path}/request.json`, id: request.id }), "Decision saved");
      ctx.refresh();
    } catch (failure) { error.textContent = failure.message; }
  };
  root.querySelector("#approve-changes")?.addEventListener("click", (event) => decide(event.currentTarget, "approve"));
  root.querySelector("#reject-changes")?.addEventListener("click", (event) => decide(event.currentTarget, "reject"));
  root.querySelector("#refine-changes")?.addEventListener("click", () => composer.focus());
  root.querySelector("#retry-chat")?.addEventListener("click", async (event) => {
    try { await withSaving(event.currentTarget, () => ctx.backend.dispatch({ action: decided ? "apply-brand-chat" : "brand-chat", author: ctx.author, week: identifier }), "Retry requested"); ctx.refresh(); }
    catch (failure) { error.textContent = failure.message; }
  });
  if (identifier) ctx.watch(load, current);
}