import { Injectable, Logger } from '@nestjs/common';
import { splitWaId } from './mcube-payload';
import { WA_LIMITS, type DeliveryResult, type OutboundMessage, type WaOption } from './whatsapp.types';

/**
 * The only file that talks to Mcube (rengage.mcube.com, a white-labelled
 * WhatsBox). Same endpoints, token and response rules as the CRM's
 * `chatbot/mcube.client.ts`, so both apps agree on what "sent" means.
 *
 * Two things carried over from the CRM that are easy to get wrong:
 *
 *  - MCUBE REPORTS META'S REJECTIONS AS SUCCESS. HTTP 200 `{"status":"success"}`
 *    with Meta's error nested in `message_id` and `message_wamid: null`. The only
 *    reliable success signal is a real wamid. A send without one is a failure,
 *    and no id is ever invented for it.
 *  - The number is sent split (`phone` + `country_code`), read from calling-code
 *    metadata, never guessed.
 *
 * ## Clickable options
 *
 * `WHATSAPP_INTERACTIVE_MODE` decides how buttons and lists travel:
 *
 *  - `text` (default): the options are written as a numbered list and the
 *    person replies with a number. Works on every Mcube plan today. The router
 *    maps "2" back to the option exactly as if it had been tapped.
 *  - `mcube`: real WhatsApp reply buttons. Verified live 2026-09-22:
 *    `sendmessage` with `buttons: [{ id, title }]` (up to 3) is stored by Mcube
 *    as Meta reply buttons and delivered. A `list` field is silently dropped,
 *    so the bot never sends lists (see `composeInteractive`).
 */
@Injectable()
export class McubeClient {
  private readonly logger = new Logger(McubeClient.name);

  private get baseUrl(): string {
    return (process.env.MCUBE_WHATSAPP_API_URL ?? 'https://rengage.mcube.com').replace(/\/+$/, '');
  }

  private get token(): string {
    return process.env.MCUBE_WHATSAPP_BEARER_TOKEN ?? '';
  }

  isConfigured(): boolean {
    return !!this.token && !this.token.startsWith('dummy');
  }

  interactiveMode(): 'text' | 'mcube' {
    return process.env.WHATSAPP_INTERACTIVE_MODE === 'mcube' ? 'mcube' : 'text';
  }

