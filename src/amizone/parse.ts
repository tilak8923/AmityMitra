/**
 * parse.ts — turn Amizone HTML into structured data.
 *
 * Regex-based (no DOM dependency) and matched against the live markup mapped on
 * 16 Aug 2026. Each parser is small and isolated so it's easy to re-tune when a
 * page's markup shifts.
 */

import type { AttendanceRecord, ClassSlot, DriveStatus, PlacementDrive } from './types.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Weekly timetable (/TimeTable/Home). The page renders one <div id="<Day>">
 * panel per day, each containing `.timetable-box` blocks:
 *   <p class="class-time">14:15 to 15:10</p>
 *   <p class="course-code">PFE701</p>
 *   <p class="course-teacher">Group : X <br> Faculty : <b>Dr Y (id)</b></p>
 *   <p class="class-loc">I2 - 202</p>
 */
export function parseTimetable(html: string): ClassSlot[] {
  const markers: { day: string; pos: number }[] = [];
  const dre = /\bid="(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)"/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dre.exec(html))) markers.push({ day: dm[1], pos: dm.index });

  const out: ClassSlot[] = [];
  const blockRe =
    /timetable-box[\s\S]*?class-time[^>]*>([^<]*)<[\s\S]*?course-code[^>]*>([^<]*)<[\s\S]*?(?:course-teacher[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?class-loc[^>]*>([^<]*)</gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    let day = '?';
    for (const mk of markers) {
      if (mk.pos < m.index) day = mk.day;
      else break;
    }
    const teacherRaw = (m[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const time = m[1].trim();
    out.push({
      day,
      time,
      startTime: time.match(/\d{1,2}[:.]\d{2}/)?.[0],
      courseCode: m[2].trim(),
      room: m[4].trim(),
      group: teacherRaw.match(/Group\s*:\s*(.*?)(?:Faculty|$)/i)?.[1]?.trim() || undefined,
      faculty: teacherRaw.match(/Faculty\s*:\s*(.+)$/i)?.[1]?.trim() || undefined,
    });
  }
  out.sort(
    (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || (a.startTime || '').localeCompare(b.startTime || ''),
  );
  return out;
}

/**
 * Placement drives (/Placement/PlacementDetails). Table columns:
 *   Sr | Company | Reg Start | Reg End (deadline) | Details | Action(status)
 */
export function parsePlacement(html: string): PlacementDrive[] {
  const out: PlacementDrive[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html))) {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    if (cells.length < 5) continue;
    const company = cells[1];
    if (!company) continue;
    const deadline = cells[3];
    const actionText = cells[cells.length - 1].toLowerCase();
    let status: DriveStatus = 'unknown';
    if (/applied/.test(actionText)) status = 'applied';
    else if (/closed/.test(actionText)) status = 'closed';
    else if (/apply|register/.test(actionText)) status = 'open';
    const hoursLeft = status === 'open' ? hoursUntil(deadline) : undefined;
    out.push({
      company,
      startDate: cells[2] || undefined,
      deadline: deadline || undefined,
      status,
      hoursLeft: hoursLeft ?? undefined,
    });
  }
  return out;
}

/**
 * Attendance — the "13 / 15 (86.67%)" cells shown per course. Works on whatever
 * page carries them; pair the percentage with the nearest preceding course code.
 */
export function parseAttendance(html: string): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  const re = /([A-Z]{2,}\d{2,}[A-Z]?)[\s\S]{0,600}?(\d+)\s*\/\s*(\d+)\s*\(\s*(\d+(?:\.\d+)?)\s*%\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({
      course: m[1],
      attended: parseInt(m[2], 10),
      held: parseInt(m[3], 10),
      percent: parseFloat(m[4]),
    });
  }
  return out;
}

/** Parse Amizone's "DD/MM/YYYY hh:mm AM/PM" into hours-from-now (or null). */
export function hoursUntil(deadline: string | undefined): number | null {
  if (!deadline) return null;
  const m = deadline.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  const [, dd, mm, yyyy, hhRaw, min, ap] = m;
  let hh = parseInt(hhRaw, 10);
  if (ap) {
    if (ap.toUpperCase() === 'PM' && hh < 12) hh += 12;
    if (ap.toUpperCase() === 'AM' && hh === 12) hh = 0;
  }
  const when = new Date(+yyyy, +mm - 1, +dd, hh, +min).getTime();
  return (when - Date.now()) / 3_600_000;
}
