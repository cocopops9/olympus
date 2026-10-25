#!/usr/bin/env node
// Copies the server modules the Supabase function shares with the Node server (social layer,
// sync conflict rules, password hashing, the Hercules coach) next to it, so the function deploys as one folder.
//   node scripts/supabase-bundle.mjs           copy
//   node scripts/supabase-bundle.mjs --check   fail when a copy differs from api/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'supabase/functions/olympus');
export const SHARED = ['social.js', 'sync-stamps.js', 'password.js', 'hercules.js'];
const check = process.argv.includes('--check');
let stale = 0;
for (const f of SHARED) {
  const src = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8');
  const dst = path.join(OUT, f);
  const head = `// Copied from api/${f} by scripts/supabase-bundle.mjs. Edit that file, then run the script.\n`;
  const want = head + src;
  if (check) { if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== want) { console.error(`${f} differs from api/${f}`); stale++; } }
  else fs.writeFileSync(dst, want);
}
if (check && stale) process.exit(1);
console.log(check ? 'supabase function copies are current' : `copied ${SHARED.join(', ')}`);
