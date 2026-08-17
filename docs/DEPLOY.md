# Deploying Amizon

Two things go live: the **server** (bot + admin panel + API) and the
**extension** (in each user's browser). The server must be reachable over
**HTTPS** in production, because the published extension can't call `http://`.

## 1. Server — small VPS (recommended)

A ₹350–600/mo VPS (Hetzner CX22, DigitalOcean $6, or Oracle Cloud Always Free)
gives you a persistent disk (so `users.json` / `config.json` survive restarts).

```bash
# on the VPS (Ubuntu)
sudo apt update && sudo apt install -y nodejs npm
git clone <your-repo> amizon && cd amizon
npm install
cp .env.example .env && nano .env      # ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN, BOT_USERNAME

# keep it running with pm2
sudo npm i -g pm2
pm2 start "npm run server" --name amizon
pm2 save && pm2 startup                 # restart on reboot
```

### HTTPS with Caddy (auto-TLS, one file)

Point a domain (e.g. `api.yourdomain.com`) at the VPS, then:

```
# /etc/caddy/Caddyfile
api.yourdomain.com {
    reverse_proxy localhost:8787
}
```

`sudo systemctl reload caddy` — you now have `https://api.yourdomain.com`, with
certificates handled automatically.

> Alternative platforms: **Railway / Render / Fly.io** deploy from git and give
> HTTPS for free — but attach a **persistent volume** for the JSON files, or
> they reset on redeploy. (Longer term, swap the JSON store for SQLite/Postgres.)

## 2. Point the extension at the server

In `extension/config.js`:

```js
export const BACKEND_URL = 'https://api.yourdomain.com';
export const BOT_USERNAME = 'AmityMitra_bot';
```

And in `extension/manifest.json`, add your host so the extension may call it:

```json
"host_permissions": [
  "https://s.amizone.net/*",
  "https://api.yourdomain.com/*"
]
```

## 3. Publish the extension

- **Pilot:** share the `extension/` folder; friends use *Load unpacked*.
- **Public:** zip `extension/`, pay the one-time \$5 Chrome Web Store dev fee,
  and upload. Users then get a real **Add to Chrome** button.

## 4. Go-live checklist

- [ ] Strong `ADMIN_PASSWORD`
- [ ] Bot token set; `BOT_USERNAME` matches the real bot
- [ ] Server on HTTPS; domain in `config.js` + `manifest.json`
- [ ] `config.json`, `users.json`, `.env`, `cookies.txt` are gitignored (they are)
- [ ] pm2 `startup` configured so it survives reboots
