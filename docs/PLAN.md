# Amizon — Product & Architecture Plan

A background service that watches Amizone for students and pings them on
**Telegram** — timetable, placement drives, results, attendance, exams, fees —
so they never miss a deadline. Free basics, paid premium. Admin decides what's
free vs paid and the price.

---

## ✅ Phase 0 result — the PROVEN approach (verified 16 Aug 2026)

We tried to automate the login and hit hard walls: **Cloudflare** blocks any
program-launched browser, and the **login form now has reCAPTCHA + a JS crypto
challenge** (fields: `Salt, SecretNumber, Signature, Challenge, RecaptchaToken,
honeypot`) that only a real browser with a real human can satisfy. Fighting that
is a losing, account-risking game.

**The path that works — and it's clean:**

1. **Login: the human, in their own browser, once.** They log in normally
   (reCAPTCHA solved just by being human). No automation touches the login → no
   Cloudflare, no reCAPTCHA to beat, zero account risk.
2. **Capture the session cookie** (`.ASPXAUTH`, `ASP.NET_SessionId`).
3. **All data via plain HTTP with that cookie** — NO browser. Verified working:
   - Weekly timetable → `GET /TimeTable/Home` (HTML, parsed via `.timetable-box`
     → `.class-time`/`.course-code`/`.class-loc`). ✅ pulled a real class.
   - Attendance → on `/Academics/MyCourses` (the `13/15 (86.67%)` table).
   - Calendar events → `GET /Calendar/home/GetDiaryEvents?start=&end=` (JSON).
   - Must send the **`Referer: https://s.amizone.net/`** header — Amizone
     authenticates partly on it (learned from go-amizone).

Why this beats everything we tried: no Cloudflare (data endpoints aren't
challenged), no reCAPTCHA (only the login is), no browser-automation "content
disappears", and the cookie is captured on the user's own machine/IP — which
also answers the multiple-logins-per-IP worry.

**Open items (easy, normal building):** grab the cookie smoothly when the user
logs in; detect when it expires and nudge a re-login; parse attendance from
MyCourses; then wire to Telegram. See `src/login/apiData.mjs` for the working
proof.

---

## 1. The big picture (how the pieces fit)

```
                       ┌─────────────────────────┐
   Student ──Telegram──►      Telegram Bot        │  (the whole user experience)
   (mobile)  ◄─alerts──┤  /connect /services ...  │
                       └───────────┬─────────────┘
                                   │
   Student ──web (once)──►  Onboarding page  ──► verify Amizone login, create account
                                   │
                       ┌───────────▼─────────────┐
                       │       Backend + DB       │  users, subs, feature flags,
                       │      (Node, Postgres)    │  "last seen" snapshots
                       └───────────┬─────────────┘
                                   │ enqueues jobs
                       ┌───────────▼─────────────┐
                       │  Per-user agent / worker │  fetches Amizone by cookie
                       │  (plain HTTP, no browser)│  (raw GET/POST), diffs, notifies
                       └───────────┬─────────────┘
                                   │
                             Amizone portal
   Admin ──web dashboard──►  users • revenue • make features free/paid • broadcast
```

The Amizone reads run per-user with that user's cookie (ideally on their own
machine/IP). A small always-on piece coordinates the Telegram bot and admin.
Note the trade-off: purely per-user-machine means alerts fire when that machine
is online — revisit once the pilot proves out.

---

## 2. Answers to your 11 questions

**1. How does it log in when the user isn't there?**
The user connects once (enters their Amizone ID + password on the onboarding
page). We store the password **encrypted** and, after the first login, save the
**session cookies**. From then on the server logs in *on their behalf* in the
background. The user never has to be present.

**2. How does it monitor everything?**
A scheduler runs small jobs on a timer. Each job logs in (or reuses cookies),
opens one Amizone page (placement, results, attendance…), and compares what it
sees now to a **"last seen" snapshot** in the database. Anything *new or
changed* triggers a Telegram message. No change = stays quiet.

**3. Amizone closes the session after a while.**
Every fetch checks whether the cookie still works (a login redirect means it
expired). We can't auto-re-login (reCAPTCHA), so on expiry we simply **ping the
user to log in again** in their browser and refresh the cookie. Sessions last a
good while, so this is infrequent.

**4. Best way to launch (mobile notifications)?**
**Telegram bot — no app to build.** It works on every phone instantly, sends
push notifications, and is the control panel too (enable/disable services with
buttons). You skip the app stores entirely. The only web page users touch is a
one-time signup to connect their Amizone account.

**5. Desktop isn't worth it for users — but needed for setup/admin.**
Agreed. Keep a **minimal web app** for exactly two things: (a) student
onboarding (connect Amizone once), (b) the **admin control panel**. Everything
day-to-day happens in Telegram.

**6. Automation fully in the background.**
Users never see the scraping/login machinery. In Telegram they see **status
only** — which services are on, last check time, subscription. The "how" is
invisible.

**7. Enable/disable via Telegram.**
Yes — bot commands + inline buttons: `/services` shows a list with ✅/⬜ toggles.
(Dropping WhatsApp entirely — **Telegram only**, since it needs no phone number
and is easier.)

