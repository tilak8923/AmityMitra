/**
 * demo.ts — read your Amizone data over plain HTTP.
 *
 *   npm run demo
 *
 * Reads cookies.txt (your current session cookies, at least .ASPXAUTH and
 * ASP.NET_SessionId), then prints your timetable, placement drives and
 * attendance. No browser. When the session expires, log into Amizone in your
 * browser and refresh cookies.txt.
 */

import { AmizoneClient, SessionExpiredError } from '../amizone/client.js';
import { loadCookiesFromFile } from '../amizone/cookies.js';

async function main() {
  const client = AmizoneClient.fromCookies(loadCookiesFromFile());

  if (!(await client.isSessionValid())) {
    console.error('❌ Session expired — log into Amizone in your browser and refresh cookies.txt.');
    process.exit(2);
  }
  console.log('✅ Session valid.\n');

  const tt = await client.getTimetable();
  console.log(`📅 Timetable — ${tt.length} class(es) this week`);
  for (const c of tt) console.log(`   ${c.day.padEnd(10)} ${c.time} — ${c.courseCode} @ ${c.room}`);

  const drives = await client.getPlacementDrives();
  const open = drives.filter((d) => d.status === 'open');
  const applied = drives.filter((d) => d.status === 'applied').length;
  console.log(`\n💼 Placement — ${drives.length} drives, ${open.length} open, ${applied} applied`);
  for (const d of open) {
    const soon = d.hoursLeft != null && d.hoursLeft <= 24 ? ` ⏰ ~${Math.round(d.hoursLeft)}h` : '';
    console.log(`   OPEN  ${d.company} — by ${d.deadline || '?'}${soon}`);
  }

  const att = await client.getAttendance();
  console.log(`\n📊 Attendance — ${att.length} subject(s)`);
  for (const a of att) console.log(`   ${a.course}: ${a.attended}/${a.held} (${a.percent}%)`);
}

main().catch((e) => {
  console.error(e instanceof SessionExpiredError ? e.message : e);
  process.exit(1);
});
