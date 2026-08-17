/** Format Amizone data as Telegram HTML messages. */

import type { Attendance as AttendanceRecord, ClassSlot, Drive as PlacementDrive } from '../lib/store.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One day's classes (default: today). */
export function formatTimetable(all: ClassSlot[], day = DAYS[new Date().getDay()]): string {
  const list = all.filter((c) => c.day.toLowerCase() === day.toLowerCase());
  if (list.length === 0) return `📅 <b>${day}</b> — no classes today 🎉`;
  return (
    `📅 <b>${day}</b>\n` +
    list.map((c) => `• ${c.time} — <b>${esc(c.courseCode)}</b> @ ${esc(c.room)}`).join('\n')
  );
}

/** The whole week, grouped by day. */
export function formatWeek(all: ClassSlot[]): string {
  if (all.length === 0) return '📅 No classes scheduled this week.';
  const lines: string[] = ['📅 <b>This week</b>'];
  for (const day of DAYS) {
    const list = all.filter((c) => c.day === day);
    if (!list.length) continue;
    lines.push(`\n<b>${day}</b>`);
    for (const c of list) lines.push(`• ${c.time} — ${esc(c.courseCode)} @ ${esc(c.room)}`);
  }
  return lines.join('\n');
}

export function formatDrives(drives: PlacementDrive[]): string {
  const open = drives.filter((d) => d.status === 'open');
  if (open.length === 0) return '💼 No open placement drives right now.';
  return (
    '💼 <b>Open placement drives</b>\n' +
    open
      .map((d) => {
        const soon = d.hoursLeft != null && d.hoursLeft <= 24 ? ` ⏰ ~${Math.round(d.hoursLeft)}h` : '';
        return `• <b>${esc(d.company)}</b> — by ${esc(d.deadline || '?')}${soon}`;
      })
      .join('\n')
  );
}

export function formatAttendance(att: AttendanceRecord[]): string {
  if (att.length === 0) return '📊 No attendance data found.';
  return (
    '📊 <b>Attendance</b>\n' +
    att
      .map((a) => {
        const flag = a.percent < 75 ? ' ⚠️' : '';
        return `• ${esc(a.course)}: ${a.attended}/${a.held} (<b>${a.percent}%</b>)${flag}`;
      })
      .join('\n')
  );
}
