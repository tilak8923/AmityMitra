# 📚 Amizon

**Your Amizone timetable, attendance & placement alerts — delivered on Telegram.**

Never miss a class, an attendance drop, or a 6–24h placement-drive window again.
A student connects once in one click; a bot pings them on Telegram.

> **Privacy-first by design:** we never store your Amizone password *or* session
> token. A browser extension reads your data locally (your browser, your IP) and
> pushes only the results to the server. Your credentials never leave your machine.

---

## ✨ Features

| Free | Premium |
| --- | --- |
| 📅 Daily timetable (08:30) | ⚡ Instant placement-drive alerts |
| 📣 New-drive digest | 🔔 Per-class reminders |
| 🔎 On-demand `/timetable`, `/week` | 🛡️ Attendance guardian + skip calculator |
| | 🚫 Present/absent alerts · 🎓 results · 📝 exams |

Admins flip any feature free↔paid and set pricing live from the panel.

---

## 🧠 How it works (the safe architecture)

Amizone's **login** is a fortress (Cloudflare + reCAPTCHA), so we never automate
it — the student logs in themselves. Everything *after* login is a normal
authenticated request, so:

```
  ┌──────────────┐   fetches data (user's browser + IP)   ┌───────────┐
  │  Extension   │ ─────────────────────────────────────► │  Amizone  │
  │ (Chrome)     │                                         └───────────┘
  └──────┬───────┘   pushes RESULTS (no cookie/password)
         │  POST /api/sync
         ▼
  ┌──────────────┐        ┌──────────────┐        ┌───────────────┐
  │   Server     │◄──────►│  Telegram    │───────►│  Student's     │
  │ (bot+panel)  │ relays │     Bot      │        │  phone         │
  └──────┬───────┘        └──────────────┘        └───────────────┘
         │ admin dashboard
         ▼
     You (admin): users, analytics, features, pricing, broadcast
```

**The server never touches Amizone** — nothing to flag, nothing to breach.

---

## 🚀 Quick start (local)

```bash
# 1. Server (admin panel + bot + scheduler)
npm install
cp .env.example .env         # fill ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN, BOT_USERNAME
npm run server               # panel at http://localhost:8787

# 2. Extension
#   - edit extension/config.js → BACKEND_URL + BOT_USERNAME
#   - chrome://extensions → Developer mode → Load unpacked → select extension/
```

Then: open the extension → **Log in to Amizone** → **Connect to Telegram** → tap
**Start**. Done. You appear in the admin panel and the bot answers `/timetable`.

`npm run demo` fetches your own data via `cookies.txt` (dev/testing only).

---

## 📦 Structure

```
src/
  amizone/     # raw-HTTP client + parsers (dev/demo)
  telegram/    # grammY bot + message formatting
  server/      # Express API + admin.html dashboard
  lib/         # config, multi-user store, crypto
  run/         # server + demo entrypoints
extension/     # Chrome MV3 extension (the user-facing connector)
docs/          # deploy guide, plan
```

---

## ☁️ Deploy

See [`docs/DEPLOY.md`](docs/DEPLOY.md). TL;DR: run the server on a small VPS
behind HTTPS (Caddy auto-TLS + pm2), point `extension/config.js` at your domain,
and publish the extension to the Chrome Web Store.

## 🔒 Security

- No Amizone passwords or session tokens on the server — ever.
- Stored data (timetable, attendance) + enrollment id only; secrets gitignored.
- Bot is per-user; admin panel is password-gated.

## 🗺️ Roadmap

Attendance/exam parser tuning · Razorpay subscriptions · referrals · SQLite/DB ·
faculty edition.

## 📄 License

MIT — see [`LICENSE`](LICENSE).
