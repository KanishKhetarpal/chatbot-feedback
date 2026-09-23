import { MEDIA_LIBRARY } from '../chat-agents/media-library';

/**
 * What the bot can attach on WhatsApp. Verified on a phone 2026-09-22: Mcube's
 * sendmessage with `type: image | document` and a public `url` delivers the
 * file. WhatsApp shows JPEG and PNG images only, so the web library's .webp
 * photos are left out rather than sent broken.
 */
export const WA_PHOTOS = Object.fromEntries(
  Object.entries(MEDIA_LIBRARY).filter(([, m]) => /\.(jpe?g|png)(\?|$)/i.test(m.url)),
);

export const WA_DOCUMENTS: Record<string, { url: string; filename: string; label: string; use: string }> = {
  brochure: {
    url: 'https://www.acharya.ac.in/files/brochure/Domestic-Brochure.pdf',
    filename: 'Acharya-Brochure.pdf',
    label: 'the Acharya brochure',
    use: 'anyone in India who wants programmes, campus and admission details in one place',
  },
  international_brochure: {
    url: 'https://www.acharya.ac.in/files/brochure/International-Brochure.pdf',
    filename: 'Acharya-International-Brochure.pdf',
    label: 'the international brochure',
    use: 'NRI and international students',
  },
};

export function waPhotoCatalogue(): string {
  return Object.entries(WA_PHOTOS)
    .map(([k, m]) => `  ${k}: ${m.caption} (for: ${m.topics})`)
    .join('\n');
}

export function waDocumentCatalogue(): string {
  return Object.entries(WA_DOCUMENTS)
    .map(([k, d]) => `  ${k}: ${d.label} (for: ${d.use})`)
    .join('\n');
}
