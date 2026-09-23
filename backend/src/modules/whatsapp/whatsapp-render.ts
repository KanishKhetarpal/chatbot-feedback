import { cleanVisible, stripFillerOpener } from '../chat-agents/ui-block.util';
import { WA_DOCUMENTS, WA_PHOTOS } from './whatsapp-media';
import { extractFactsTag, type ExtractedFacts } from '../chat-agents/lead-extract.util';
import { WA_LIMITS, type OutboundMessage, type WaOption } from './whatsapp.types';

/**
 * A model reply → what goes to the phone.
 *
 * The model writes plain WhatsApp text plus three tags (see WHATSAPP_CHANNEL):
 * `<next>` options, `<media>` photo keys, `<handoff reason=…/>`, and the hidden
 * `<visitor-facts/>`. This file validates them against WhatsApp's hard limits and
 * picks the shape: up to three short options become reply buttons, more become
 * a list. Nothing the model writes can produce an over-limit message.
 */

export const HANDOFF_REASONS = ['fees', 'out_of_scope', 'asked_for_human', 'complaint', 'visit', 'callback', 'department'] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export interface WhatsappReply {
  text: string;
  options: string[];
  media: Array<{ url: string; caption: string }>;
  documents: Array<{ url: string; filename: string; label: string }>;
  handoff: HandoffReason | null;
  /** The office for a department or complaint hand-off (whatsapp-departments.ts keys). */
  dept: string | null;
  facts: ExtractedFacts;
  styleNote: string | null;
}

const tagRe = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');

const MAX_WORDS = 40;

/**
 * The owner: "don't make paras out of messages". Every sentence goes on its own
 * line, and a reply over MAX_WORDS keeps its first sentences plus its closing
 * question, dropping the middle. Bullet lines are left as they are.
 */
export function reflowShort(text: string): string {
  const lines: string[] = [];
  for (const block of text.split(/\n+/)) {
    const t = block.trim();
    if (!t) continue;
    if (/^•/.test(t)) {
      lines.push(t);
      continue;
    }
    // Split after . ! ? ; followed by a space and a capital or a digit (not "B.E. CSE", "Rs. 2,500").
    // A full stop only ends a sentence after a lowercase word of 3+ letters, a digit or a bracket,
    // so "B.E. CSE", "Rs. 2,500" and "Dr. Rao" stay whole; ! and ? always end one.
    const parts = t
      .split(/(?<=[!?]|(?:\b[a-z][a-z%]{2,}|\d|\))[.;])\s+(?=[A-Z0-9*])/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) lines.push(p.replace(/;$/, '.'));
  }
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  if (lines.reduce((n, l) => n + words(l), 0) <= MAX_WORDS) return lines.join('\n');

  const question = [...lines].reverse().find((l) => /\?\s*$/.test(l)) ?? null;
  const kept: string[] = [];
  let budget = MAX_WORDS - (question ? words(question) : 0);
  for (const l of lines) {
    if (l === question) continue;
    if (words(l) > budget) break;
    kept.push(l);
    budget -= words(l);
  }
  if (!kept.length) kept.push(lines.find((l) => l !== question) ?? '');
  return [...kept, ...(question ? [question] : [])].filter(Boolean).join('\n');
}

/** Markdown the model may slip into, turned into WhatsApp's own formatting. */
function toWhatsappFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([a-z]+)\]\s*/g, '');
}

/** The model sometimes writes HTML entities ("AI &amp; ML"); WhatsApp shows them raw. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** A button that only asks them to type ("Share my rank", "Enter marks") does nothing when tapped. */
const TYPING_OPTION = /^(share|enter|type|send|give|tell)\b|\b(my (rank|marks|score|name|city))\b|\b(rank|marks|score|percentage|percent)$/i;

export function parseWhatsappReply(raw: string): WhatsappReply {
  const { text: factFree, facts } = extractFactsTag(decodeEntities(raw));
  let options: string[] = [];
  let media: WhatsappReply['media'] = [];
  let documents: WhatsappReply['documents'] = [];
  let handoff: HandoffReason | null = null;
  let dept: string | null = null;
  let styleNote: string | null = null;

  let text = factFree
    .replace(tagRe('next'), (_m, body: string) => {
      try {
        const parsed = JSON.parse(body.trim());
        if (Array.isArray(parsed)) {
          options = [...new Set(parsed.filter((o) => typeof o === 'string').map((o: string) => cleanVisible(o).trim()).filter(Boolean))]
            .filter((o) => !TYPING_OPTION.test(o))
            .slice(0, WA_LIMITS.listRows);
        }
      } catch {
        /* no options this turn */
      }
      return '';
    })
    .replace(tagRe('media'), (_m, body: string) => {
      try {
        const keys = JSON.parse(body.trim());
        if (Array.isArray(keys)) {
          media = keys
            .map((k) => (typeof k === 'string' ? WA_PHOTOS[k.trim()] : undefined))
            .filter((m): m is (typeof WA_PHOTOS)[string] => Boolean(m))
            .slice(0, 1)
            .map((m) => ({ url: m.url, caption: m.caption }));
        }
      } catch {
        /* no photo */
      }
      return '';
    })
    .replace(tagRe('doc'), (_m, body: string) => {
      try {
        const keys = JSON.parse(body.trim());
        if (Array.isArray(keys)) {
          documents = keys
            .map((k) => (typeof k === 'string' ? WA_DOCUMENTS[k.trim()] : undefined))
            .filter((d): d is (typeof WA_DOCUMENTS)[string] => Boolean(d))
            .slice(0, 1)
            .map((d) => ({ url: d.url, filename: d.filename, label: d.label }));
        }
      } catch {
        /* no document */
      }
      return '';
    })
    .replace(tagRe('style-note'), (_m, body: string) => {
      styleNote = body.trim().slice(0, 500) || null;
      return '';
    })
    .replace(/<handoff\b([^>]*?)\/?>(?:\s*<\/handoff>)?/gi, (_m, attrs: string) => {
      const reason = attrs.match(/reason\s*=\s*"([a-z_]+)"/i)?.[1] ?? 'out_of_scope';
      handoff = (HANDOFF_REASONS as readonly string[]).includes(reason) ? (reason as HandoffReason) : 'out_of_scope';
      dept = attrs.match(/dept\s*=\s*"([a-z_]+)"/i)?.[1] ?? null;
      return '';
    })
    // Tags the web widget knows and WhatsApp cannot show: never leak their JSON.
    .replace(/<(ui|plan)>[\s\S]*?(<\/\1>|$)/gi, '')
    .replace(/<\/?then>/gi, '\n\n')
    // An unterminated tag from a cut-off reply.
    .replace(/<(next|media|doc|handoff|visitor-facts|style-note)\b[\s\S]*$/i, '');

  text = reflowShort(stripFillerOpener(toWhatsappFormatting(cleanVisible(text)).replace(/\n{3,}/g, '\n\n').trim()));
  if (handoff || styleNote) options = [];
  return { text, options, media, documents, handoff, dept, facts, styleNote };
}

