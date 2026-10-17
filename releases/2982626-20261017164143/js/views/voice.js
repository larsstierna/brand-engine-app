import { $, html, raw, toast } from "../util.js";
import { pageHead, renderInto, withSaving } from "../ui.js";
import { savebar, voiceSettings } from "./brand.js";
import { icon } from "../icons.js";

const LENGTHS = [
  { id: "short", label: "Short", min: 1000, max: 1500, hard_max: 2000 },
  { id: "medium", label: "Medium", min: 1300, max: 2000, hard_max: 2500 },
  { id: "long", label: "Long", min: 1800, max: 2600, hard_max: 3100 },
];
const EMOJI = [{ id: "none", label: "None", min: 0, max: 0 }, { id: "few", label: "A few", min: 1, max: 2 }, { id: "more", label: "More", min: 1, max: 3 }];
const FIRST_PERSON = [{ id: "rarely", label: "Rarely", max: 1 }, { id: "sometimes", label: "Sometimes", max: 3 }, { id: "often", label: "Often", max: 5 }];
const BAN_KEYS = ["banned_endings", "banned_words", "banned_openers", "banned_phrases"];
const BAN_LABELS = { banned_endings: "ending", banned_words: "word", banned_openers: "opener", banned_phrases: "phrase" };

function segmented(name, label, options, selected) {
  return html`<fieldset class="segmented-control"><legend>${label}${selected ? "" : html` <small class="muted">Custom</small>`}</legend>
    <div class="segmented-options">${options.map((option) => html`<label class="segment-option"><input type="radio" name="${name}" value="${option.id}" ${selected === option.id ? "checked" : ""}><span>${option.label}</span></label>`)}</div>
  </fieldset>`;
}

function chipList(items) {
  return html`${BAN_KEYS.flatMap((key) => (items[key] || []).map((value, index) => html`<span class="banned-chip">
    <span>${value}</span><small>${BAN_LABELS[key]}</small><button type="button" class="ban-remove" data-key="${key}" data-index="${index}" title="Remove ${value}" aria-label="Remove ${value}">${raw(icon("x"))}</button>
  </span>`))}`;
}

