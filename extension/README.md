# Amizon Connect (browser extension)

The one-click "connect" piece. It runs inside your own Chrome, so it reads your
Amizone data using your real session and IP — no password, no login automation,
nothing for Amizone's anti-bot to catch.

## Load it (development)

1. Open **chrome://extensions**
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this `extension/` folder
4. Pin the extension, log into **s.amizone.net**, then click the extension icon

The popup shows your login status. Hit **Show my timetable** — it fetches your
schedule right there in the browser (proving the hybrid client works). Once the
server side exists, enter your server URL + the link code from the Telegram bot
and hit **Connect**.

## What it does

- Detects your Amizone session (`cookies` permission).
- Fetches `/TimeTable/Home`, `/Placement/PlacementDetails` etc. from your browser
  (`host_permissions` + a `declarativeNetRequest` rule that adds the `Referer`
  header Amizone requires).
- Every ~20 min (while Chrome is open) it can push your cookie to your server so
  the server covers the times your browser is closed (the "hybrid" model).

## Publishing (later)

Zip this folder and upload to the Chrome Web Store ($5 one-time dev account) so
students get a real "Add to Chrome" button.

## Files

- `manifest.json` — MV3 config + permissions
- `rules.json` — adds the Referer header to Amizone requests
- `amizone.js` — fetch + parse (browser version of the client)
- `background.js` — periodic sync service worker
- `popup.html` / `popup.js` — the connect UI
