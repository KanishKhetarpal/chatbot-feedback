import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

/** What the CRM already knows about a number, so Tara never asks for it again. */
export interface CrmLead {
  leadId: string;
  name: string | null;
  status: string | null;
  course: string | null;
  city: string | null;
  counsellor: string | null;
}

/**
 * Their application in the CRM, and where its fee stands.
 *
 * This is the only place an application-fee figure may come from: it is the
 * amount the CRM holds for THIS person's application. When the CRM has no
 * figure, `feePayable` is null and the bot says a counsellor confirms it,
 * exactly as it does for tuition fees.
 */
export interface CrmApplication {
  applicationId: string;
  /** Application_Initiated | Application_Submitted | AUID_Created | Offer_Created_Not_Sent … */
  status: string | null;
  applicationNumber: string | null;
  /** How much of the form is filled, 0 to 100. */
  completionPercent: number | null;
  programme: string | null;
  feeAmount: number | null;
  feeDiscountPercent: number | null;
  /** What they would actually pay, after the discount the CRM holds. */
  feePayable: number | null;
  /** completed | pending | failed | null when no payment has been started. */
  feeStatus: string | null;
  feePaidAt: Date | null;
  submittedAt: Date | null;
}

/**
 * Looks a WhatsApp number up in the Acharya CRM.
 *
 * Two ways in, first configured wins:
 *
 *  - `CRM_LEAD_LOOKUP_URL` (production): `GET {url}?mobile=<E.164 digits>` on the
 *    CRM's API with `x-api-key: CRM_LEAD_LOOKUP_KEY`, answering the CrmLead shape.
 *    Not built on the CRM side yet (see docs/whatsapp-phase-2.md).
 *  - `CRM_DATABASE_URL` (local dev): a read-only query against the CRM's own
 *    Postgres. Leads are matched on `mobileE164` (digits, no plus) or the bare
 *    ten-digit `mobile`, oldest lead first, which is the CRM's own dedupe rule.
 *
 * Never throws: a lookup that fails just means Tara asks, as before.
 */
@Injectable()
export class CrmLeadLookupService implements OnApplicationShutdown {
  private readonly logger = new Logger(CrmLeadLookupService.name);
  private pool: Pool | null = null;

  isConfigured(): boolean {
    return !!(process.env.CRM_LEAD_LOOKUP_URL || process.env.CRM_DATABASE_URL);
  }

  async findByWaId(waId: string): Promise<CrmLead | null> {
    try {
      if (process.env.CRM_LEAD_LOOKUP_URL) return await this.viaApi(waId);
      if (process.env.CRM_DATABASE_URL) return await this.viaDatabase(waId);
    } catch (err) {
      this.logger.warn(`CRM lookup for ${waId} failed: ${(err as Error)?.message}`);
    }
    return null;
  }

  /**
   * The lead's newest application and the state of its application fee.
   *
   * Read-only, and never fatal: without it the bot simply talks about applying
   * without naming a figure. Only the database route can answer this; the CRM's
   * HTTP lookup does not expose applications yet (see docs/whatsapp-phase-2.md).
   */
  async applicationForLead(leadId: string): Promise<CrmApplication | null> {
    if (!process.env.CRM_DATABASE_URL) return null;
    try {
      this.pool ??= new Pool({ connectionString: process.env.CRM_DATABASE_URL, max: 2, statement_timeout: 4000 });
      const { rows } = await this.pool.query(
        `SELECT a.id, a.status::text AS status, a."applicationNumber", a."completionPercent", a."submittedAt",
                a."applicationFeeOriginal"::float8 AS fee, a."applicationFeeDiscount"::float8 AS discount,
                COALESCE(NULLIF(a."specializationName", ''), NULLIF(a."programName", '')) AS programme,
                p."paymentStatus"::text AS fee_status, p."paidAt" AS fee_paid_at
           FROM applications a
           LEFT JOIN LATERAL (
                SELECT "paymentStatus", "paidAt" FROM payments
                 WHERE "applicationId" = a.id AND "paymentType" = 'application_fee'
                 ORDER BY ("paymentStatus"::text = 'completed') DESC, "createdAt" DESC
                 LIMIT 1
           ) p ON true
          WHERE a."leadId" = $1
          ORDER BY a."createdAt" DESC
          LIMIT 1`,
        [leadId],
      );
      const r = rows[0];
      if (!r) return null;
      const fee = typeof r.fee === 'number' ? r.fee : null;
      const discount = typeof r.discount === 'number' ? r.discount : null;
      return {
        applicationId: r.id,
        status: r.status ?? null,
        applicationNumber: r.applicationNumber ?? null,
        completionPercent: typeof r.completionPercent === 'number' ? r.completionPercent : null,
        programme: r.programme ?? null,
        feeAmount: fee,
        feeDiscountPercent: discount,
        // The CRM stores the discount as a percentage of the fee.
        feePayable: fee === null ? null : Math.round(fee * (1 - (discount ?? 0) / 100)),
        feeStatus: r.fee_status ?? null,
        feePaidAt: r.fee_paid_at ?? null,
        submittedAt: r.submittedAt ?? null,
      };
    } catch (err) {
      this.logger.warn(`CRM application lookup for lead ${leadId} failed: ${(err as Error)?.message}`);
      return null;
    }
  }

  /** Every status the CRM uses, with how many leads are in each (for the rule editor). */
  async statuses(): Promise<Array<{ status: string; leads: number }>> {
    try {
      if (process.env.CRM_DATABASE_URL) {
        this.pool ??= new Pool({ connectionString: process.env.CRM_DATABASE_URL, max: 2, statement_timeout: 4000 });
        const { rows } = await this.pool.query(`SELECT status, count(*)::int AS leads FROM leads WHERE status IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
        return rows.map((r) => ({ status: String(r.status), leads: Number(r.leads) }));
      }
    } catch (err) {
      this.logger.warn(`CRM statuses unavailable: ${(err as Error)?.message}`);
    }
    return [];
  }

  private async viaApi(waId: string): Promise<CrmLead | null> {
    const url = `${process.env.CRM_LEAD_LOOKUP_URL}?mobile=${encodeURIComponent(waId)}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': process.env.CRM_LEAD_LOOKUP_KEY ?? '', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CrmLead;
  }

  private async viaDatabase(waId: string): Promise<CrmLead | null> {
    this.pool ??= new Pool({ connectionString: process.env.CRM_DATABASE_URL, max: 2, statement_timeout: 4000 });
    const national = waId.slice(-10);
    const { rows } = await this.pool.query(
      `SELECT l.id, l.name, l.status, l.city,
              COALESCE(NULLIF(l."courseSpecializationName", ''), NULLIF(l."courseProgramName", ''), NULLIF(l."courseInterest", '')) AS course,
              COALESCE(
                (SELECT u.username FROM lead_assignments a JOIN users u ON u.id = a."counsellorId"
                  WHERE a."leadId" = l.id AND a."isActive" ORDER BY a."assignedAt" DESC LIMIT 1),
                NULLIF(l."lsOwnerName", '')
              ) AS counsellor
         FROM leads l
        WHERE l."mobileE164" = $1 OR l."mobileE164" = $2 OR l.mobile = $3
        ORDER BY l."createdAt" ASC
        LIMIT 1`,
      [waId, `+${waId}`, national],
    );
    const r = rows[0];
    if (!r) return null;
    return { leadId: r.id, name: r.name, status: r.status, course: r.course, city: r.city, counsellor: r.counsellor };
  }

  async onApplicationShutdown() {
    await this.pool?.end().catch(() => undefined);
  }
}
