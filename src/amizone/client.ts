/**
 * client.ts — read Amizone data over plain HTTP using a session cookie.
 *
 * The human logs into Amizone in their own browser (once); we take the session
 * cookie (.ASPXAUTH + ASP.NET_SessionId) and reuse it. No browser, no Cloudflare,
 * no reCAPTCHA — those only guard the login, which we never automate.
 *
 * IMPORTANT: Amizone authenticates partly on the `Referer` header, so we always
 * send it (learned from the go-amizone project).
 */

import { parseAttendance, parsePlacement, parseTimetable } from './parse.js';
import type { AttendanceRecord, ClassSlot, PlacementDrive } from './types.js';

const BASE = 'https://s.amizone.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0';

export interface FetchResult {
  status: number;
  redirectedToLogin: boolean;
  text: string;
}

export class AmizoneClient {
  /** cookieHeader like ".ASPXAUTH=...; ASP.NET_SessionId=..." */
  private constructor(private readonly cookieHeader: string) {}

  /** Build from a name→value cookie map (must include .ASPXAUTH). */
  static fromCookies(cookies: Record<string, string>): AmizoneClient {
    const header = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    return new AmizoneClient(header);
  }

  private async get(path: string): Promise<FetchResult> {
    const res = await fetch(BASE + path, {
      headers: {
        'User-Agent': UA,
        Referer: BASE + '/',
        Cookie: this.cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'manual',
    });
    const loc = res.headers.get('location') || '';
    const text = await res.text();
    const redirectedToLogin =
      /login|^\/$/.test(loc) || /name="_Password"|RecaptchaToken/i.test(text);
    return { status: res.status, redirectedToLogin, text };
  }

  /** True if the stored cookie is still a valid, logged-in session. */
  async isSessionValid(): Promise<boolean> {
    const r = await this.get('/Home');
    return r.status === 200 && !r.redirectedToLogin;
  }

  /** The weekly class timetable (all days). */
  async getTimetable(): Promise<ClassSlot[]> {
    const r = await this.get('/TimeTable/Home');
    if (r.redirectedToLogin) throw new SessionExpiredError();
    return parseTimetable(r.text);
  }

  /** Placement / company drives with deadlines and status. */
  async getPlacementDrives(): Promise<PlacementDrive[]> {
    const r = await this.get('/Placement/PlacementDetails');
    if (r.redirectedToLogin) throw new SessionExpiredError();
    return parsePlacement(r.text);
  }

  /** Attendance per course (best-effort; page markup may need tuning). */
  async getAttendance(): Promise<AttendanceRecord[]> {
    const r = await this.get('/Academics/MyCourses');
    if (r.redirectedToLogin) throw new SessionExpiredError();
    return parseAttendance(r.text);
  }

  /** Raw HTML for any authenticated page — handy while mapping new endpoints. */
  async raw(path: string): Promise<FetchResult> {
    return this.get(path);
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Amizone session expired — the user needs to log in again to refresh the cookie.');
    this.name = 'SessionExpiredError';
  }
}