**8. Subscription — admin makes features paid/free, customizable.**
A **feature-flag + entitlement** system. Every feature has a tier the admin can
flip (free ↔ paid) and an optional price. If a feature gets popular, you flip it
to paid from the admin panel — no code change. Users' access is checked against
their subscription at send time.

**9. Pricing: ₹50/month or ₹500/year.**
Modelled as two plans (Monthly / Yearly). Payment via **Razorpay** (best for
India, supports UPI + recurring). A webhook flips the subscription to active on
payment and expires it when it lapses.

**10. Best services for subscribed users** — see the feature catalog in §3.

**11. Auth based on Amizone ID (no duplicates).**
The **Amizone enrollment ID is the primary key** (e.g. `A010145025196`).
Ownership is proven by a successful Amizone login during onboarding. One
account per Amizone ID — if the same ID connects again, we update, never
duplicate. The Telegram chat is just linked to that account.

---

## 3. Feature catalog (Free vs Paid — defaults; admin can change any)

**Free (hook students in):**
- 📅 Daily timetable at your chosen time (default 8:30)
- 📣 Daily digest of any urgent notice / new placement drive
- 🔎 Manual "check now" commands (`/timetable`, `/drives`)

**Paid — ₹50/mo or ₹500/yr (the premium set):**
- ⚡ **Real-time placement alerts** — pinged the moment a drive opens, with the
  exact deadline and a ⏰ if it closes within 24h (faster polling than free)
- 🤖 **Auto-apply** to companies you pre-select
- 🔔 **Per-class reminders** — 15 min before each class, with the room
- 📍 **Get-to-class nudge (geofenced, opt-in)** — uses *your own* location to
  remind you before a class; if you're away from campus at class time, a stronger
  heads-up so you don't miss the second class after coming in for the first.
  Purely to help you attend — never to mark or fake attendance.
- 🛡️ **Attendance guardian** — alert as any subject nears 75%, plus a **skip
  calculator** ("you can miss 2 more and stay above 75%")
- ✅🚫 **Attendance alert (present *or* absent)** — the moment Amizone records
  attendance for a class, you're pinged: "Marked **present** in Cloud
  Infrastructure" or "Marked **absent** in …". So you never keep reopening the
  portal to check — and you catch a *wrong* absence the same day, early enough to
  get it corrected. *How we know:* My Courses shows attendance as attended/held
  (e.g. `13/15`); we poll and diff each subject — held rises **and** attended
  rises → present; held rises but attended doesn't → absent. (We report what
  Amizone *recorded*, not physical presence — which is the number that counts.)
- 🎓 **Results instant alert** + **CGPA/GPA tracker** across semesters
- 📝 **Exam schedule alerts** + **auto admit-card** fetch & delivery
- 💳 **Fee & library-due reminders** before deadlines (dodge fines)
- ⚙️ **Custom timing & quiet hours**, **priority polling**, **weekly analytics**

---

## 4. Subscription & admin design

Database tables (concept):
- `feature` — id, name, `tier` (free/paid), `price_override`, enabled
- `plan` — Monthly (₹50), Yearly (₹500)
- `subscription` — userId, plan, status (active/expired), renewsAt
- `entitlement` — computed: which features a user can use right now
- `payment` — Razorpay ids, amount, status (for the revenue view)

Admin control panel shows: total/active users, subscribers, **MRR/revenue**,
and a **feature switchboard** to flip any feature free↔paid, set its price, or
disable it. Plus a **broadcast** button (send an urgent message to everyone —
great for a sudden big drive) and scraper-health/error logs.

---

## 5. The remaining concerns (mostly solved now)

The Phase 0 breakthrough (see top) removed the two scariest problems. What's
left is smaller.

**A) We store session cookies, NOT passwords.** Because the human logs in and we
only keep the resulting cookie, we never hold anyone's Amizone password — a much
smaller liability. Still: encrypt stored cookies at rest (AES-GCM, master key in
a secrets manager — see `src/lib/crypto.ts`), never log them, lock down the DB.
A leaked cookie only works until the user logs out / it expires, unlike a leaked
password. Be plain with users about what you store.

**B) Cloudflare is no longer fought.** We don't automate the login, so there's no
Turnstile/reCAPTCHA to beat and no bot-browser to detect. The data requests are
normal authenticated GETs. The one honest item that remains is **university
terms** — automated access at scale (and charging) could still draw pushback, so
keep the pilot low-profile and per-user (their own machine + IP), and consider
pitching the placement cell if it takes off.

**C) IP clustering — solved by design.** Running each user's fetches on *their*
machine (their cookie, their IP) means Amizone never sees many accounts from one
address. That's the per-user-agent model, which the cookie approach makes
natural.

Smaller ones: Amizone changes its HTML → scrapers break, so add health checks
and keep selectors easy to update; payments need a registered payee + refund
policy.

---

## 6. Faculty edition (Phase 4 — after students works)