export default async function view(ctx, root) {
  const [brand, guide, strategyData, slopData] = await Promise.all([
    ctx.data.brand(ctx.author), ctx.data.brandText(ctx.author, "voice.md"), ctx.data.strategyLibrary(), ctx.data.slopPatterns(),
  ]);
  const settings = await voiceSettings(ctx, { brand, voiceMd: guide });
  const strategies = strategyData.strategies || [];
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
  const length = limits.length || {};
  const lengthPreset = LENGTHS.find((preset) => preset.min === (length.min ?? 1000) && preset.max === (length.max ?? 2200)
    && preset.hard_max === (length.hard_max ?? 2800))?.id;
  const emojiPreset = EMOJI.find((preset) => preset.min === (limits.emoji_min ?? 1) && preset.max === (limits.emoji_max ?? 2))?.id;
  const firstPersonPreset = FIRST_PERSON.find((preset) => preset.max === (limits.first_person_max ?? 5))?.id;
  const banned = Object.fromEntries(BAN_KEYS.map((key) => [key, [...(limits[key] || [])]]));
  const openerPattern = limits.author_first_opener || "^(?:As (a|the) |Because my|In my role|My role|I wanted to share|Excited to|Proud to)";
  let openerRegex;
  try { openerRegex = new RegExp(openerPattern, "i"); } catch { openerRegex = /^(?:As (a|the) |Because my|In my role|My role|I wanted to share|Excited to|Proud to)/i; }

  renderInto(root, html`${pageHead({ title: "Your voice", sub: "The choices that shape how each post sounds." })}
    <section class="voice-usual stack" aria-labelledby="usual-writing">
      <h2 id="usual-writing">Your usual writing strategy</h2>
      <div class="voice-strategy-grid">${strategies.map((strategy) => html`<label class="voice-strategy-option">
        <input type="radio" name="default-strategy" value="${strategy.id}" ${limits.default_strategy === strategy.id ? "checked" : ""}>
        <span class="voice-strategy-copy"><strong>${strategy.name}</strong><span>${strategy.job}</span><q>${strategy.illustration}</q></span>
      </label>`)}</div>
      <label class="row voice-suggest-toggle"><input type="checkbox" id="suggest-other-strategy" ${limits.suggest_other_strategy !== false ? "checked" : ""}>Suggest another strategy when a story fits it better</label>
    </section>
    <section class="voice-sound stack" aria-labelledby="how-you-sound">
      <h2 id="how-you-sound">How you sound</h2>
      <div class="voice-controls">
        ${segmented("simple-tone", "Tone", ["diplomatic", "balanced", "firm"].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })), limits.default_tone || "balanced")}
        ${segmented("simple-length", "Length", LENGTHS, lengthPreset)}
        ${segmented("simple-emoji", "Emoji", EMOJI, emojiPreset)}
        ${segmented("simple-first-person", "First person", FIRST_PERSON, firstPersonPreset)}
      </div>
      <label class="field reading-label">Label for your own reading<input id="simple-reading-label" type="text" value="${limits.reading_label || "My reading"}"></label>
    </section>
    <section class="voice-never stack" aria-labelledby="never-posts">
      <h2 id="never-posts">Never in my posts</h2>
      <div id="banned-chips" class="banned-chips">${chipList(banned)}</div>
      <div class="row banned-add"><input id="banned-entry" type="text" aria-label="Add a banned word or phrase" placeholder="Add a word or phrase"><button type="button" class="btn" id="add-banned">Add</button></div>
      <details class="slop-status"><summary>AI-slop checks are on</summary><ul class="small">${(slopData.patterns || []).map((pattern) => html`<li>${pattern.name}</li>`)}</ul></details>
    </section>
    <section class="voice-summary stack" aria-label="Your voice in plain words">
      <div class="row between"><h2>Your voice in plain words</h2><a class="btn" href="#/brand-chat?author=${ctx.author}">${raw(icon("brand-chat"))} Talk through a change</a></div>
      ${description ? html`<p class="lead">${description}</p>` : html`<p class="muted">${text ? "Your full saved guide is below." : "No voice guide saved yet."}</p>`}
      ${rules.length ? html`<ul class="voice-rules">${rules.map((rule) => html`<li>${rule}</li>`)}</ul>` : ""}
    </section>
    <details class="voice-settings"><summary>Fine-tuning: every rule and limit</summary><div class="stack">${settings.html}</div></details>
    ${savebar()}`);

  const markDirty = () => { ctx.setDirty(true); $("#dirty", root).textContent = "Unsaved changes"; };
  const renderBanned = () => { $("#banned-chips", root).innerHTML = String(chipList(banned)); };
  const addBanned = () => {
    const input = $("#banned-entry", root);
    const value = input.value.trim();
    if (!value) return;
    const key = value.endsWith("?") ? "banned_endings" : /^\S+$/.test(value) ? "banned_words" : openerRegex.test(value) ? "banned_openers" : "banned_phrases";
    if (!banned[key].some((item) => item.toLowerCase() === value.toLowerCase())) banned[key].push(value);
    input.value = "";
    renderBanned();
    markDirty();
  };
  root.addEventListener("input", markDirty);
  root.addEventListener("change", markDirty);
  $("#add-banned", root).addEventListener("click", addBanned);
  $("#banned-entry", root).addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); addBanned(); }
  });
  $("#banned-chips", root).addEventListener("click", (event) => {
    const button = event.target.closest(".ban-remove");
    if (!button) return;
    banned[button.dataset.key].splice(Number(button.dataset.index), 1);
    renderBanned();
    markDirty();
  });
  $("#save", root).addEventListener("click", async (event) => {
    try {
      const selected = (name) => $(`input[name="${name}"]:checked`, root)?.value;
      const selectedLength = LENGTHS.find((preset) => preset.id === selected("simple-length"));
      const selectedEmoji = EMOJI.find((preset) => preset.id === selected("simple-emoji"));
      const selectedFirstPerson = FIRST_PERSON.find((preset) => preset.id === selected("simple-first-person"));
      const simple = {
        default_strategy: selected("default-strategy"),
        suggest_other_strategy: $("#suggest-other-strategy", root).checked,
        default_tone: selected("simple-tone") || limits.default_tone || "balanced",
        length: selectedLength ? { min: selectedLength.min, max: selectedLength.max, hard_max: selectedLength.hard_max }
          : { min: length.min ?? 1000, max: length.max ?? 2200, hard_max: length.hard_max ?? 2800 },
        emoji_min: selectedEmoji?.min ?? limits.emoji_min ?? 1,
        emoji_max: selectedEmoji?.max ?? limits.emoji_max ?? 2,
        first_person_max: selectedFirstPerson?.max ?? limits.first_person_max ?? 5,
        reading_label: $("#simple-reading-label", root).value.trim() || "My reading",
        ...Object.fromEntries(BAN_KEYS.map((key) => [key, banned[key]])),
      };
      const files = await settings.save(root, simple);
      if (!files.length) { ctx.setDirty(false); toast("No changes to save"); return; }
      await withSaving(event.currentTarget, () => ctx.data.save(files, `app: ${ctx.author} edits voice`), "Voice saved for future posts");
      ctx.setDirty(false);
      ctx.refresh();
    } catch (error) { toast(error.message, "bad"); }
  });
}