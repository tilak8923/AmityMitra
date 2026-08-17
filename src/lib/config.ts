/**
 * config.ts — the admin-owned configuration (the "command" settings).
 * Persisted to config.json; editable live from the admin panel.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface Feature {
  key: string;
  label: string;
  tier: 'free' | 'paid';
}

export interface Config {
  botToken: string;
  botUsername: string; // without @, used for the t.me deep link
  adminPassword: string;
  morningCron: string; // e.g. "30 8 * * *"
  timezone: string;
  port: number;
  pricing: { monthly: number; yearly: number };
  features: Feature[];
}

const DEFAULT: Config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  botUsername: process.env.BOT_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  morningCron: '30 8 * * *',
  timezone: 'Asia/Kolkata',
  port: Number(process.env.PORT || 8787),
  pricing: { monthly: 50, yearly: 500 },
  features: [
    { key: 'timetable', label: 'Daily timetable', tier: 'free' },
    { key: 'drives', label: 'Placement alerts', tier: 'free' },
    { key: 'attendance', label: 'Attendance guardian', tier: 'paid' },
    { key: 'results', label: 'Results alert', tier: 'paid' },
    { key: 'exams', label: 'Exam schedule + admit card', tier: 'paid' },
  ],
};

export class ConfigStore {
  private cfg: Config;
  constructor(private file = 'config.json') {
    this.cfg = existsSync(file)
      ? { ...DEFAULT, ...JSON.parse(readFileSync(file, 'utf8')) }
      : { ...DEFAULT };
    if (!existsSync(file)) this.save();
  }
  get(): Config {
    return this.cfg;
  }
  update(patch: Partial<Config>): Config {
    this.cfg = { ...this.cfg, ...patch };
    this.save();
    return this.cfg;
  }
  setFeatureTier(key: string, tier: 'free' | 'paid') {
    const f = this.cfg.features.find((x) => x.key === key);
    if (f) {
      f.tier = tier;
      this.save();
    }
  }
  private save() {
    writeFileSync(this.file, JSON.stringify(this.cfg, null, 2));
  }
}
