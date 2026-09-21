/**
 * Photos a bot may show, by key.
 *
 * The model never writes an image URL. It names keys from this list in a
 * `<media>["hostel_room","hostel_mess"]</media>` tag; the server swaps each key
 * for its URL and caption and drops anything unknown. That keeps every picture
 * a real, checked photo of Acharya's campus (all hosted on acharya.ac.in and
 * each one looked at before it went in this list), and makes a hallucinated
 * or off-topic image impossible.
 */

export interface MediaItem {
  url: string;
  caption: string;
  /** When the bot should reach for it — shown to the model. */
  topics: string;
}

const WWW = 'https://www.acharya.ac.in';
const MOBILE = 'https://www.m.acharya.ac.in';

export const MEDIA_LIBRARY: Record<string, MediaItem> = {
  campus: { url: `${WWW}/about/img/banner/infrastructure.webp`, caption: 'The 120-acre campus at Soladevanahalli', topics: 'campus, overview, location, infrastructure' },
  hostel_room_boys: { url: `${WWW}/about/img/infrastructure/hostel.webp`, caption: "A shared room in a boys' residence", topics: "hostel rooms, boys' hostel, room sharing" },
  hostel_room_girls: { url: `${MOBILE}/life@acharya/img/hostel/hostel4.webp`, caption: "A shared room in a girls' residence", topics: "hostel rooms, girls' hostel, safety for daughters" },
  hostel_mess: { url: `${MOBILE}/life@acharya/img/hostel/hostel3.webp`, caption: 'Lunch at the hostel mess', topics: 'food, mess, meals, veg / non-veg' },
  hostel_kitchen: { url: `${MOBILE}/life@acharya/img/hostel/hostel5.webp`, caption: 'The mess kitchen', topics: 'food hygiene, kitchen, mess' },
  hostel_laundry: { url: `${MOBILE}/life@acharya/img/hostel/hostel2.webp`, caption: 'Hostel laundry', topics: 'hostel facilities, laundry, daily life' },
  library: { url: `${WWW}/about/img/infrastructure/library.webp`, caption: 'The central library (36,000 sq ft)', topics: 'library, studies, academics' },
  lab: { url: `${WWW}/about/img/infrastructure/lab.webp`, caption: 'A pharmacy lab', topics: 'labs, pharmacy, science, practicals' },
  security: { url: `${WWW}/about/img/infrastructure/security.webp`, caption: 'Campus security, on duty 24/7', topics: 'safety, security, parents' },
  sports: { url: `${WWW}/life@acharya/img/achievement/Athletes/1.webp`, caption: 'An Acharya team with its trophy', topics: 'sports, teams, stadium, achievements' },
  culture: { url: `${WWW}/life@acharya/img/achievement/Nuditaranga/1.webp`, caption: 'Nuditaranga, the Karnataka heritage week', topics: 'fests, culture, clubs, events, Acharya Habba' },
  placements: { url: `${MOBILE}/about/img/events/ABB.webp`, caption: 'Students placed with ABB', topics: 'placements, recruiters, jobs, packages' },
  engineering: { url: `${WWW}/img/10institutes/ait.jpg`, caption: 'Acharya Institute of Technology (B.E., MBA, MCA)', topics: 'engineering, B.E., CSE, AI&ML, MCA' },
  graduate_studies: { url: `${WWW}/img/10institutes/aigs.jpg`, caption: 'Acharya Institute of Graduate Studies', topics: 'BBA, BCA, B.Com, B.A., B.Sc, MBA (BCU)' },
  pharmacy: { url: `${WWW}/img/10institutes/pharmacy.jpg`, caption: 'Acharya & BM Reddy College of Pharmacy', topics: 'B.Pharm, Pharm.D, D.Pharm, M.Pharm' },
  architecture: { url: `${WWW}/img/10institutes/nrv.jpg`, caption: "Acharya's NRV School of Architecture", topics: 'B.Arch, architecture, NATA' },
  design: { url: `${WWW}/img/10institutes/asd.jpg`, caption: 'Acharya School of Design', topics: 'design, BVA, fashion' },
  nursing: { url: `${WWW}/img/10institutes/sncn.jpg`, caption: 'Smt. Nagarathnamma College of Nursing', topics: 'nursing, B.Sc Nursing, GNM' },
  physiotherapy: { url: `${WWW}/img/10institutes/physiotherapy.jpg`, caption: "Acharya's NR Institute of Physiotherapy", topics: 'BPT, MPT, physiotherapy' },
  allied_health: { url: `${WWW}/img/10institutes/aiahs.jpg`, caption: 'Acharya Institute of Allied Health Sciences', topics: 'allied health, OT technology, dialysis, imaging, optometry' },
  polytechnic: { url: `${WWW}/img/10institutes/polytechnic.jpg`, caption: 'Acharya Polytechnic', topics: 'diploma, polytechnic, DCET' },
};

export const MEDIA_KEYS = Object.keys(MEDIA_LIBRARY);

/** The list the model sees: one key per line with what it shows and when to use it. */
export function mediaCatalogue(): string {
  return MEDIA_KEYS.map((k) => `  ${k} — ${MEDIA_LIBRARY[k].caption} (use for: ${MEDIA_LIBRARY[k].topics})`).join('\n');
}

/** Sites a bot may link to from a card button. */
export const LINK_HOSTS = ['acharya.ac.in', 'www.acharya.ac.in', 'm.acharya.ac.in', 'www.m.acharya.ac.in', 'admissions.acharya.global'];

export function isAllowedLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LINK_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}
