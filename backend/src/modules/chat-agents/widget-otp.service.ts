import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import parsePhoneNumberFromString, { type CountryCode } from 'libphonenumber-js';
import { McubeClient } from '../whatsapp/mcube.client';

/**
 * Phone verification for the chat widget.
 *
 * The rules are the CRM's, copied deliberately so a number verified here means
 * the same thing as a number verified in the student portal
 * (`AcharyaUniversityCRM/src/modules/auth/otp.service.ts`):
 *
 *   - a 6-digit code, valid for 10 minutes
 *   - 3 wrong guesses and the code dies
 *   - 3 codes per number per hour
 *   - delivered on WhatsApp through the same approved AUTHENTICATION template
 *     the CRM uses (`student_crm_otp`), so nothing new needs approving
 *
 * In memory, like the CRM's: fine for one instance, and a restart costing
 * someone an unverified code is a re-send, not a lost lead. Move both to Redis
 * together when the API runs on more than one node.
 *
 * Nothing here decides who may ask: the widget controller does that from the
 * visitor token, so an OTP can only ever be sent inside a real conversation.
 */

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

interface RateRecord {
  count: number;
  windowStart: number;
}

/** What the caller needs to draw the code screen. */
export interface OtpRequestResult {
  ok: true;
  /** Where it went, for the "sent to your WhatsApp" line. */
  channel: 'whatsapp';
  /** Masked, so the widget can show it without echoing the whole number back. */
  sentTo: string;
  expiresInSeconds: number;
  /** Development only, when WIDGET_OTP_DEV_ECHO=true and nothing can be delivered. */
  devCode?: string;
}

@Injectable()
export class WidgetOtpService {
  private readonly logger = new Logger('WidgetOtp');
  private readonly store = new Map<string, OtpRecord>();
  private readonly rate = new Map<string, RateRecord>();

  private readonly TTL_MS = 10 * 60 * 1000;
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_REQUESTS = 3;
  private readonly RATE_WINDOW_MS = 60 * 60 * 1000;

  constructor(private readonly mcube: McubeClient) {}

  /**
   * E.164 with a leading plus, or null when the number cannot be a real one for
   * that country. `libphonenumber-js` holds Google's metadata, so "how many
   * digits does this country expect" is answered by the authority rather than
   * by a length guess. A bare Indian ten-digit number keeps working: the
   * widget always sends a dial code, and India is the fallback when it does not.
   */
  normalize(phone: string, country?: string): string | null {
    const raw = phone.trim();
    const parsed = raw.startsWith('+')
      ? parsePhoneNumberFromString(raw)
      : parsePhoneNumberFromString(raw, ((country || 'IN').toUpperCase() as CountryCode));
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number;
  }

  /** '+919148089847' → '+91 ***** 89847', so a screenshot never carries the whole number. */
  mask(e164: string): string {
    const parsed = parsePhoneNumberFromString(e164);
    const national = parsed?.nationalNumber ?? e164.replace(/\D/g, '');
    const tail = national.slice(-4);
    const cc = parsed ? `+${parsed.countryCallingCode}` : '';
    return `${cc} ${'•'.repeat(Math.max(national.length - 4, 0))}${tail}`.trim();
  }