  /** Send one outbound message. Never throws for a provider refusal; throws on transport failure (unknown outcome). */
  async send(waId: string, message: OutboundMessage): Promise<DeliveryResult> {
    const number = splitWaId(waId);
    if (!number) return { ok: false, providerMessageId: null, error: 'unroutable_number', delivery: 'refused' };

    switch (message.kind) {
      case 'text':
        return this.post('/api/wpbox/sendmessage', { ...number, message: message.body });
      case 'buttons':
      case 'list':
        if (this.interactiveMode() === 'mcube' && message.kind === 'list') {
          return this.post('/api/wpbox/sendmessage', {
            ...number,
            type: 'interactive',
            interactive: {
              type: 'list',
              body: { text: message.body.slice(0, WA_LIMITS.text) },
              action: {
                button: message.button.slice(0, WA_LIMITS.listButton),
                sections: [
                  {
                    title: 'Options',
                    rows: message.options.slice(0, WA_LIMITS.listRows).map((o) => ({
                      id: o.id,
                      title: o.title.slice(0, WA_LIMITS.rowTitle),
                      ...(o.description ? { description: o.description.slice(0, WA_LIMITS.rowDescription) } : {}),
                    })),
                  },
                ],
              },
            },
          });
        }
        if (this.interactiveMode() === 'mcube' && message.kind === 'buttons') {
          return this.post('/api/wpbox/sendmessage', {
            ...number,
            message: message.body.slice(0, WA_LIMITS.interactiveBody),
            buttons: message.options.slice(0, WA_LIMITS.buttons).map((o) => ({ id: o.id, title: o.title.slice(0, WA_LIMITS.buttonTitle) })),
          });
        }
        return this.post('/api/wpbox/sendmessage', { ...number, message: renderOptionsAsText(message) });
      case 'image':
        // Verified 2026-09-22: type=image + url delivers the picture (JPEG/PNG only).
        return this.post('/api/wpbox/sendmessage', { ...number, type: 'image', url: message.url, ...(message.caption ? { message: message.caption } : {}) });
      case 'document':
        return this.post('/api/wpbox/sendmessage', {
          ...number,
          type: 'document',
          url: message.url,
          filename: message.filename,
          ...(message.caption ? { message: message.caption } : {}),
        });
      case 'template':
        return this.post('/api/wpbox/sendtemplatemessage', {
          ...number,
          template_name: message.name,
          template_language: message.language,
          components: [
            ...(message.bodyParams.length
              ? [{ type: 'body', parameters: message.bodyParams.map((text) => ({ type: 'text', text })) }]
              : []),
            // A copy-code (or any dynamic URL) button needs its own parameter,
            // or Meta rejects the message with #131008.
            ...(message.urlButtonParam
              ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: message.urlButtonParam }] }]
              : []),
          ],
        });
    }
  }

  /**
   * Chats with their messages embedded (see McubeInboxPoller). Without `phone`
   * Mcube returns only a handful of recent chats; with it, exactly that one.
   */
  async getConversations(phone?: string): Promise<any[]> {
    const query = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    const res = await fetch(`${this.baseUrl}/api/wpbox/getConversations${query}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`getConversations HTTP ${res.status}`);
    const json: any = await res.json();
    return Array.isArray(json?.conversations) ? json.conversations : [];
  }

  /** Approved templates, one per (name, language): the conversation opener, the follow-up ladder, the status page. */
  async listTemplates(): Promise<{ ok: boolean; error?: string; data: TemplateInfo[] }> {
    if (!this.isConfigured()) return { ok: false, error: 'not_configured', data: [] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.baseUrl}/api/wpbox/getTemplates`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data: [] };
      const raw: any[] = Array.isArray(json) ? json : (json?.data ?? json?.templates ?? []);
      const data = raw.map((t) => {
        let components: any[] = [];
        try {
          components = typeof t?.components === 'string' ? JSON.parse(t.components) : (t?.components ?? []);
        } catch {
          components = [];
        }
        const body = components.find((c: any) => String(c?.type).toUpperCase() === 'BODY')?.text ?? '';
        const header = components.find((c: any) => String(c?.type).toUpperCase() === 'HEADER');
        const buttons = components.find((c: any) => String(c?.type).toUpperCase() === 'BUTTONS')?.buttons ?? [];
        return {
          name: String(t?.name ?? ''),
          language: String(t?.language ?? 'en_US'),
          status: String(t?.status ?? '').toUpperCase(),
          category: String(t?.category ?? ''),
          body: String(body),
          bodyVariables: new Set([...String(body).matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size,
          headerFormat: header?.format ? String(header.format).toUpperCase() : null,
          quickReplies: buttons.filter((b: any) => String(b?.type).toUpperCase() === 'QUICK_REPLY').map((b: any) => String(b?.text ?? '')),
        };
      });
      // The account holds several copies of some templates.
      const seen = new Set<string>();
      const unique = data.filter((t) => {
        const key = `${t.name}:${t.language}`;
        if (t.status !== 'APPROVED' || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ok: true, data: unique };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? 'unreachable', data: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────

  private async post(path: string, body: unknown): Promise<DeliveryResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json: any = await res.json().catch(() => ({}));
      const complaint = McubeClient.providerError(json);
      const wamid = McubeClient.extractWamid(json);
      const ok = res.status >= 200 && res.status < 300 && !complaint && !!wamid;
      if (!ok) {
        this.logger.warn(`Mcube ${path} not sent: HTTP ${res.status} ${complaint ?? (wamid ? '' : 'no wamid in response')}`);
      }
      return {
        ok,
        providerMessageId: ok ? wamid : null,
        error: ok ? null : (complaint ?? (wamid ? `HTTP ${res.status}` : 'no_wamid')),
        delivery: ok ? undefined : res.status >= 400 && res.status < 500 ? 'refused' : 'unknown',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Mcube's own error, top level or nested under `message_id` (Meta's refusal). */
  private static providerError(json: any): string | null {
    const top = json?.error ?? (json?.status === 'error' ? (json?.message ?? 'unknown error') : null);
    if (top) return String(typeof top === 'object' ? JSON.stringify(top) : top).slice(0, 300);
    const nested = json?.message_id;
    if (nested && typeof nested === 'object' && (nested.message || nested.code)) {
      return String(nested.message ?? `Mcube error code ${nested.code}`).slice(0, 300);
    }
    return null;
  }

  /** Only a real `wamid.` counts. A bare `wa_<timestamp>` is a fabricated id, not a send. */
  private static extractWamid(json: any): string | null {
    const candidate =
      json?.message_wamid ?? json?.messages?.[0]?.id ?? json?.message_id?.messages?.[0]?.id ?? json?.wamid ?? null;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (typeof json?.message_id === 'string' && json.message_id.startsWith('wamid.')) return json.message_id;
    return null;
  }
}

export interface TemplateInfo {
  name: string;
  language: string;
  status: string;
  category: string;
  body: string;
  bodyVariables: number;
  headerFormat: string | null;
  quickReplies: string[];
}

/**
 * Options as a numbered list: the `text` mode rendering, and the readable body a
 * gateway that ignores the interactive part still delivers.
 */
export function renderOptionsAsText(message: { body: string; options: WaOption[]; footer?: string }): string {
  const lines = message.options.map((o, i) => `${i + 1}. ${o.title}`);
  return [message.body.trim(), lines.join('\n')]
    .filter(Boolean)
    .join('\n\n');
}
