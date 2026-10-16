import { $, html, raw, toast } from "../util.js";
import { pageHead, renderInto, withSaving } from "../ui.js";
import { voiceSettings } from "./brand.js";
import { icon } from "../icons.js";

export default async function view(ctx, root) {
  const [brand, guide, library] = await Promise.all([ctx.data.brand(ctx.author), ctx.data.brandText(ctx.author, "voice.md"), ctx.data.moveLibrary()]);
  const settings = await voiceSettings(ctx, { brand, voiceMd: guide });
  const text = guide || "";
  const description = text.match(/^VOICE:\s*([\s\S]+?)(?:\r?\n\r?\n|$)/m)?.[1]?.replace(/\s+/g, " ") || "";
  const sections = text.split(/^## /m).slice(1);
  const preferred = sections.find((section) => section.startsWith("Clarity and opinion")) || sections.find((section) => section.startsWith("Opinion-first voice")) || sections.find((section) => section.startsWith("Plain language"));
  const rules = (preferred || text).split("\n").reduce((items, line) => {
    if (/^- /.test(line)) items.push(line.slice(2));
    else if (/^\s+\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`;
    return items;
  }, []).slice(0, 8);
  const limits = brand.voiceRules;
  renderInto(root, html`${pageHead({ title: "Your voice", sub: "How your posts sound." })}
    <section class="voice-summary stack" aria-label="Your voice in plain words">
      <div class="row between"><h2>In plain words</h2><a class="btn" href="#/brand-chat?author=${ctx.author}">${raw(icon("brand-chat"))} Talk through a change</a></div>
      ${description ? html`<p class="lead">${description}</p>` : html`<p class="muted">${text ? "Your full saved guide is below." : "No voice guide saved yet."}</p>`}
      <dl class="voice-facts"><div><dt>Tone</dt><dd>${limits.default_tone || "balanced"}</dd></div><div><dt>Post length</dt><dd>${limits.length?.min ?? 1000}-${limits.length?.max ?? 2200} characters</dd></div><div><dt>Your interpretation starts with</dt><dd>${limits.reading_label || "My reading"}</dd></div></dl>
      ${rules.length ? html`<h2>Writing rules</h2><ul class="voice-rules">${rules.map((rule) => html`<li>${rule}</li>`)}</ul>` : ""}
      <h2>Ways you build an argument</h2><ul class="voice-rules">${(brand.moves.moves || []).map((move) => html`<li>${library.moves?.find((item) => item.id === move.id)?.name || move.id}</li>`)}</ul>
      <a class="small" href="#/brand/moves?author=${ctx.author}">Edit your strategy mix</a>
    </section>
    <details class="voice-settings"><summary>Writing settings and full guide</summary><div class="stack">${settings.html}</div></details>`);
  const details = root.querySelector(".voice-settings");
  const markDirty = () => { ctx.setDirty(true); $("#dirty", root).textContent = "Unsaved changes"; };
  details.addEventListener("input", markDirty);
  details.addEventListener("change", markDirty);
  $("#save", root).addEventListener("click", async (event) => {
    try {
      const files = await settings.save(root);
      await withSaving(event.currentTarget, () => ctx.data.save(files, `app: ${ctx.author} edits voice`), "Voice saved for future posts");
      ctx.setDirty(false);
      ctx.refresh();
    } catch (error) { toast(error.message, "bad"); }
  });
}