  /**
   * `WHATSAPP_ALLOWED_NUMBERS`: comma-separated digits, or `*` for everyone,
   * read exactly as WhatsappSenderService reads it. Empty means nobody.
   */
  private allowed(e164: string): boolean {
    const raw = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '').trim();
    if (raw === '*') return true;
    const digits = e164.replace(/\D/g, '');
    return raw
      .split(',')
      .map((n) => n.replace(/\D/g, ''))
      .filter(Boolean)
      .includes(digits);
  }

  private checkRateLimit(key: string, max = this.MAX_REQUESTS): void {
    const now = Date.now();
    const record = this.rate.get(key);
    if (!record || now - record.windowStart > this.RATE_WINDOW_MS) {
      this.rate.set(key, { count: 1, windowStart: now });
      return;
    }
    if (record.count >= max) {
      throw new HttpException(
        { message: 'Too many codes requested for this number. Try again in an hour.', error: 'otp_rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    record.count++;
  }

  /**
   * How many numbers one conversation may try to verify in an hour. Three
   * codes each is the per-number cap; this stops a single visitor walking
   * through a list of other people's numbers.
   */
  private readonly MAX_PER_VISITOR = 5;

  /** Issue a code and send it. Throws when it cannot be delivered at all. */
  async request(e164: string, visitorId?: string): Promise<OtpRequestResult> {
    this.checkRateLimit(e164);
    if (visitorId) this.checkRateLimit(`visitor:${visitorId}`, this.MAX_PER_VISITOR);
    const code = process.env.WIDGET_OTP_BYPASS_CODE || String(Math.floor(100000 + Math.random() * 900000));
    this.store.set(e164, { code, expiresAt: Date.now() + this.TTL_MS, attempts: 0 });

    if (!this.allowed(e164)) {
      // The same guard the bot sends under: empty WHATSAPP_ALLOWED_NUMBERS means
      // nobody, so a development machine can never text a real applicant.
      this.logger.warn(`OTP for ${this.mask(e164)} blocked by WHATSAPP_ALLOWED_NUMBERS. Code: ${code}`);
      this.refund(e164, visitorId);
      if (process.env.WIDGET_OTP_DEV_ECHO === 'true') {
        return { ok: true, channel: 'whatsapp', sentTo: this.mask(e164), expiresInSeconds: this.TTL_MS / 1000, devCode: code };
      }
      this.store.delete(e164);
      throw new HttpException(
        { message: 'We cannot send a code to that number from this environment.', error: 'otp_not_allowed' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const template = process.env.WIDGET_OTP_TEMPLATE || 'student_crm_otp';
    const language = process.env.WIDGET_OTP_TEMPLATE_LANGUAGE || 'en';
    const sent = this.mcube.isConfigured()
      ? await this.mcube
          .send(e164.replace(/^\+/, ''), {
            kind: 'template',
            name: template,
            language,
            bodyParams: [code],
            // The approved AUTHENTICATION template carries a "copy code" button,
            // which takes the code again as its own parameter.
            urlButtonParam: code,
            body: '',
            quickReplies: [],
          })
          .then((r) => r.ok)
          .catch((err) => {
            this.logger.warn(`OTP send to ${this.mask(e164)} failed: ${(err as Error)?.message}`);
            return false;
          })
      : false;

    if (!sent) {
      // Without WhatsApp there is no way to prove the number. Say so plainly
      // rather than pretending a code is on its way; in development the code is
      // logged (and echoed when asked) so the flow stays testable.
      this.logger.warn(`OTP for ${this.mask(e164)} could not be sent (template "${template}"). Code: ${code}`);
      this.refund(e164, visitorId);
      if (process.env.WIDGET_OTP_DEV_ECHO === 'true') {
        return { ok: true, channel: 'whatsapp', sentTo: this.mask(e164), expiresInSeconds: this.TTL_MS / 1000, devCode: code };
      }
      this.store.delete(e164);
      throw new HttpException(
        { message: 'We could not send a code to that number just now. Try again, or leave it with a counsellor.', error: 'otp_send_failed' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(`OTP sent to ${this.mask(e164)} via ${template}.`);
    return { ok: true, channel: 'whatsapp', sentTo: this.mask(e164), expiresInSeconds: this.TTL_MS / 1000 };
  }

  /** A code nobody could receive was not an attempt: give the allowance back. */
  private refund(e164: string, visitorId?: string) {
    for (const key of [e164, ...(visitorId ? [`visitor:${visitorId}`] : [])]) {
      const record = this.rate.get(key);
      if (record && record.count > 0) record.count--;
    }
  }

  /** Consume a code. Throws with the reason when it does not check out. */
  verify(e164: string, code: string): void {
    const record = this.store.get(e164);
    if (!record) throw new UnauthorizedException({ message: 'That code has expired. Ask for a new one.', error: 'otp_not_found' });

    if (Date.now() > record.expiresAt) {
      this.store.delete(e164);
      throw new UnauthorizedException({ message: 'That code has expired. Ask for a new one.', error: 'otp_expired' });
    }

    record.attempts++;
    if (record.attempts > this.MAX_ATTEMPTS) {
      this.store.delete(e164);
      throw new UnauthorizedException({ message: 'Too many wrong tries. Ask for a new code.', error: 'otp_attempts' });
    }

    if (record.code !== code.trim()) {
      throw new UnauthorizedException({ message: 'That code is not right.', error: 'otp_invalid' });
    }

    this.store.delete(e164);
    this.rate.delete(e164);
  }
}
