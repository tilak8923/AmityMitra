/**
 * amizone.js — fetch + parse Amizone data from inside the user's browser.
 *
 * Runs in the extension (which has host access to s.amizone.net), so requests
 * carry the user's own session cookie and come from their own IP — invisible to
 * Amizone's anti-bot. The declarativeNetRequest rule adds the Referer header
 * that Amizone needs. No password, no login automation.
 */

const BASE = 'https://s.amizone.net';

async function getText(path) {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const text = await res.text();
  if (/name="_Password"|RecaptchaToken/i.test(text)) {
    const e = new Error('SESSION_EXPIRED');
    e.code = 'SESSION_EXPIRED';
    throw e;
  }
  return text;
}

/** Read the session cookies (to send to the server for 24/7 gap coverage). */
export async function getSessionCookies() {
  const jar = {};
  for (const name of ['.ASPXAUTH', 'ASP.NET_SessionId']) {
    const c = await chrome.cookies.get({ url: BASE + '/', name });
    if (c) jar[name] = c.value;
  }
  return jar;
}

export async function isLoggedIn() {
  const jar = await getSessionCookies();
  return !!jar['.ASPXAUTH'];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function getTimetable() {
  const html = await getText('/TimeTable/Home');
  const markers = [];
  const dre = /\bid="(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)"/gi;
  let dm;
  while ((dm = dre.exec(html))) markers.push({ day: dm[1], pos: dm.index });
  const out = [];
  const blockRe =
    /timetable-box[\s\S]*?class-time[^>]*>([^<]*)<[\s\S]*?course-code[^>]*>([^<]*)<[\s\S]*?class-loc[^>]*>([^<]*)</gi;
  let m;
  while ((m = blockRe.exec(html))) {
    let day = '?';
    for (const mk of markers) {
      if (mk.pos < m.index) day = mk.day;
      else break;
    }
    out.push({ day, time: m[1].trim(), courseCode: m[2].trim(), room: m[3].trim() });
  }
  out.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  return out;
}

export async function getPlacementDrives() {
  const html = await getText('/Placement/PlacementDetails');
  const out = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(html))) {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    if (cells.length < 5 || !cells[1]) continue;
    const action = cells[cells.length - 1].toLowerCase();
    let status = 'unknown';
    if (/applied/.test(action)) status = 'applied';
    else if (/closed/.test(action)) status = 'closed';
    else if (/apply|register/.test(action)) status = 'open';
    out.push({ company: cells[1], deadline: cells[3] || '', status });
  }
  return out;
}

export async function getAttendance() {
  const html = await getText('/Academics/MyCourses');
  const out = [];
  const re = /([A-Z]{2,}\d{2,}[A-Z]?)[\s\S]{0,600}?(\d+)\s*\/\s*(\d+)\s*\(\s*(\d+(?:\.\d+)?)\s*%\)/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ course: m[1], attended: +m[2], held: +m[3], percent: +m[4] });
  }
  return out;
}

/** Identity: enrollment id (and name if we can spot it) from the Home header. */
export async function getProfile() {
  const html = await getText('/Home');
  const amizoneId = (html.match(/A\d{10,}/) || [])[0] || '';
  const name = (html.match(/([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)+)\s*<[^>]*>\s*A\d{10}/) || [])[1] || '';
  return { amizoneId, name };
}

/** Everything the server needs in one push. Throws if the session expired. */
export async function getAll() {
  const timetable = await getTimetable(); // throws SESSION_EXPIRED if logged out
  const [drives, attendance, profile] = await Promise.all([
    getPlacementDrives().catch(() => []),
    getAttendance().catch(() => []),
    getProfile().catch(() => ({ amizoneId: '', name: '' })),
  ]);
  return { amizoneId: profile.amizoneId, name: profile.name, timetable, drives, attendance };
}
