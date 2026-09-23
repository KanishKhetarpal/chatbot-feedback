/**
 * Who handles what, for everything that is not an admissions sale.
 *
 * The WhatsApp number is Acharya's front door, so current students, parents,
 * alumni and recruiters write to it too. When a question needs a person, the bot
 * names the right office with its real contact and offers to pass the message
 * on. Every contact here is copied from the knowledge base
 * (`prisma/sales-bots/knowledge/acharya.md`, section 8 and 7.x); nothing is
 * invented. Offices the knowledge does not list (exam cell, accounts) go to
 * student affairs and the general line, which is what the website does.
 */

export interface Department {
  key: string;
  label: string;
  /** Shown to the person. Only published contacts. */
  contact: string;
  /** What lands here, for the model. */
  handles: string;
}

export const DEPARTMENTS: Department[] = [
  {
    key: 'admissions',
    label: 'Admissions team',
    contact: '+91 74066-44449 · admissions@acharya.ac.in',
    handles: 'new admissions, fees for a programme and quota, application help, offer letters, admission documents',
  },
  {
    key: 'international',
    label: 'International office',
    contact: '+91 97317-00408 · international@acharya.ac.in',
    handles: 'NRI, OCI and foreign students, visas, airport pickup',
  },
  {
    key: 'scholarships',
    label: 'Scholarship committee',
    contact: 'scholarship@acharya.ac.in',
    handles: 'scholarship applications and decisions after admission',
  },
  {
    key: 'hostel',
    label: 'Hostel office',
    contact: '+91 99805-98813 · hostelmanager@acharya.ac.in (women\'s 24/7 helpline +91 98808-50112)',
    handles: 'rooms, allotment, mess, hostel complaints, hostel fees for current residents',
  },
  {
    key: 'transport',
    label: 'Transport office',
    contact: 'transport@acharya.ac.in',
    handles: 'college buses, routes, stops, bus passes, route requests',
  },
  {
    key: 'placements',
    label: 'Placement cell',
    contact: 'placements@acharya.ac.in',
    handles: 'campus drives, internships, recruiters who want to hire, placement records',
  },
  {
    key: 'student_affairs',
    label: 'Student affairs office',
    contact: '+91 80225-55555 · info@acharya.ac.in',
    handles:
      'current students and their parents: exams, results, timetables, attendance, certificates (bonafide, transfer, migration), ID cards, fee payments and receipts, grievances, anything else on campus',
  },
  {
    key: 'alumni',
    label: 'Alumni office',
    contact: 'alumni@acharya.ac.in',
    handles: 'alumni, transcripts for alumni, reunions, alumni verification',
  },
  {
    key: 'global_mba',
    label: 'Global MBA team',
    contact: '+91 74066-00016 · globalmba@acharya.ac.in',
    handles: 'the Global MBA (Spain) programme',
  },
];

export function department(key: string | null | undefined): Department {
  return DEPARTMENTS.find((d) => d.key === key) ?? DEPARTMENTS.find((d) => d.key === 'student_affairs')!;
}

/** For the prompt: the directory the model routes with. */
export function departmentCatalogue(): string {
  return DEPARTMENTS.map((d) => `  ${d.key}: ${d.label}, for ${d.handles}`).join('\n');
}

/** Who is chatting. Set from their first taps or learned by the model. */
export const AUDIENCES = ['prospective', 'student', 'student_parent', 'alumni', 'recruiter', 'other'] as const;
export type Audience = (typeof AUDIENCES)[number];
