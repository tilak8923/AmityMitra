/**
 * store.ts — multi-user store keyed by a per-browser device id.
 *
 * Flow with zero friction for users:
 *  - The extension makes a random deviceId once, and pushes data to the server
 *    under it (server never touches Amizone).
 *  - "Connect to Telegram" opens t.me/<bot>?start=<deviceId>. When the user taps
 *    Start, the bot links their chat to that deviceId. No codes, no URLs typed.
 *
 * We store data + enrollment id + name — never a password or Amizone token.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type ServiceKey = 'timetable' | 'drives' | 'attendance';

export interface ClassSlot { day: string; time: string; courseCode: string; room: string }
export interface Drive { company: string; deadline: string; status: string; hoursLeft?: number }
export interface Attendance { course: string; attended: number; held: number; percent: number }
export interface Snapshot { timetable: ClassSlot[]; drives: Drive[]; attendance: Attendance[]; syncedAt: number }

export interface Device {
  deviceId: string;
  chatId?: number; // linked Telegram chat
  amizoneId?: string;
  name?: string;
  services: Record<ServiceKey, boolean>;
  data?: Snapshot;
  seenDriveKeys?: string[];
  plan: 'free' | 'paid';
  createdAt: number;
  connectedAt?: number;
  lastActive: number;
  lastSyncAt?: number;
  syncCount: number;
}

interface Data {
  devices: Record<string, Device>;
  chatIndex: Record<string, string>; // chatId -> deviceId
  usage: Record<string, number>;
}

const svc = (): Record<ServiceKey, boolean> => ({ timetable: true, drives: true, attendance: true });
const dkey = (d: Drive) => `${d.company}|${d.deadline}`;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

export class Store {
  private d: Data;
  constructor(private file = 'users.json') {
    this.d = existsSync(file)
      ? { usage: {}, chatIndex: {}, devices: {}, ...JSON.parse(readFileSync(file, 'utf8')) }
      : { devices: {}, chatIndex: {}, usage: {} };
  }
  private save() {
    writeFileSync(this.file, JSON.stringify(this.d, null, 2));
  }

  ensureDevice(id: string): Device {
    let x = this.d.devices[id];
    if (!x) {
      x = { deviceId: id, services: svc(), plan: 'free', createdAt: Date.now(), lastActive: Date.now(), syncCount: 0 };
      this.d.devices[id] = x;
      this.save();
    }
    return x;
  }
  byDevice(id: string) {
    return this.d.devices[id];
  }
  byChat(chatId: number) {
    const id = this.d.chatIndex[chatId];
    return id ? this.d.devices[id] : undefined;
  }
  all(): Device[] {
    return Object.values(this.d.devices);
  }

  /** Bot /start <deviceId>: bind this Telegram chat to that device. */
  linkChat(deviceId: string, chatId: number, name?: string): 'ok' | 'taken' {
    const dev = this.ensureDevice(deviceId);
    if (dev.chatId && dev.chatId !== chatId) return 'taken';
    const prev = this.d.chatIndex[chatId];
    if (prev && prev !== deviceId && this.d.devices[prev]) this.d.devices[prev].chatId = undefined;
    dev.chatId = chatId;
    if (name) dev.name = name;
    dev.connectedAt = dev.connectedAt || Date.now();
    dev.lastActive = Date.now();
    this.d.chatIndex[chatId] = deviceId;
    this.save();
    return 'ok';
  }

  saveSnapshot(
    deviceId: string,
    snap: Snapshot & { amizoneId?: string; name?: string },
  ): { device: Device; newDrives: Drive[] } {
    const dev = this.ensureDevice(deviceId);
    if (snap.amizoneId) dev.amizoneId = snap.amizoneId;
    if (snap.name && !dev.name) dev.name = snap.name;
    dev.data = { timetable: snap.timetable, drives: snap.drives, attendance: snap.attendance, syncedAt: Date.now() };
    dev.lastSyncAt = Date.now();
    dev.lastActive = Date.now();
    dev.syncCount++;
    const seen = new Set(dev.seenDriveKeys || []);
    const open = snap.drives.filter((d) => d.status === 'open');
    const newDrives = open.filter((d) => !seen.has(dkey(d)));
    dev.seenDriveKeys = open.map(dkey);
    this.save();
    return { device: dev, newDrives };
  }

  toggle(chatId: number, k: ServiceKey): boolean {
    const dev = this.byChat(chatId);
    if (!dev) return false;
    dev.services[k] = !(dev.services[k] ?? true);
    this.save();
    return dev.services[k];
  }
  setPlanByChat(chatId: number, plan: 'free' | 'paid') {
    const dev = this.byChat(chatId);
    if (dev) {
      dev.plan = plan;
      this.save();
    }
  }
  touchChat(chatId: number) {
    const dev = this.byChat(chatId);
    if (dev) {
      dev.lastActive = Date.now();
      this.save();
    }
  }
  recordUsage(cmd: string) {
    this.d.usage[cmd] = (this.d.usage[cmd] || 0) + 1;
    this.save();
  }

  stats() {
    const linked = this.all().filter((d) => d.chatId);
    const dayAgo = Date.now() - 86_400_000;
    const t = day(Date.now());
    return {
      total: linked.length,
      connected: linked.filter((d) => d.data).length,
      active24h: linked.filter((d) => d.lastActive >= dayAgo).length,
      syncsToday: this.all().filter((d) => d.lastSyncAt && day(d.lastSyncAt) === t).length,
      paid: linked.filter((d) => d.plan === 'paid').length,
      staleSessions: linked.filter((d) => d.data && Date.now() - (d.lastSyncAt || 0) > 2 * 86_400_000).length,
    };
  }
  analytics() {
    const linked = this.all().filter((d) => d.chatId);
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dd = day(Date.now() - i * 86_400_000);
      days.push({ day: dd, count: linked.filter((d) => d.connectedAt && day(d.connectedAt) === dd).length });
    }
    const topCommands = Object.entries(this.d.usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cmd, count]) => ({ cmd, count }));
    return { connectsByDay: days, topCommands };
  }
}
