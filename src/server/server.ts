/**
 * server.ts — the command center's HTTP layer. The server NEVER calls Amizone.
 *
 *  - POST /api/sync          (extension) {deviceId, amizoneId, name, ...data}
 *  - GET  /api/device-status?deviceId=…  (extension popup) is this device linked?
 *  - /api/admin/*            admin dashboard APIs (Bearer = admin password)
 *  - GET /                   serves the admin dashboard
 *
 * Linking to Telegram happens in the bot via /start <deviceId> (deep link).
 */

import type { Bot } from 'grammy';
import express, { type NextFunction, type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigStore } from '../lib/config.js';
import type { Drive, Store, Device } from '../lib/store.js';

const here = dirname(fileURLToPath(import.meta.url));

function driveAlert(drives: Drive[]): string {
  return (
    '🚨 <b>New placement drive(s) open!</b>\n' +
    drives
      .map((d) => {
        const soon = d.hoursLeft != null && d.hoursLeft <= 24 ? ` ⏰ ~${Math.round(d.hoursLeft)}h` : '';
        return `• <b>${d.company}</b> — apply by ${d.deadline || 'soon'}${soon}`;
      })
      .join('\n')
  );
}

export function createServer(store: Store, config: ConfigStore, bot: Bot | null) {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // CORS so the browser extension can reach the server.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'content-type,authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (_req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Extension pushes fresh data (keyed by its deviceId). Server stores it.
  app.post('/api/sync', (req: Request, res: Response) => {
    const { deviceId, amizoneId, name, timetable, drives, attendance } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId.' });
    const { device, newDrives } = store.saveSnapshot(String(deviceId), {
      amizoneId,
      name,
      timetable: Array.isArray(timetable) ? timetable : [],
      drives: Array.isArray(drives) ? drives : [],
      attendance: Array.isArray(attendance) ? attendance : [],
      syncedAt: Date.now(),
    });
    if (bot && device.chatId && newDrives.length && device.services.drives) {
      bot.api.sendMessage(device.chatId, driveAlert(newDrives), { parse_mode: 'HTML' }).catch(() => {});
    }
    res.json({ ok: true, linked: !!device.chatId });
  });

  // Popup asks: is my device linked to a Telegram user yet?
  app.get('/api/device-status', (req: Request, res: Response) => {
    const dev = store.byDevice(String(req.query.deviceId || ''));
    res.json({ linked: !!dev?.chatId, lastSyncAt: dev?.lastSyncAt || null });
  });

  // --- Admin auth ---
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const pw = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (pw !== config.get().adminPassword) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };

  app.post('/api/admin/login', (req: Request, res: Response) => {
    if (req.body?.password === config.get().adminPassword) return res.json({ ok: true });
    res.status(401).json({ error: 'Wrong password' });
  });

  app.get('/api/admin/state', auth, (_req: Request, res: Response) => {
    const cfg = config.get();
    res.json({
      stats: store.stats(),
      analytics: store.analytics(),
      botRunning: !!bot,
      users: store
        .all()
        .filter((d: Device) => d.chatId)
        .map((d: Device) => ({
          amizoneId: d.amizoneId,
          name: d.name,
          plan: d.plan,
          chatId: d.chatId,
          connected: !!d.data,
          lastSyncAt: d.lastSyncAt,
          syncCount: d.syncCount,
          stale: !!d.data && Date.now() - (d.lastSyncAt || 0) > 2 * 86_400_000,
        })),
      config: {
        botTokenMasked: cfg.botToken ? cfg.botToken.slice(0, 6) + '…' + cfg.botToken.slice(-4) : '(not set)',
        botUsername: cfg.botUsername || '(set botUsername)',
        morningCron: cfg.morningCron,
        timezone: cfg.timezone,
        pricing: cfg.pricing,
        features: cfg.features,
        port: cfg.port,
      },
    });
  });

  app.post('/api/admin/config', auth, (req: Request, res: Response) => {
    const allowed: Record<string, unknown> = {};
    for (const k of ['botToken', 'botUsername', 'adminPassword', 'morningCron', 'timezone', 'pricing'] as const) {
      if (req.body?.[k] !== undefined) allowed[k] = req.body[k];
    }
    config.update(allowed);
    res.json({ ok: true, note: 'Bot token / password changes apply on restart.' });
  });

  app.post('/api/admin/feature', auth, (req: Request, res: Response) => {
    const { key, tier } = req.body || {};
    if (!key || !['free', 'paid'].includes(tier)) return res.status(400).json({ error: 'bad input' });
    config.setFeatureTier(key, tier);
    res.json({ ok: true });
  });

  app.post('/api/admin/user/plan', auth, (req: Request, res: Response) => {
    const { chatId, plan } = req.body || {};
    if (!chatId || !['free', 'paid'].includes(plan)) return res.status(400).json({ error: 'bad input' });
    store.setPlanByChat(Number(chatId), plan);
    res.json({ ok: true });
  });

  app.post('/api/admin/broadcast', auth, async (req: Request, res: Response) => {
    const text = String(req.body?.text || '').trim();
    const segment = String(req.body?.segment || 'all');
    if (!text) return res.status(400).json({ error: 'empty' });
    const dayAgo = Date.now() - 86_400_000;
    const targets = store.all().filter((d) => {
      if (!d.chatId) return false;
      if (segment === 'paid') return d.plan === 'paid';
      if (segment === 'free') return d.plan === 'free';
      if (segment === 'inactive') return (d.lastActive || 0) < dayAgo;
      return true;
    });
    let sent = 0;
    if (bot) {
      for (const d of targets) {
        try {
          await bot.api.sendMessage(d.chatId!, '📢 ' + text);
          sent++;
        } catch {
          /* skip */
        }
      }
    }
    res.json({ sent, targeted: targets.length });
  });

  app.get('/', (_req: Request, res: Response) =>
    res.type('html').send(readFileSync(join(here, 'admin.html'), 'utf8')),
  );

  return app;
}
