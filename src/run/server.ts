/**
 * server.ts (entry) — the command center: admin panel + Telegram bot + morning
 * scheduler. The server NEVER calls Amizone; it sends from stored snapshots.
 *
 *   ADMIN_PASSWORD=xxx TELEGRAM_BOT_TOKEN=yyy npm run server
 */

import 'dotenv/config';
import cron from 'node-cron';
import { ConfigStore } from '../lib/config.js';
import { Store } from '../lib/store.js';
import { createServer } from '../server/server.js';
import { createBot } from '../telegram/bot.js';
import { formatDrives, formatTimetable } from '../telegram/format.js';

const config = new ConfigStore();
const store = new Store();
const cfg = config.get();

const bot = cfg.botToken ? createBot(cfg.botToken, store) : null;

const app = createServer(store, config, bot);
app.listen(cfg.port, () => {
  console.log(`🛠  Admin panel:  http://localhost:${cfg.port}`);
  console.log(`   Admin password: ${cfg.adminPassword === 'admin' ? '"admin" (change it!)' : '(from config)'}`);
});

if (bot) {
  bot.start({ onStart: (me) => console.log(`✅ Bot @${me.username} running.`) });

  // Morning digest from the last snapshot the extension pushed (timetable is
  // stable, so this is accurate even if the browser is closed right now).
  cron.schedule(
    cfg.morningCron,
    async () => {
      for (const dev of store.all()) {
        if (!dev.chatId || !dev.data) continue;
        try {
          if (dev.services.timetable) {
            await bot.api.sendMessage(dev.chatId, formatTimetable(dev.data.timetable), { parse_mode: 'HTML' });
          }
          if (dev.services.drives && dev.data.drives.some((d) => d.status === 'open')) {
            await bot.api.sendMessage(dev.chatId, formatDrives(dev.data.drives), { parse_mode: 'HTML' });
          }
        } catch {
          /* skip */
        }
      }
    },
    { timezone: cfg.timezone },
  );
} else {
  console.log('⚠  No bot token set — the panel runs, but the bot is off.');
  console.log('   Set it in the admin panel (or config.json / TELEGRAM_BOT_TOKEN) and restart.');
}
