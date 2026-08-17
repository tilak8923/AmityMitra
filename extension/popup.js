import { getTimetable, isLoggedIn } from './amizone.js';
import { BACKEND_URL, BOT_USERNAME } from './config.js';

const $ = (id) => document.getElementById(id);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getDeviceId = () =>
  new Promise((r) => chrome.runtime.sendMessage({ type: 'get-device' }, (res) => r(res?.deviceId)));

async function refresh() {
  const loggedIn = await isLoggedIn().catch(() => false);
  $('amizStatus').innerHTML = loggedIn
    ? '<span class="ok">✅ Logged into Amizone</span>'
    : '<span class="bad">⬜ Not logged into Amizone</span>';
  $('loginBtn').style.display = loggedIn ? 'none' : 'block';

  const id = await getDeviceId();
  let linked = false;
  try {
    const r = await fetch(BACKEND_URL.replace(/\/$/, '') + '/api/device-status?deviceId=' + id);
    const j = await r.json();
    linked = j.linked;
  } catch { /* server may be offline */ }
  $('tgStatus').innerHTML = linked
    ? '<span class="ok">✅ Connected to Telegram</span>'
    : '<span class="bad">⬜ Not connected to Telegram</span>';
  $('connectBtn').textContent = linked ? '💬 Reconnect Telegram' : '💬 Connect to Telegram';

  if (loggedIn) {
    try {
      const tt = await getTimetable();
      const today = DAYS[new Date().getDay()];
      const list = tt.filter((c) => c.day === today);
      $('preview').style.display = 'block';
      $('preview').textContent = list.length
        ? '📅 Today\n' + list.map((c) => `• ${c.time} — ${c.courseCode} @ ${c.room}`).join('\n')
        : '📅 No classes today 🎉';
    } catch { /* session may be expired */ }
  }
}

$('loginBtn').addEventListener('click', () => chrome.tabs.create({ url: 'https://s.amizone.net/' }));

$('connectBtn').addEventListener('click', async () => {
  const id = await getDeviceId();
  chrome.runtime.sendMessage({ type: 'sync-now' }, () => {}); // push data so it's ready
  chrome.tabs.create({ url: `https://t.me/${BOT_USERNAME}?start=${id}` });
});

$('syncBtn').addEventListener('click', () => {
  $('syncMsg').textContent = 'Syncing…';
  chrome.runtime.sendMessage({ type: 'sync-now' }, (res) => {
    $('syncMsg').textContent = res?.ok ? 'Synced ✅' : 'Failed: ' + (res?.error || 'log into Amizone first');
    refresh();
  });
});

refresh();
