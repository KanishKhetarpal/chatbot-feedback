---
{
  "name": "Riya · Quick answers (no AI)",
  "description": "PURE RULES, NO AI: a fixed if/else tree of tap-only answers. Seven topics; every answer ends with the visitor choosing between 'Send it to my WhatsApp', 'Call me' and a softer 'tell me more' / 'decide later' option. The softer options give more value and then offer the same two phone choices again, so every path ends with the lead themselves picking a phone option. Forms submit without the AI; the menu comes back after each capture. No typing anywhere.",
  "heading": "Quick answers",
  "subheading": "Tap your way through fees, eligibility, placements and hostel. No typing needed.",
  "greeting": "Hi, I'm Riya from Acharya admissions. Tap a topic below for a quick answer. No typing needed.",
  "messagePresets": [],
  "inputPlaceholder": "Tap an option above",
  "language": "auto",
  "tone": "friendly",
  "responseLength": "concise",
  "useEmoji": false,
  "knowledgeMode": "blended",
  "restrictedTopics": [],
  "handoffTriggers": [],
  "leadCapture": "never",
  "leadFields": [
    "phone",
    "name"
  ],
  "qualificationEnabled": false,
  "model": "claude-haiku-4-5",
  "effort": "low",
  "maxTokens": 400,
  "status": "active",
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
      "fees",
      "elig",
      "place",
      "hostel",
      "schol",
      "fit",
      "callnow"
    ],
    "escapeToAiLabel": "Type my own question",
    "escapeToHumanLabel": "Talk to a person",
    "nodes": {
      "fees": {
        "id": "fees",
        "label": "Fees for my course",
        "answer": "Fees at Acharya depend on two things:\n- [graduation] Your programme\n- [target] Your route: KCET, COMEDK or management quota\n- [info] KCET-quota fees are fixed by the government (KEA)\n- [home] Hostel and transport are billed separately\n\nThe exact break-up is not published online, but a counsellor can send yours today. How would you like it?",
        "next": [
          "fees_wa",
          "fees_call",
          "fees_more"
        ]
      },
      "fees_more": {
        "id": "fees_more",
        "label": "What affects the fee?",
        "answer": "Here's what changes the figure:\n- [target] Quota: KCET fees are set by KEA; COMEDK and management quota differ\n- [graduation] Programme and branch\n- [award] Scholarships: 1,400+ students get one every year, up to a 100% tuition waiver for CET merit ranks\n- [home] Hostel (single, double or triple room) and the college bus\n\nWant your exact figure?",
        "next": [
          "fees_wa",
          "fees_call",
          "fees_later"
        ]
      },
      "fees_later": {
        "id": "fees_later",
        "label": "I'll decide later",
        "answer": "No problem. Whenever you're ready, the quickest way to get your exact figure is one of these:",
        "next": [
          "fees_wa",
          "fees_call"
        ]
      },
      "fees_wa": {
        "id": "fees_wa",
        "label": "Send the exact fees to my WhatsApp",
        "answer": "Tell me your programme and I'll send the exact fee break-up.\n\n<ui>{\"type\":\"form\",\"icon\":\"whatsapp\",\"local\":true,\"title\":\"Exact fee break-up on WhatsApp\",\"subtitle\":\"For your programme and quota, from an admissions counsellor.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it to my WhatsApp\",\"note\":\"Your number is used only for this.\",\"done\":\"Thanks, {name}. It's on its way to your WhatsApp, usually within the hour. Anything else you'd like to check? Pick a topic below.\"}</ui>",
        "next": []
      },
      "fees_call": {
        "id": "fees_call",
        "label": "Call me and explain the fees",
        "answer": "Pick a time and a counsellor will walk you through the fee for your quota.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Fee call back\",\"subtitle\":\"About 10 minutes, at the time you pick.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      },
      "place": {
        "id": "place",
        "label": "Placements",
        "answer": "Placements at Acharya, in short:\n- [briefcase] About **90%** of graduates placed\n- [users] 550+ recruiters a year, incl. Microsoft, Amazon, SAP Labs, Google, IBM\n- [award] Highest package: 65 LPA\n\n<media>[{\"url\": \"https://www.m.acharya.ac.in/about/img/events/ABB.webp\", \"caption\": \"Students placed with ABB\"}]</media>\nBranch-wise figures come from the placement cell. Want them for your programme?",
        "next": [
          "place_wa",
          "place_call",
          "place_more"
        ]
      },
      "place_more": {
        "id": "place_more",
        "label": "How does placement training work?",
        "answer": "Training starts well before final year:\n- [book] Aptitude training (AMCAT, eLitmus, Aon CoCubes)\n- [users] Mock interviews and resume building\n- [award] Certifications with IBM, Google and L&T\n- [briefcase] Internships with partner companies\n\nWant the branch-wise placement sheet?",
        "next": [
          "place_wa",
          "place_call",
          "place_later"
        ]
      },
      "place_later": {
        "id": "place_later",
        "label": "I'll decide later",
        "answer": "Sure. When you want the numbers for your programme, just pick one:",
        "next": [
          "place_wa",
          "place_call"
        ]
      },
      "place_wa": {
        "id": "place_wa",
        "label": "Send branch-wise placements to my WhatsApp",
        "answer": "Tell me your programme and I'll send its placement data.\n\n<ui>{\"type\":\"form\",\"icon\":\"whatsapp\",\"local\":true,\"title\":\"Placement data on WhatsApp\",\"subtitle\":\"Branch-wise figures and recruiters, from the placement cell.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it to my WhatsApp\",\"note\":\"Your number is used only for this.\",\"done\":\"Thanks, {name}. It's on its way to your WhatsApp, usually within the hour. Anything else you'd like to check? Pick a topic below.\"}</ui>",
        "next": []
      },
      "place_call": {
        "id": "place_call",
        "label": "Call me about placements",
        "answer": "Pick a time and a counsellor will take you through placements for your programme.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Placements call back\",\"subtitle\":\"About 10 minutes, at the time you pick.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      },
      "hostel": {
        "id": "hostel",
        "label": "Hostel and campus life",
        "answer": "Hostel life, in short:\n- [bed] 12 residences on campus: 5 for boys, 7 for girls, 1,500 beds\n- [shield] Faculty wardens in every block, 24/7 security and CCTV\n- [food] Veg and non-veg mess, menu set by a student committee\n- [wifi] Wi-Fi, laundry, medical centre, college buses on 3 routes\n\n<media>[{\"url\": \"https://www.m.acharya.ac.in/life@acharya/img/hostel/hostel4.webp\", \"caption\": \"A shared room in a girls' residence\"}, {\"url\": \"https://www.m.acharya.ac.in/life@acharya/img/hostel/hostel3.webp\", \"caption\": \"Lunch at the hostel mess\"}]</media>",
        "next": [
          "hostel_wa",
          "hostel_call",
          "hostel_more"
        ]
      },
      "hostel_more": {
        "id": "hostel_more",
        "label": "Food and safety details",
        "answer": "What parents usually check:\n- [shield] Chief and Deputy Warden in every residence, both faculty\n- [phone] Women's 24/7 helpline and a general hostel helpline\n- [heart] On-campus medical centre, ambulance and hospital tie-ups\n- [food] Monthly mess committee with student members\n\n<media>[{\"url\": \"https://www.acharya.ac.in/about/img/infrastructure/security.webp\", \"caption\": \"Campus security, on duty 24/7\"}]</media>\nWant the hostel charges and room options?",
        "next": [
          "hostel_wa",
          "hostel_call",
          "hostel_later"
        ]
      },
      "hostel_later": {
        "id": "hostel_later",
        "label": "I'll decide later",
        "answer": "Of course. When you want the charges and room options, pick one:",
        "next": [
          "hostel_wa",
          "hostel_call"
        ]
      },
      "hostel_wa": {
        "id": "hostel_wa",
        "label": "Send hostel photos and charges to my WhatsApp",
        "answer": "Tell me your programme and I'll send room options and this year's charges.\n\n<ui>{\"type\":\"form\",\"icon\":\"whatsapp\",\"local\":true,\"title\":\"Hostel details on WhatsApp\",\"subtitle\":\"Room types, photos and this year's charges.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it to my WhatsApp\",\"note\":\"Your number is used only for this.\",\"done\":\"Thanks, {name}. It's on its way to your WhatsApp, usually within the hour. Anything else you'd like to check? Pick a topic below.\"}</ui>",
        "next": []
      },
      "hostel_call": {
        "id": "hostel_call",
        "label": "Call me about the hostel",
        "answer": "Pick a time and a counsellor will answer every hostel question.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Hostel call back\",\"subtitle\":\"About 10 minutes, at the time you pick.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      },
      "schol": {
        "id": "schol",
        "label": "Scholarships",
        "answer": "Scholarships at Acharya:\n- [award] 1,400+ students get one every year\n- [star] CET merit: 100% tuition waiver by rank band\n- [users] Also sports, NCC, culture, farmers' children, single parents, defence families, siblings, alumni\n\nThe committee confirms the slab. Want yours checked?",
        "next": [
          "schol_wa",
          "schol_call",
          "schol_more"
        ]
      },
      "schol_more": {
        "id": "schol_more",
        "label": "The CET rank scholarships",
        "answer": "Two CET categories:\n- [star] Category 1: 100% tuition waiver for CET merit ranks (by rank band)\n- [award] Category 2: rank under 5,000 + EWS/BPL + Karnataka: zero fee, free hostel and food, Rs. 2,500 a month (10 seats, AIT or Architecture)\n- [check] Kept each year with 75% marks and 85% attendance\n\nWant a counsellor to check what you qualify for?",
        "next": [
          "schol_wa",
          "schol_call",
          "schol_later"
        ]
      },
      "schol_later": {
        "id": "schol_later",
        "label": "I'll decide later",
        "answer": "Sure. When you'd like your scholarship checked, pick one:",
        "next": [
          "schol_wa",
          "schol_call"
        ]
      },
      "schol_wa": {
        "id": "schol_wa",
        "label": "Check my scholarship on WhatsApp",
        "answer": "Tell me your programme and I'll have your scholarship checked.\n\n<ui>{\"type\":\"form\",\"icon\":\"whatsapp\",\"local\":true,\"title\":\"Scholarship check on WhatsApp\",\"subtitle\":\"A counsellor checks your rank and category and sends the outcome.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it to my WhatsApp\",\"note\":\"Your number is used only for this.\",\"done\":\"Thanks, {name}. It's on its way to your WhatsApp, usually within the hour. Anything else you'd like to check? Pick a topic below.\"}</ui>",
        "next": []
      },
      "schol_call": {
        "id": "schol_call",
        "label": "Call me about scholarships",
        "answer": "Pick a time and a counsellor will check your scholarship with you.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Scholarship call back\",\"subtitle\":\"About 10 minutes, at the time you pick.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      },
      "elig": {
        "id": "elig",
        "label": "Am I eligible?",
        "answer": "Happy to check. Which programme are you looking at?",
        "next": [
          "elig_be",
          "elig_mgmt",
          "elig_ug",
          "elig_health",
          "elig_arch"
        ]
      },
      "elig_be": {
        "id": "elig_be",
        "label": "Engineering (B.E.)",
        "answer": "B.E. eligibility:\n- [check] 12th with Physics, Maths and one of Chemistry, Biology or Computer Science\n- [target] At least 45% in those three subjects; age 17+\n- [book] Route: KCET, COMEDK, JEE or management quota\n\nWant a counsellor to check your marks?",
        "next": [
          "elig_wa",
          "elig_call",
          "elig_later"
        ]
      },
      "elig_mgmt": {
        "id": "elig_mgmt",
        "label": "MBA / MCA",
        "answer": "MBA and MCA eligibility:\n- [check] Any 3-year degree with at least 50%\n- [book] KMAT, PGCET, CMAT or MAT score\n- [info] MCA also needs Maths in 12th or your degree\n\nWant a counsellor to check your case?",
        "next": [
          "elig_wa",
          "elig_call",
          "elig_later"
        ]
      },
      "elig_ug": {
        "id": "elig_ug",
        "label": "BBA / BCA / B.Com",
        "answer": "BBA, BCA and B.Com eligibility:\n- [check] 12th pass in any stream\n- [star] Admission is merit-based, no entrance exam\n\nWant a counsellor to check your marks?",
        "next": [
          "elig_wa",
          "elig_call",
          "elig_later"
        ]
      },
      "elig_health": {
        "id": "elig_health",
        "label": "Pharmacy / Nursing / Health",
        "answer": "Health sciences eligibility:\n- [flask] B.Pharm: 12th with 45% in Physics, Chemistry and Maths or Biology\n- [heart] Nursing and allied health: 12th with Physics, Chemistry, Biology\n- [check] BPT: 45% in PCB; no NEET needed\n\nWant a counsellor to check your case?",
        "next": [
          "elig_wa",
          "elig_call",
          "elig_later"
        ]
      },
      "elig_arch": {
        "id": "elig_arch",
        "label": "Architecture / Design",
        "answer": "Architecture and design eligibility:\n- [building] B.Arch: 45% in Physics, Maths and one science, plus a NATA score\n- [star] Design (BVA): 12th in any stream; a portfolio review may apply\n\nWant a counsellor to check your case?",
        "next": [
          "elig_wa",
          "elig_call",
          "elig_later"
        ]
      },
      "elig_later": {
        "id": "elig_later",
        "label": "I'll decide later",
        "answer": "No problem. When you'd like your eligibility confirmed, pick one:",
        "next": [
          "elig_wa",
          "elig_call"
        ]
      },
      "elig_wa": {
        "id": "elig_wa",
        "label": "Confirm my eligibility on WhatsApp",
        "answer": "Share your details and a counsellor will confirm your eligibility.\n\n<ui>{\"type\":\"form\",\"icon\":\"whatsapp\",\"local\":true,\"title\":\"Eligibility check on WhatsApp\",\"subtitle\":\"A counsellor checks your marks and route and replies.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it to my WhatsApp\",\"note\":\"Your number is used only for this.\",\"done\":\"Thanks, {name}. It's on its way to your WhatsApp, usually within the hour. Anything else you'd like to check? Pick a topic below.\"}</ui>",
        "next": []
      },
      "elig_call": {
        "id": "elig_call",
        "label": "Call me to confirm eligibility",
        "answer": "Pick a time and a counsellor will confirm your eligibility.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Eligibility call back\",\"subtitle\":\"About 10 minutes, at the time you pick.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      },
      "fit": {
        "id": "fit",
        "label": "Help me choose a course",
        "answer": "Let's narrow it down. What did you study in 12th?\n\n<media>[{\"url\": \"https://www.acharya.ac.in/about/img/banner/infrastructure.webp\", \"caption\": \"The 120-acre campus at Soladevanahalli\"}]</media>",
        "next": [
          "fit_pcm",
          "fit_pcb",
          "fit_com",
          "fit_arts"
        ]
      },
      "fit_pcm": {
        "id": "fit_pcm",
        "label": "Science with Maths",
        "answer": "With Maths, these fit best:\n- [graduation] B.E.: CSE, AI & ML, ECE, Mechanical, Aeronautical and more\n- [building] B.Arch (with a NATA score)\n- [book] BCA or B.Sc (Computer Science, Data Science)\n\nWant a side-by-side comparison for you?",
        "next": [
          "fit_wa",
          "fit_call",
          "fit_later"
        ]
      },
      "fit_pcb": {
        "id": "fit_pcb",
        "label": "Science with Biology",
        "answer": "With Biology, these fit best:\n- [flask] B.Pharm or Pharm.D\n- [heart] B.Sc Nursing, BPT (Physiotherapy), allied health sciences\n- [check] No NEET needed for these\n\nWant a side-by-side comparison for you?",
        "next": [
          "fit_wa",
          "fit_call",
          "fit_later"
        ]
      },
      "fit_com": {
        "id": "fit_com",
        "label": "Commerce",
        "answer": "With Commerce, these fit best:\n- [briefcase] B.Com (incl. ACCA, CMA)\n- [target] BBA (Business Analytics, Digital Marketing, Aviation and more)\n- [book] BCA if you enjoy computers\n\nWant a side-by-side comparison for you?",
        "next": [
          "fit_wa",
          "fit_call",
          "fit_later"
        ]
      },
      "fit_arts": {
        "id": "fit_arts",
        "label": "Arts / Humanities",
        "answer": "With Arts, these fit best:\n- [book] B.A. (Psychology, Journalism, Criminology, English)\n- [star] Design (BVA) or B.Sc Fashion\n- [briefcase] BBA\n\nWant a side-by-side comparison for you?",
        "next": [
          "fit_wa",
          "fit_call",
          "fit_later"
        ]
      },
      "fit_later": {
        "id": "fit_later",
        "label": "I'll decide later",
        "answer": "Sure. When you want help choosing, pick one:",
        "next": [
          "fit_wa",
          "fit_call"
        ]
      },
      "fit_wa": {
        "id": "fit_wa",
        "label": "Send me a course comparison on WhatsApp",
        "answer": "Tell me the programme you're leaning to and I'll send a comparison.\n\n<ui>{\"type\":\"form\",\"icon\":\"whatsapp\",\"local\":true,\"title\":\"Course comparison on WhatsApp\",\"subtitle\":\"Your best-fit options side by side, from a counsellor.\",\"fields\":[\"name\",\"phone\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Send it to my WhatsApp\",\"note\":\"Your number is used only for this.\",\"done\":\"Thanks, {name}. It's on its way to your WhatsApp, usually within the hour. Anything else you'd like to check? Pick a topic below.\"}</ui>",
        "next": []
      },
      "fit_call": {
        "id": "fit_call",
        "label": "Call me to help me decide",
        "answer": "Pick a time and a counsellor will help you decide.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Course advice call back\",\"subtitle\":\"About 10 minutes, at the time you pick.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      },
      "callnow": {
        "id": "callnow",
        "label": "Talk to a counsellor",
        "answer": "Pick a time and a counsellor will call you, usually within the hour.\n\n<ui>{\"type\":\"form\",\"icon\":\"phone\",\"local\":true,\"title\":\"Call back from a counsellor\",\"subtitle\":\"Fees, eligibility, scholarships, hostel: everything in one call.\",\"fields\":[\"name\",\"phone\",\"slot\"],\"slots\":[\"Right away (within the hour)\",\"Today, 4 to 7 pm\",\"Tomorrow, 10 am to 1 pm\",\"Tomorrow, 2 to 6 pm\"],\"selects\":[{\"label\":\"Programme\",\"options\":[\"Engineering (B.E.)\",\"MBA / MCA\",\"BBA / BCA / B.Com\",\"Pharmacy\",\"Nursing / Allied health / BPT\",\"Architecture / Design\",\"Not sure yet\"]}],\"submit\":\"Call me\",\"note\":\"Your number is used only for this call.\",\"done\":\"Done, {name}. A counsellor will call you at the time you picked. Anything else meanwhile? Pick a topic below.\"}</ui>",
        "next": []
      }
    }
  }
}
---
# Riya: rule-based, no AI

This bot answers ONLY from its scripted tap tree (guidedFlow above): there is no "type my own question" option, so the AI is never called. The instructions below exist only as a safety net in case a message ever reaches the AI.

If a visitor message reaches you, reply in one line that you can help best through the options, and nothing else.
