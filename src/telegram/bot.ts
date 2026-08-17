/**
 * bot.ts — the multi-user Telegram bot.
 *
 * Serves each user from the latest snapshot the extension pushed (the server
 * never fetches Amizone). New users /connect to get a code for the extension.
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { Device, ServiceKey, Store } from '../lib/store.js';
import { formatAttendance, formatDrives, formatTimetable, formatWeek } from './format.js';

const LABELS: Record<ServiceKey, string> = {
  timetable: '📅 Daily timetable',
  drives: '💼 Placement alerts',
  attendance: '📊 Attendance guardian',
};

function servicesKeyboard(d: Device): InlineKeyboard {
  const kb = new InlineKeyboard();
  (Object.keys(LABELS) as ServiceKey[]).forEach((k) => {
    kb.text(`${d.services[k] ? '✅' : '⬜'} ${LABELS[k]}`, `toggle:${k}`).row();
  });
  return kb;
}

const ago = (t?: number) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

const NOT_LINKED =
  '👋 Welcome! To connect, install the <b>Amizon Connect</b> Chrome extension, ' +
  'log into Amizone, and tap <b>Connect to Telegram</b> in it. (Don’t send /start yourself.)';

export function createBot(token: string, store: Store): Bot {
  const bot = new Bot(token);

  // Reply from the stored snapshot, or nudge to connect / sync.
  const reply = (cmd: string, fn: (d: Device) => string) => async (ctx: any) => {
    store.recordUsage(cmd);
    const dev = store.byChat(ctx.chat.id);
    if (!dev) return ctx.reply(NOT_LINKED, { parse_mode: 'HTML' });
    store.touchChat(ctx.chat.id);
    if (!dev.data) {
      return ctx.reply('⏳ No data yet — open Chrome (logged into Amizone) so the extension can sync.', {
        parse_mode: 'HTML',
      });
    }
    await ctx.reply(fn(dev), { parse_mode: 'HTML' });
  };

  // Deep link: /start <deviceId> links this chat to that browser.
  bot.command('start', async (ctx) => {
    const deviceId = (ctx.match || '').trim();
    if (deviceId) {
      const r = store.linkChat(deviceId, ctx.chat.id, ctx.from?.first_name);
      if (r === 'taken') {
        await ctx.reply('That device is already linked to another Telegram account.');
      } else {
        await ctx.reply(
          '✅ <b>Connected!</b> Your Amizone will sync automatically.\n\n' +
            '/timetable /week /drives /attendance /services /status',
          { parse_mode: 'HTML' },
        );
      }
      return;
    }
    const dev = store.byChat(ctx.chat.id);
    await ctx.reply(
      dev
        ? '👋 You’re connected.\n\n/timetable /week /drives /attendance /services /status'
        : NOT_LINKED,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('timetable', reply('timetable', (d) => formatTimetable(d.data!.timetable)));
  bot.command('week', reply('week', (d) => formatWeek(d.data!.timetable)));
  bot.command('drives', reply('drives', (d) => formatDrives(d.data!.drives)));
  bot.command('attendance', reply('attendance', (d) => formatAttendance(d.data!.attendance)));

  bot.command('services', async (ctx) => {
    const dev = store.byChat(ctx.chat.id);
    if (!dev) return ctx.reply(NOT_LINKED, { parse_mode: 'HTML' });
    await ctx.reply('Toggle your alerts:', { reply_markup: servicesKeyboard(dev) });
  });

  bot.callbackQuery(/^toggle:(timetable|drives|attendance)$/, async (ctx) => {
    const key = ctx.match[1] as ServiceKey;
    store.toggle(ctx.chat!.id, key);
    await ctx.answerCallbackQuery(`${LABELS[key]} toggled`);
    const dev = store.byChat(ctx.chat!.id);
    if (dev) await ctx.editMessageReplyMarkup({ reply_markup: servicesKeyboard(dev) });
  });

  bot.command('status', async (ctx) => {
    store.recordUsage('status');
    const dev = store.byChat(ctx.chat.id);
    if (!dev) return ctx.reply(NOT_LINKED, { parse_mode: 'HTML' });
    const conn = dev.data ? `✅ connected · last sync ${ago(dev.lastSyncAt)}` : '⏳ waiting for first sync (open Chrome)';
    const on = (Object.keys(dev.services) as ServiceKey[]).filter((k) => dev.services[k]).map((k) => LABELS[k]);
    await ctx.reply(`<b>Status</b>\nAmizone: ${conn}\nPlan: ${dev.plan}\nAlerts: ${on.join(', ') || 'none'}`, {
      parse_mode: 'HTML',
    });
  });

  bot.catch((err) => console.error('[bot] error:', err.error));
  return bot;
}