Faculty use a **different portal** (`faculty.amizone.net`) with different pages
(attendance marking, student lists, class schedules, feedback). So it's a
separate login flow + dashboard, not a reskin. Plan: prove the student product
first, then **contact a few faculty, demo it, collect feedback**, and tailor.
Likely faculty features: reminders to mark attendance, quick student/section
lookups, schedule at a glance, feedback summaries. Their cooperation also helps
with problem (B) above.

---

## 7. Extra ideas (building on yours)

- 🎁 **Referrals** — invite a friend, both get a free month (cheap growth on campus)
- 📢 **Admin broadcast** — one message to all users for a sudden major drive
- 📆 **Google Calendar sync** — push timetable/exams to their calendar
- ⏳ **Exam countdown** and **notice/event digest** (Amizone's notices page)
- 👥 **Section/hostel groups** — targeted announcements
- 📊 **Anonymous campus stats** (opt-in) — "78% of CSE applied to X" (fun, sticky)

---

## 8. Suggested roadmap

- **Phase 0 (now):** get your own login working end-to-end on your Mac; one real
  8:30 send to yourself. Proves the hardest bit (login + Cloudflare).
- **Phase 1 (free MVP):** Telegram bot + onboarding + timetable + placement
  alerts, hosted on a VPS, for a small pilot of friends. No payments yet.
- **Phase 2:** results/attendance/exam monitoring; subscriptions + Razorpay;
  admin feature switchboard.
- **Phase 3:** polish, referrals, scale; approach the university.
- **Phase 4:** faculty edition.

---

## 9. Decisions locked

- **Payments:** Razorpay (INR, UPI + recurring). Wired in Phase 2, not the pilot.
- **Permission:** pilot quietly first; approach the placement cell only once it's
  clearly popular and worth it.
- **Hosting (recommended):** start on **Oracle Cloud Always Free** (a generous
  ARM box, ₹0 — enough to run the app, Postgres, a headed Chromium via xvfb, and
  the Telegram webhook). If it gets flaky or you outgrow it, move to a
  **Hetzner CX22 (~₹380/mo)** or a DigitalOcean $6 droplet. Either way it's one
  small always-on server — that's what delivers 8:30 pings with laptops closed.
- **Currency:** ₹ INR.

> Pilot-security note: even a 20-person pilot holds real Amizone passwords, so
> keep the encryption on from day one (already in `src/lib/crypto.ts`). That's
> the one non-negotiable even at small scale.

## 10. Pilot MVP (the first thing to actually build)

Smallest version that delivers real value **and** tests the hard parts (login at
scale, Cloudflare, session refresh):

- **Onboarding page:** enter Amizone ID + password → verified by a real login →
  account created → shows a code to link Telegram.
- **Telegram bot:** `/start` + link code, `/services` (toggle Timetable + Drives),
  `/timetable` and `/drives` (check now), `/status`.
- **Two live features:** daily **timetable at 8:30**, and **placement-drive
  alerts** (checked ~every 20 min, ping on a newly-open drive with its deadline).
- **All free during the pilot** — no payments yet.
- Encrypted credentials; hosted on the free/cheap VPS.

Everything else (attendance, results, exams, subscriptions, admin billing,
faculty) comes *after* the pilot proves the login + delivery hold up.

**Locked:** pilot = Timetable + Drives, free. Rollout decided at build time.

## 11. Pilot build blueprint (ready to execute)

**Core (built):** `src/amizone/` — `AmizoneClient` (session cookie + typed
fetch), `parse.ts` (HTML → data), `types.ts`. Plain HTTP, no browser, no deps.

**Stack (to add):** **grammY** for the Telegram bot, **node-cron** for the
scheduler, a small store (SQLite/Postgres). NO Playwright, NO headless browser,
NO xvfb — all gone.

**Data model (MVP):**
- `User` — `amizoneId` (unique key), encrypted **session cookie** (no password),
  `telegramChatId`, role, timestamps
- `ServiceToggle` — userId, service (`timetable` | `drives`), enabled, config
- `Snapshot` — userId, feature, key (e.g. a drive's company+deadline) → detects
  *new* items
- `NotificationLog` — userId, text, sentAt

**Onboarding flow (cookie-based):**
1. User logs into Amizone in their own browser (reCAPTCHA solved by them).
2. A helper grabs the session cookie (a bookmarklet / tiny extension / paste).
3. Store the encrypted cookie under their `amizoneId`; link Telegram via a code.
4. When a fetch hits the login redirect → cookie expired → ping "please log in
   again" instead of trying to auto-login.

**Telegram commands:** `/start <code>` (link), `/services` (toggle buttons),
`/timetable`, `/drives` (check now), `/status`, `/help`.

**Polling cadence:** timetable fetched ~daily (sent 8:30); drives ~every 20 min,
diffed against `Snapshot`, ping only on a newly-open drive. All plain HTTP.

**Build order:**
1. **Phase 0 — DONE.** Raw-HTTP client reads real timetable + drives (`npm run demo`).
2. Cookie-capture helper + expiry detection.
3. Tune attendance/profile/exam parsers against live markup.
4. Small store + `Snapshot` diffing.
5. Telegram bot (link, toggles, check-now, status, alerts).
6. Scheduler (daily timetable + 20-min drive checks).
7. Package as a per-user agent (runs on the student's machine + IP).
