// Where the data lives. Two interchangeable backends with the same methods:
//   GitHubBackend - the real thing: reads and commits files in the repository through the GitHub API, starts workflows.
//   LocalBackend  - `python -m engine serve` on a laptop: the same files on disk (for testing and offline work).
// Methods: readText(path) · readBlobURL(path) · list(dir) · commit(files, message) · dispatch(task) · runs() · whoami()

import { toBase64 } from "./util.js";

export class BackendError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class GitHubBackend {
  constructor({ owner, repo, branch = "main", token }) {
    Object.assign(this, { owner, repo, branch, token });
    this.kind = "github";
    this.base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }
  label() { return `${this.owner}/${this.repo}`; }

  async api(path, opts = {}) {
    const res = await fetch(path.startsWith("http") ? path : this.base + path, {
      cache: "no-store",
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers || {}),
      },
    });
    const expiry = res.headers.get("github-authentication-token-expiration");
    if (expiry) this.tokenExpiresAt = expiry;
    if (res.status === 404) return null;
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { msg = (await res.json()).message || msg; } catch { /* keep status text */ }
      if (res.status === 401) msg = "GitHub rejected the token. Check it in Settings.";
      if (res.status === 403 && /rate limit/i.test(msg)) msg = "GitHub rate limit reached. Try again in a few minutes.";
      throw new BackendError(msg, res.status);
    }
    return res;
  }

  contentsPath(path) {
    return `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(this.branch)}`;
  }

  async readText(path) {
    const res = await this.api(this.contentsPath(path), { headers: { Accept: "application/vnd.github.raw" } });
    return res ? res.text() : null;
  }

  async readBlobURL(path) {
    const res = await this.api(this.contentsPath(path), { headers: { Accept: "application/vnd.github.raw" } });
    return res ? URL.createObjectURL(await res.blob()) : null;
  }

  async list(dir) {
    const res = await this.api(this.contentsPath(dir));
    if (!res) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map((x) => ({ name: x.name, type: x.type === "dir" ? "dir" : "file", path: x.path })) : [];
  }

  // One commit for many files (Git Data API), retried if someone else pushed in between.
  async commit(files, message) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const ref = await (await this.api(`/git/ref/heads/${encodeURIComponent(this.branch)}`)).json();
      const head = ref.object.sha;
      const commit = await (await this.api(`/git/commits/${head}`)).json();
      const tree = [];
      for (const f of files) {
        if (f.delete) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
        const blob = await (await this.api("/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: f.encoding === "base64" ? f.content : toBase64(f.content), encoding: "base64" }),
        })).json();
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await (await this.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) })).json();
      const newCommit = await (await this.api("/git/commits", {
        method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
      })).json();
      try {
        await this.api(`/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
        return { sha: newCommit.sha };
      } catch (e) {
        if (e.status !== 422 || attempt === 3) throw e; // 422: not a fast-forward, someone pushed first: rebuild on top
      }
    }
    throw new BackendError("Could not save after 3 attempts");
  }

  async dispatch({ action, author, week = "", force = false }) {
    const response = await this.api("/actions/workflows/engine.yml/dispatches", {
      method: "POST",
      body: JSON.stringify({ ref: this.branch, inputs: { action, author, week, force: String(force) } }),
    });
    if (!response) throw new BackendError("The Engine workflow was not found. Check the repository and workflow setup.", 404);
    return { status: "started in GitHub Actions" };
  }

  async runs() {
    const res = await this.api(`/actions/runs?per_page=12&branch=${encodeURIComponent(this.branch)}`);
    if (!res) return [];
    const data = await res.json();
    return (data.workflow_runs || []).map((r) => ({
      id: r.id, name: r.display_title || r.name, workflow: r.name, status: r.status, conclusion: r.conclusion,
      at: r.created_at, url: r.html_url, event: r.event,
    }));
  }

  async whoami() {
    const res = await this.api("https://api.github.com/user");
    return res ? (await res.json()).login : null;
  }

  async jobs(runId) {
    const res = await this.api(`/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`);
    if (!res) return [];
    return (await res.json()).jobs.map((job) => ({
      name: job.name, status: job.status, conclusion: job.conclusion, at: job.started_at,
      url: job.html_url, steps: job.steps.map((step) => ({ name: step.name, status: step.status, conclusion: step.conclusion })),
    }));
  }
}

export class LocalBackend {
  constructor(base = "") { this.base = base; this.kind = "local"; }
  label() { return "this computer (python -m engine serve)"; }
  async req(path, opts) {
    const res = await fetch(this.base + path, { cache: "no-store", ...opts });
    if (res.status === 404) return null;
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error || msg; } catch { /* keep */ }
      throw new BackendError(msg, res.status);
    }
    return res;
  }
  async readText(path) { const r = await this.req(`/local/file?path=${encodeURIComponent(path)}`); return r ? r.text() : null; }
  async readBlobURL(path) { const r = await this.req(`/local/file?path=${encodeURIComponent(path)}`); return r ? URL.createObjectURL(await r.blob()) : null; }
  async list(dir) { const r = await this.req(`/local/list?path=${encodeURIComponent(dir)}`); return r ? r.json() : []; }
  async commit(files, message) {
    const r = await this.req("/local/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files, message }) });
    return r.json();
  }
  async dispatch(task) {
    const r = await this.req("/local/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) });
    const result = await r.json();
    if (result.status !== "done") throw new BackendError(result.status || "The local step did not run");
    return result;
  }
  async runs() {
    const r = await this.req("/local/runs");
    const data = r ? await r.json() : [];
    return data.map((x) => ({ name: `${x.action} ${x.author} ${x.week}`, workflow: "local", status: "completed", conclusion: x.status, at: "", url: "" }));
  }
  async whoami() { return "local"; }
}

export function makeBackend(settings) {
  if (settings.backend === "local" || new URLSearchParams(location.search).has("local")) return new LocalBackend();
  if (settings.owner && settings.repo && settings.token) return new GitHubBackend(settings);
  return null;
}
