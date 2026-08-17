/** Load Amizone session cookies from a cookies.txt file (name<TAB>value lines). */

import { existsSync, readFileSync } from 'node:fs';

export function loadCookiesFromFile(file = 'cookies.txt'): Record<string, string> {
  if (!existsSync(file)) {
    throw new Error(
      `No ${file}. Put your Amizone cookies there (name<TAB>value), at least ` +
        '.ASPXAUTH and ASP.NET_SessionId.',
    );
  }
  const jar: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const parts = line.replace(/\r$/, '').trim().split(/[\t ]+/).filter(Boolean);
    // Skip the per-request anti-forgery token — it must not be reused.
    if (parts.length >= 2 && !/RequestVerificationToken/i.test(parts[0])) {
      jar[parts[0]] = parts.slice(1).join('');
    }
  }
  if (!jar['.ASPXAUTH']) {
    console.warn('⚠ No .ASPXAUTH cookie found — you may not be logged in.');
  }
  return jar;
}