/**
 * Options for a reply: ids `ai:<n>` so a tap resolves to exactly what was shown.
 *
 * Titles over WhatsApp's 20 characters are DROPPED, not cut: a chopped label
 * ("Elsewhere in Karnat…", or the model's own squeeze "Other Karnataka") reads
 * as nonsense on a button. If that leaves fewer than two, the reply goes out
 * with no buttons at all, which is fine: they can type.
 */
export function aiOptions(titles: string[]): WaOption[] {
  const fitting = titles.filter((t) => t.trim().length <= WA_LIMITS.buttonTitle);
  const kept = fitting.length >= 2 ? fitting : [];
  return kept.map((title, i) => ({ id: `ai:${i + 1}`, title: title.trim() }));
}

/** A button title within WhatsApp's 20 characters, cut at a word where possible. */
export function buttonTitle(title: string): string {
  const t = title.trim();
  if (t.length <= WA_LIMITS.buttonTitle) return t;
  const cut = t.slice(0, WA_LIMITS.buttonTitle);
  const space = cut.lastIndexOf(' ');
  return (space > 8 ? cut.slice(0, space) : cut).replace(/[\s,.;:&/-]+$/, '');
}

export const MORE_TITLE = 'More options';

/**
 * Text plus options → one WhatsApp message with reply buttons.
 *
 * Mcube delivers real reply buttons (at most 3, 20 characters each) but no
 * list messages, so a longer set shows two options plus "More options", which
 * reveals the next ones in place. A body over the interactive limit goes first
 * as its own text message.
 */
export function composeInteractive(body: string, options: WaOption[], listButton = 'See options'): OutboundMessage[] {
  const out: OutboundMessage[] = [];
  let text = body.trim();
  if (!options.length) return text ? [{ kind: 'text', body: text.slice(0, WA_LIMITS.text) }] : [];

  if (text.length > WA_LIMITS.interactiveBody) {
    out.push({ kind: 'text', body: text.slice(0, WA_LIMITS.text) });
    text = 'Pick one:';
  }
  // More than three: a real list menu, verified through Mcube's type=interactive (2026-09-22).
  if (options.length > WA_LIMITS.buttons && process.env.WHATSAPP_INTERACTIVE_MODE === 'mcube') {
    out.push({
      kind: 'list',
      body: text || 'Pick one:',
      button: listButton,
      options: options.slice(0, WA_LIMITS.listRows).map((o) => ({
        ...o,
        title: o.title.length > WA_LIMITS.rowTitle ? `${o.title.slice(0, WA_LIMITS.rowTitle - 1).trimEnd()}…` : o.title,
      })),
    });
    return out;
  }
  const fitted = options.map((o) => ({ ...o, title: buttonTitle(o.title) }));
  const shown =
    fitted.length <= WA_LIMITS.buttons
      ? fitted
      : [...fitted.slice(0, 2), { id: `more:${fitted[2].id}`, title: MORE_TITLE, rest: fitted.slice(2) }];
  out.push({ kind: 'buttons', body: text || 'Pick one:', options: shown });
  return out;
}

/** The stored transcript form, readable in the review inbox (options as `<next>` chips). */
export function transcriptOf(messages: OutboundMessage[]): string {
  const parts: string[] = [];
  const chips: string[] = [];
  for (const m of messages) {
    if (m.kind === 'text') parts.push(m.body);
    else if (m.kind === 'buttons' || m.kind === 'list') {
      parts.push(m.body);
      chips.push(...m.options.map((o) => o.title));
    } else if (m.kind === 'template') {
      parts.push(m.body);
      chips.push(...(m.quickReplies ?? []));
    } else if (m.kind === 'image') parts.push(`[photo] ${m.caption ?? ''}`.trim());
    else if (m.kind === 'document') parts.push(`[document] ${m.filename}`);
  }
  let out = parts.filter(Boolean).join('\n\n');
  if (chips.length) out += `\n\n<next>${JSON.stringify(chips)}</next>`;
  return out;
}

/** The options a message offers, for resolving the next tap or number. */
export function optionsOf(messages: OutboundMessage[]): WaOption[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === 'buttons' || m.kind === 'list') return m.options;
  }
  return [];
}
