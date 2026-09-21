---
{
  "language": "auto",
  "knowledgeMode": "blended",
  "restrictedTopics": [],
  "handoffTriggers": [
    "complaint",
    "ragging",
    "refund",
    "legal"
  ],
  "handoffMessage": "That one needs the admissions office directly. Write to admissions@acharya.ac.in or call +91 74066-44449.",
  "leadCapture": "never",
  "leadFields": [
    "phone",
    "name"
  ],
  "qualificationEnabled": true,
  "useEmoji": false,
  "model": "claude-sonnet-5",
  "effort": "medium",
  "responseLength": "concise",
  "status": "active",
  "tone": "friendly",
  "messagePresets": [],
  "name": "Riya · Tap-to-answer (no AI)",
  "description": "PURE IF/ELSE. No AI is ever called: every answer is a scripted branch, reworded at random so it doesn't feel canned. No dead ends: every answer offers related topics and 'Something else'; leaves return to the menu. Numbers come two ways: the visitor chooses WhatsApp, call, video or a visit, or after 2 to 4 answered taps a WhatsApp or call form appears (skippable, at most 3 times).",
  "heading": "Quick answers, instantly",
  "subheading": "Tap a topic. No typing needed.",
  "greeting": "Hi, I'm Riya from Acharya admissions. Tap a topic for an instant answer.\n~~~\nHi, Riya here. Everything about Acharya admissions, one tap away. Where shall we start?\n~~~\nHello! I'm Riya. Pick a topic below and I'll answer straight away.",
  "inputPlaceholder": "Tap an option above",
  "maxTokens": 400,
  "theme": {
    "primary": "#ea580c",
    "primaryText": "#ffffff",
    "corners": "rounded",
    "background": "#ffffff",
    "backgroundText": "#111827",
    "muted": "#f3f4f6",
    "mutedText": "#6b7280",
    "border": "#e5e7eb"
  },
  "guidedFlow": {
    "rootIds": [
      "courses",
      "elig",
      "fees",
      "schol",
      "hostel",
      "place",
      "apply",
      "talk"
    ],
    "escapeToAiLabel": "Type my own question",
    "escapeToHumanLabel": "Talk to a person",
    "noAi": true,
    "capture": {
      "afterMin": 2,
      "afterMax": 4,
      "repeatEvery": 3,
      "maxTimes": 3,
      "gateAfter": 6,
      "gatePrompt": "To see more, share your name and number: a counsellor sends the exact details for your course on WhatsApp.\n\n<ui>{\"type\":\"form\",\"local\":true,\"gate\":true,\"icon\":\"whatsapp\",\"title\":\"Your details to continue\",\"subtitle\":\"Fee for your quota, eligibility and scholarships, on WhatsApp.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Continue\",\"note\":\"Used only by Acharya admissions for your enquiry. Say stop anytime.\",\"done\":\"Done, {name}. Admissions will WhatsApp you from +91 97317-97677, usually within a few hours. Anything else you'd like to check meanwhile?\"}</ui>",
      "prompts": [
        "Want all of this on WhatsApp so you have it later?\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"whatsapp\",\"title\":\"Save this on WhatsApp\",\"subtitle\":\"What you just read, plus the fee for your course.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it on WhatsApp\",\"skip\":\"Not now, keep exploring\",\"note\":\"Used only by Acharya admissions for your enquiry. Say stop anytime.\",\"done\":\"Done, {name}. Admissions will WhatsApp you from +91 97317-97677, usually within a few hours. Anything else you'd like to check meanwhile?\"}</ui>",
        "A counsellor can answer everything else in one short call, at a time you pick.\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"phone\",\"title\":\"Quick call with a counsellor\",\"subtitle\":\"Fees, eligibility and scholarships for you.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Within the hour\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"submit\":\"Call me\",\"skip\":\"Not now, keep exploring\",\"note\":\"Your number is used only for this call.\",\"done\":\"Booked, {name}. A counsellor will call you at the time you picked. Meanwhile, tap anything below.\"}</ui>",
        "Shall I have the brochure and fee breakup for your course sent to you?\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"whatsapp\",\"title\":\"Brochure and fee breakup\",\"subtitle\":\"For your programme, on WhatsApp.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it on WhatsApp\",\"skip\":\"Not now, keep exploring\",\"note\":\"Used only by Acharya admissions for your enquiry. Say stop anytime.\",\"done\":\"Done, {name}. Admissions will WhatsApp you from +91 97317-97677, usually within a few hours. Anything else you'd like to check meanwhile?\"}</ui>"
      ]
    },
    "nodes": {
      "courses": {
        "id": "courses",
        "label": "Courses",
        "answer": "100+ programmes on one 120-acre campus. Which area?\n~~~\nTen colleges, one campus in Bengaluru. What are you leaning towards?",
        "next": [
          "c_eng",
          "c_mgmt",
          "c_health",
          "c_design",
          "c_unsure",
          "other"
        ]
      },
      "elig": {
        "id": "elig",
        "label": "Am I eligible?",
        "answer": "Quick check. What do you want to study?\n~~~\nLet's check. Pick the course you have in mind:",
        "next": [
          "el_eng",
          "el_mgmt",
          "el_ug",
          "el_health",
          "el_arch",
          "other"
        ]
      },
      "fees": {
        "id": "fees",
        "label": "Fees",
        "answer": "Straight answer on fees:\n- [rupee] Acharya doesn't publish fee figures online\n- [info] KCET seats: fee fixed by the government (KEA)\n- [info] COMEDK and management quota: set separately\n- [home] Hostel and transport are billed separately\n\nWhat would help most?\n~~~\nHere's how fees work at Acharya:\n- [info] Your fee depends on programme and quota\n- [rupee] KCET quota fees are set by KEA, not the college\n- [home] Hostel and transport come on top\n- [award] 1,400+ students get scholarships each year\n\nWhat next?",
        "next": [
          "fee_why",
          "fee_exact",
          "sc_which",
          "later",
          "other"
        ]
      },
      "schol": {
        "id": "schol",
        "label": "Scholarships",
        "answer": "Acharya supports 1,400+ students with scholarships every year.\n- [award] CET merit: up to 100% tuition waiver by rank\n- [star] Rank under 5,000 + EWS/BPL (Karnataka): zero fee, free hostel and food, Rs. 2,500 a month\n- [users] Also sports, NCC, culture, farmers' children, single parents, defence, siblings, alumni\n\nWant to see which could apply to you?\n~~~\nScholarships at Acharya, in short:\n- [award] 1,400+ students supported a year\n- [target] CET rank scholarships, up to full tuition\n- [users] Plus sports, NCC, cultural, family-based categories\n\nShall we check yours?",
        "next": [
          "sc_which",
          "sc_cet",
          "sc_apply",
          "other"
        ]
      },
      "hostel": {
        "id": "hostel",
        "label": "Hostel and campus",
        "answer": "Hostel life on campus:\n- [bed] 12 residences: 5 for boys, 7 for girls, 1,500 beds\n- [shield] Faculty wardens, 24/7 security and CCTV\n- [food] Veg and non-veg mess, menu set by students\n- [wifi] Wi-Fi, laundry, medical centre on campus\n\n<media>[{\"url\": \"https://www.m.acharya.ac.in/life@acharya/img/hostel/hostel4.webp\", \"caption\": \"A shared room in a girls' residence\"}]</media>\n~~~\nLiving on campus at Acharya:\n- [home] 12 residences right on the 120-acre campus\n- [bed] Single, double and triple rooms\n- [shield] Wardens in every block, CCTV, 24/7 security\n- [food] Mess with veg and non-veg menus\n\n<media>[{\"url\": \"https://www.acharya.ac.in/about/img/infrastructure/hostel.webp\", \"caption\": \"A shared room in a boys' residence\"}]</media>",
        "next": [
          "h_rooms",
          "h_food",
          "h_safety",
          "h_reach",
          "other"
        ]
      },
      "place": {
        "id": "place",
        "label": "Placements",
        "answer": "Placements at Acharya:\n- [briefcase] About 90% of graduates placed\n- [users] 550+ recruiters a year: Microsoft, Amazon, SAP Labs, Google, IBM, Deloitte\n- [award] Highest package: 65 LPA\n\n<media>[{\"url\": \"https://www.m.acharya.ac.in/about/img/events/ABB.webp\", \"caption\": \"Students placed with ABB\"}]</media>\n~~~\nThe placement picture:\n- [award] Highest package: 65 LPA\n- [briefcase] Around 90% placed\n- [users] 550+ companies visit each year",
        "next": [
          "p_branch",
          "p_train",
          "other"
        ]
      },
      "apply": {
        "id": "apply",
        "label": "How to apply",
        "answer": "Three ways in:\n- [file] Online at admissions.acharya.global\n- [building] On campus with a counsellor\n- [target] Through KCET, COMEDK or another entrance exam\n\nRegistration and counselling are free. Which suits you?\n~~~\nYou can apply three ways:\n- [file] Online portal: admissions.acharya.global\n- [map] Walk in and meet a counsellor on campus\n- [graduation] Entrance route: KCET, COMEDK, JEE, PGCET\n\nWhat would you like to see?",
        "next": [
          "ap_steps",
          "e_routes",
          "ap_docs",
          "ap_reserve",
          "other"
        ]
      },
      "talk": {
        "id": "talk",
        "label": "Talk to a counsellor",
        "answer": "Happy to connect you. How would you like to talk?\n~~~\nSure. Pick what's easiest for you:",
        "next": [
          "call_me",
          "wa_me",
          "video",
          "visit",
          "later"
        ]
      },
      "c_eng": {
        "id": "c_eng",
        "label": "Engineering (B.E.)",
        "answer": "B.E. at Acharya Institute of Technology (VTU, 4 years):\n- [graduation] 19 branches, from CSE (AI) to Aerospace\n- [check] Eligibility: 45% in Physics, Maths and one science\n- [target] Entry: KCET, COMEDK, JEE or management quota\n\nWhich side interests you?",
        "next": [
          "e_cse",
          "e_core",
          "el_eng",
          "e_routes",
          "other"
        ]
      },
      "e_cse": {
        "id": "e_cse",
        "label": "CSE, AI and data branches",
        "answer": "The software side of AIT:\n- [graduation] CSE, and CSE with AI, Data Science, Cyber Security, Cloud\n- [graduation] AI & ML, ISE (with AI, Cloud, Cyber Security)\n- [briefcase] Recruiters include Microsoft, Amazon, SAP Labs, Google\n~~~\nComputer branches at AIT:\n- [graduation] CSE plus 4 specialisations: AI, Data Science, Cyber Security, Cloud\n- [graduation] AI & ML and ISE options too\n- [briefcase] Tech recruiters on campus every year",
        "next": [
          "el_eng",
          "p_branch",
          "sc_which",
          "other"
        ]
      },
      "e_core": {
        "id": "e_core",
        "label": "Core and other branches",
        "answer": "Core engineering at AIT:\n- [building] Civil, Mechanical, Aeronautical, Aerospace\n- [flask] ECE, EEE, Mechatronics, Robotics & AI, Biotechnology\n- [star] AIT was VTU's first college with Mechatronics\n- [flask] A wind tunnel for aeronautics research",
        "next": [
          "el_eng",
          "p_branch",
          "other"
        ]
      },
      "c_mgmt": {
        "id": "c_mgmt",
        "label": "Management, commerce, computers",
        "answer": "Business and computer programmes:\n- [graduation] UG (3 yrs): BBA, BCA, B.Com (incl. ACCA, CMA), B.A., B.Sc\n- [briefcase] PG: MBA, MCA, M.Com, 14-month Global MBA\n- [check] UG is merit-based: no entrance exam",
        "next": [
          "el_ug",
          "el_mgmt",
          "p_train",
          "other"
        ]
      },
      "c_health": {
        "id": "c_health",
        "label": "Pharmacy, nursing, allied health",
        "answer": "Health sciences on campus:\n- [flask] Pharmacy: D.Pharm, B.Pharm, Pharm.D, M.Pharm (NAAC A+)\n- [heart] Nursing: B.Sc, GNM, Post Basic, M.Sc\n- [users] Allied health: 8 B.Sc programmes; Physiotherapy: BPT\n- [check] No NEET for pharmacy, BPT or allied health",
        "next": [
          "el_health",
          "p_health",
          "other"
        ]
      },
      "c_design": {
        "id": "c_design",
        "label": "Architecture and design",
        "answer": "Creative programmes:\n- [building] B.Arch, 5 years, needs NATA\n- [star] BVA: Animation & Game Art, Graphic, Interior, Product Design\n- [star] B.Sc Fashion and Apparel Design\n- [map] European design certification option",
        "next": [
          "el_arch",
          "other"
        ]
      },
      "c_unsure": {
        "id": "c_unsure",
        "label": "Not sure yet",
        "answer": "No problem. What did you take in 12th?",
        "next": [
          "u_pcm",
          "u_pcb",
          "u_com"
        ]
      },
      "u_pcm": {
        "id": "u_pcm",
        "label": "Science with Maths",
        "answer": "With Maths in 12th, most people look at:\n- [graduation] B.E. (CSE and AI branches are the most popular)\n- [building] B.Arch, if you like design (needs NATA)\n- [book] BCA or B.Sc, if you'd rather skip the entrance exam",
        "next": [
          "e_cse",
          "c_design",
          "el_eng",
          "other"
        ]
      },
      "u_pcb": {
        "id": "u_pcb",
        "label": "Science with Biology",
        "answer": "With Biology, strong options that need no NEET:\n- [flask] B.Pharm or Pharm.D\n- [users] BPT and 8 allied health B.Sc programmes\n- [heart] B.Sc Nursing",
        "next": [
          "c_health",
          "el_health",
          "other"
        ]
      },
      "u_com": {
        "id": "u_com",
        "label": "Commerce or Arts",
        "answer": "From Commerce or Arts, popular picks:\n- [briefcase] BBA (Business Analytics, Aviation, Digital Marketing)\n- [rupee] B.Com with ACCA or CMA\n- [book] B.A. Psychology, Journalism, Criminology\n- [check] All merit-based: no entrance exam",
        "next": [
          "c_mgmt",
          "el_ug",
          "other"
        ]
      },
      "el_eng": {
        "id": "el_eng",
        "label": "Eligibility for B.E.",
        "answer": "B.E. eligibility:\n- [check] Pass 12th with English\n- [target] 45% in Physics, Maths and one of Chemistry, Biology, CS or Electronics\n- [calendar] Age 17 or above\n\nWhere do you stand?",
        "next": [
          "ee_yes",
          "ee_no",
          "ee_wait"
        ]
      },
      "ee_yes": {
        "id": "ee_yes",
        "label": "I have 45% or more",
        "answer": "You clear the marks rule. Next is the route:\n- [target] KCET or COMEDK: seat through counselling\n- [briefcase] Management quota: apply directly to Acharya\n~~~\nGood news: you meet the marks rule. The route decides the rest:\n- [target] KCET or COMEDK counselling\n- [file] Or management quota, straight through Acharya",
        "next": [
          "e_routes",
          "sc_which",
          "ap_steps",
          "other"
        ]
      },
      "ee_no": {
        "id": "ee_no",
        "label": "Below 45%",
        "answer": "Honest answer: B.E. needs 45% (40% for Karnataka SC, ST and OBC). Good routes still open:\n- [graduation] 3-year diploma, then join B.E. in 2nd year via DCET\n- [book] BCA or B.Sc: merit-based, no entrance exam",
        "next": [
          "poly",
          "c_mgmt",
          "other"
        ]
      },
      "ee_wait": {
        "id": "ee_wait",
        "label": "Results awaited",
        "answer": "You can reserve a seat before results, as long as you meet eligibility once they're out.\n- [calendar] Keeps your options open\n- [check] The counsellor checks everything when results come",
        "next": [
          "ap_reserve",
          "ap_steps",
          "other"
        ]
      },
      "poly": {
        "id": "poly",
        "label": "Diploma, then B.E.",
        "answer": "Acharya Polytechnic (est. 1990):\n- [graduation] 3-year diplomas: CSE, ECE, Mechanical, Civil, Aeronautical, EV and more\n- [target] DCET training built in, for lateral entry into B.E. 2nd year\n- [check] Entry after 10th",
        "next": [
          "other"
        ]
      },
      "el_mgmt": {
        "id": "el_mgmt",
        "label": "MBA / MCA",
        "answer": "MBA and MCA eligibility:\n- [check] Any 3-year degree with 50% aggregate\n- [target] KMAT, PGCET, CMAT or MAT\n- [info] MCA also needs Maths in 12th or your degree",
        "next": [
          "ap_steps",
          "other"
        ]
      },
      "el_ug": {
        "id": "el_ug",
        "label": "BBA / BCA / B.Com / B.A.",
        "answer": "Simple one: pass 12th in any stream from a recognised board.\n- [check] Merit-based on your 12th marks\n- [check] No entrance exam",
        "next": [
          "c_mgmt",
          "ap_steps",
          "other"
        ]
      },
      "el_health": {
        "id": "el_health",
        "label": "Pharmacy / Nursing / BPT",
        "answer": "Health sciences eligibility:\n- [flask] B.Pharm: 12th with 45% in PCM or PCB\n- [heart] B.Sc Nursing: 12th with PCB\n- [users] BPT: 45% in PCB\n- [check] No NEET for any of these",
        "next": [
          "c_health",
          "ap_steps",
          "other"
        ]
      },
      "el_arch": {
        "id": "el_arch",
        "label": "Architecture",
        "answer": "B.Arch eligibility:\n- [check] 12th with Physics and Maths, 45% in the science group\n- [target] NATA is required (JEE Main Paper 2 may be accepted)",
        "next": [
          "c_design",
          "other"
        ]
      },
      "e_routes": {
        "id": "e_routes",
        "label": "KCET, COMEDK, management",
        "answer": "The entry routes for B.E.:\n- [target] KCET (KEA): government-quota seats, fee fixed by KEA\n- [target] COMEDK UGET: private-quota seats\n- [target] JEE is also accepted\n- [briefcase] Management quota: apply to Acharya directly",
        "next": [
          "fee_exact",
          "ap_steps",
          "other"
        ]
      },
      "fee_why": {
        "id": "fee_why",
        "label": "What decides my fee?",
        "answer": "Three things set your fee:\n- [graduation] The programme\n- [target] Your quota: KCET, COMEDK or management\n- [home] Hostel and bus, if you need them\n\nThe exact figure for your case comes from a counsellor.",
        "next": [
          "fee_exact",
          "sc_which",
          "other"
        ]
      },
      "fee_exact": {
        "id": "fee_exact",
        "label": "Get my exact fee",
        "answer": "The counsellor sends the exact fee for your programme and quota, plus the hostel fee if you need it.\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"whatsapp\",\"title\":\"Get your exact fee\",\"subtitle\":\"Programme fee for your quota, hostel and bus, on WhatsApp.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it on WhatsApp\",\"skip\":\"Not now, keep exploring\",\"note\":\"Used only by Acharya admissions for your enquiry. Say stop anytime.\",\"done\":\"Done, {name}. Admissions will WhatsApp you from +91 97317-97677, usually within a few hours. Anything else you'd like to check meanwhile?\"}</ui>",
        "next": []
      },
      "sc_which": {
        "id": "sc_which",
        "label": "Which ones could I get?",
        "answer": "Tap the one closest to you:",
        "next": [
          "sc_ews",
          "sc_sports",
          "sc_family",
          "sc_none"
        ]
      },
      "sc_ews": {
        "id": "sc_ews",
        "label": "EWS / BPL family",
        "answer": "Category 2 scholarship, if ALL of these fit:\n- [check] EWS or BPL card, Karnataka resident\n- [check] KCET rank under 5,000\n- [check] B.E. or B.Arch\n- [award] Zero fee, free hostel and food, Rs. 2,500 a month\n\nThe committee decides; 10 of these are given.",
        "next": [
          "sc_apply",
          "sc_cet",
          "other"
        ]
      },
      "sc_sports": {
        "id": "sc_sports",
        "label": "Sports, NCC or culture",
        "answer": "Talent scholarships cover:\n- [trophy] Sports at state, national or international level\n- [shield] NCC representation\n- [star] Cultural talent\n\nThe committee sets the amount after admission.",
        "next": [
          "sc_apply",
          "other"
        ]
      },
      "sc_family": {
        "id": "sc_family",
        "label": "Family situation",
        "answer": "Family-based categories include:\n- [users] Farmers' children, single parents, defence families\n- [users] Siblings of current students, alumni, teachers' children\n- [heart] Physically challenged students",
        "next": [
          "sc_apply",
          "other"
        ]
      },
      "sc_none": {
        "id": "sc_none",
        "label": "None of these",
        "answer": "That's fine. Two things still worth checking:\n- [award] CET merit waiver: up to 100% tuition by KCET rank\n- [rupee] Ask the counsellor about paying in instalments",
        "next": [
          "sc_cet",
          "fee_exact",
          "other"
        ]
      },
      "sc_cet": {
        "id": "sc_cet",
        "label": "CET rank scholarships",
        "answer": "CET scholarships:\n- [award] Category 1: up to 100% tuition waiver by rank band\n- [star] Category 2: rank under 5,000 + EWS/BPL, full support\n- [info] Rank bands: the counsellor confirms",
        "next": [
          "sc_apply",
          "other"
        ]
      },
      "sc_apply": {
        "id": "sc_apply",
        "label": "How do I apply?",
        "answer": "Scholarships are applied for after admission, through your college counsellor.\n- [check] The committee's decision is final\n- [mail] Questions: scholarship@acharya.ac.in",
        "next": [
          "other"
        ]
      },
      "h_rooms": {
        "id": "h_rooms",
        "label": "Show me the rooms",
        "answer": "Rooms come as single, double or triple sharing, with common areas and laundry in the blocks.\n\n<media>[{\"url\": \"https://www.acharya.ac.in/about/img/infrastructure/hostel.webp\", \"caption\": \"A shared room in a boys' residence\"}, {\"url\": \"https://www.m.acharya.ac.in/life@acharya/img/hostel/hostel4.webp\", \"caption\": \"A shared room in a girls' residence\"}]</media>",
        "next": [
          "h_food",
          "h_safety",
          "other"
        ]
      },
      "h_food": {
        "id": "h_food",
        "label": "What's the food like?",
        "answer": "The mess:\n- [food] Veg and non-veg menus\n- [users] Menu set every month by a committee with student leaders\n- [check] Mechanised, hygienic kitchens\n\n<media>[{\"url\": \"https://www.m.acharya.ac.in/life@acharya/img/hostel/hostel3.webp\", \"caption\": \"Lunch at the hostel mess\"}]</media>",
        "next": [
          "h_safety",
          "other"
        ]
      },
      "h_safety": {
        "id": "h_safety",
        "label": "How safe is it?",
        "answer": "Safety on campus:\n- [shield] A faculty Chief Warden and Deputy Warden in every residence\n- [shield] 24/7 security with CCTV\n- [heart] Medical centre, ambulance, hospital tie-ups\n- [phone] Women's 24/7 helpline: +91 98808-50112",
        "next": [
          "h_parent",
          "other"
        ]
      },
      "h_parent": {
        "id": "h_parent",
        "label": "I'm a parent",
        "answer": "Most parents feel better after seeing the residences in person. You're welcome to visit: a counsellor shows you the hostel, the mess and the college.",
        "next": [
          "visit",
          "h_reach",
          "other"
        ]
      },
      "h_reach": {
        "id": "h_reach",
        "label": "How do I get to campus?",
        "answer": "Getting there:\n- [bus] College buses: Yelahanka, Yeshwanthpur and Nelamangala routes\n- [map] Metro (Nagasandra / Dasarahalli): about 5 km\n- [map] Airport 35 km, Yeshwantpur Junction 10 km",
        "next": [
          "visit",
          "other"
        ]
      },
      "p_branch": {
        "id": "p_branch",
        "label": "For my branch?",
        "answer": "Branch-wise numbers come from the placement cell. What's published:\n- [briefcase] Engineering: 200+ corporate recruiters a year\n- [users] Volvo, Dell, Accenture, Bosch, Siemens among them\n- [award] Group highest: 65 LPA",
        "next": [
          "p_train",
          "other"
        ]
      },
      "p_train": {
        "id": "p_train",
        "label": "How do they prepare you?",
        "answer": "Placement training:\n- [book] Aptitude prep with AMCAT, eLitmus, CoCubes\n- [users] Mock interviews and resume building\n- [award] Certifications with IBM, Google, L&T",
        "next": [
          "other"
        ]
      },
      "p_health": {
        "id": "p_health",
        "label": "Health science placements",
        "answer": "Health sciences recruiters:\n- [heart] Hospitals: Apollo, Narayana, Dr Agarwals\n- [flask] Pharma: Abbott, GSK, Novartis, Merck\n- [map] Nursing programme for careers in the UK, Germany, Australia",
        "next": [
          "other"
        ]
      },
      "ap_steps": {
        "id": "ap_steps",
        "label": "Online, step by step",
        "answer": "Applying online:\n- [file] 1. Register at admissions.acharya.global\n- [phone] 2. A counsellor calls and checks eligibility\n- [file] 3. Upload your marksheets and Aadhaar\n- [check] 4. Get your offer, pay to confirm",
        "next": [
          "ap_docs",
          "other"
        ]
      },
      "ap_docs": {
        "id": "ap_docs",
        "label": "Documents I need",
        "answer": "Keep these ready:\n- [file] Aadhaar card\n- [file] 10th and 12th marksheets (degree for PG)\n- [file] Entrance scorecard, if you have one",
        "next": [
          "other"
        ]
      },
      "ap_reserve": {
        "id": "ap_reserve",
        "label": "Can I apply before results?",
        "answer": "Yes. Acharya lets you reserve a seat before final results, as long as you meet eligibility once they're out.",
        "next": [
          "ap_steps",
          "other"
        ]
      },
      "call_me": {
        "id": "call_me",
        "label": "Call me",
        "answer": "Pick a time and a counsellor calls you.\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"phone\",\"title\":\"Call from a counsellor\",\"subtitle\":\"Fees, eligibility, scholarships, hostel: all in one call.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Within the hour\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"submit\":\"Call me\",\"skip\":\"Not now, keep exploring\",\"note\":\"Your number is used only for this call.\",\"done\":\"Booked, {name}. A counsellor will call you at the time you picked. Meanwhile, tap anything below.\"}</ui>",
        "next": []
      },
      "wa_me": {
        "id": "wa_me",
        "label": "WhatsApp me the details",
        "answer": "The counsellor sends everything for your course on WhatsApp: fee, eligibility and scholarships.\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"whatsapp\",\"title\":\"Get it on WhatsApp\",\"subtitle\":\"Fees, eligibility and scholarships for your course.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it on WhatsApp\",\"skip\":\"Not now, keep exploring\",\"note\":\"Used only by Acharya admissions for your enquiry. Say stop anytime.\",\"done\":\"Done, {name}. Admissions will WhatsApp you from +91 97317-97677, usually within a few hours. Anything else you'd like to check meanwhile?\"}</ui>",
        "next": []
      },
      "video": {
        "id": "video",
        "label": "Video counselling",
        "answer": "Free video counselling: about 20 minutes on Zoom with a counsellor, and you can bring your parents.\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"video\",\"title\":\"Request a video counselling slot\",\"subtitle\":\"The counsellor confirms the time and sends the Zoom link.\",\"fields\":[\"name\",\"phone\",\"email\",\"slot\"],\"slots\":[\"Tomorrow morning\",\"Tomorrow afternoon\",\"Day after, morning\",\"Day after, afternoon\"],\"submit\":\"Request my slot\",\"skip\":\"Not now, keep exploring\",\"note\":\"Used only for this session.\",\"done\":\"Requested, {name}. A counsellor confirms the time and emails the Zoom link. More about it: acharya.ac.in/vc.html\"}</ui>",
        "next": []
      },
      "visit": {
        "id": "visit",
        "label": "Visit the campus",
        "answer": "Come see it: a counsellor walks you through the college, the hostels and the mess.\n\n<ui>{\"type\":\"form\",\"local\":true,\"icon\":\"map\",\"title\":\"Plan a campus visit\",\"subtitle\":\"Soladevanahalli, Bengaluru. Monday to Saturday.\",\"fields\":[\"relation\",\"name\",\"phone\",\"visitDay\"],\"visitDays\":[\"This Saturday\",\"Next Monday\",\"Next Wednesday\",\"Next Saturday\"],\"submit\":\"Plan my visit\",\"skip\":\"Not now, keep exploring\",\"note\":\"Used only to arrange your visit.\",\"done\":\"Great, {name}. Admissions will call to confirm your visit. Campus: Acharya Dr. S. Radhakrishnan Road, Soladevanahalli.\"}</ui>",
        "next": []
      },
      "later": {
        "id": "later",
        "label": "I'll decide later",
        "answer": "No rush. Good to know before you go:\n- [file] Brochures are free on acharya.ac.in\n- [whatsapp] WhatsApp admissions anytime: +91 97317-97677\n- [calendar] You can reserve a seat before results\n\nAnything else you want to check now?\n~~~\nTake your time. For later:\n- [whatsapp] Admissions WhatsApp: +91 97317-97677\n- [phone] Hotline: +91 74066-44449\n- [file] Apply anytime at admissions.acharya.global\n\nWant to look at anything else first?",
        "next": []
      },
      "other": {
        "id": "other",
        "label": "Something else",
        "answer": "Sure. What else would you like to know?\n~~~\nOf course. Pick a topic:\n~~~\nHappy to help. What next?",
        "next": []
      }
    }
  }
}
---
# Riya: rule-based, no AI

This bot answers only from its scripted menu (guidedFlow, noAi). The AI is never called, so these instructions are never used in a conversation. They exist because every bot needs an instructions body.
