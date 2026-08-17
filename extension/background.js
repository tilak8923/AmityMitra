/**
 * background.js — the extension's service worker.
 *
 * The ONLY thing that fetches Amizone (from the user's own browser + IP). It
 * makes a random deviceId once, and pushes the fetched data to the server under
 * it. The server never receives the Amizone session — just the data.
 */

import { getAll } from './amizone.js';
import { BACKEND_URL } from './config.js';

const SYNC_ALARM = 'amizon-sync';

async function deviceId() {
  let { deviceId } = await chrome.storage.local.get('deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID().replace(/-/g, '');
    await chrome.storage.local.set({ deviceId });
  }
  return deviceId;
}

chrome.runtime.onInstalled.addListener(async () => {
  await deviceId();
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === SYNC_ALARM) sync().catch((e) => console.warn('[amizon] sync:', e.message));
});

async function sync() {
  const id = await deviceId();
  const data = await getAll(); // throws if not logged into Amizone
  await fetch(BACKEND_URL.replace(/\/$/, '') + '/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: id, ...data }),
  });
  await chrome.storage.local.set({ lastSync: Date.now() });
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type === 'get-device') {
    deviceId().then((id) => send({ deviceId: id }));
    return true;
  }
  if (msg?.type === 'sync-now') {
    sync()
      .then(() => send({ ok: true }))
      .catch((e) => send({ ok: false, error: e.message }));
    return true;
  }
});
