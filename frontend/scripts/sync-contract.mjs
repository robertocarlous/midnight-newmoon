#!/usr/bin/env node
// Vendors the compiled whisper-wall contract (JS bindings + zk assets) from
// ../contracts/managed into this app's src/generated and public/managed.
//
// The frontend is deployed as a static build (Vercel doesn't have the
// Compact compiler), so these artifacts are committed rather than
// regenerated at deploy time. Re-run this after `npm run compile` at the
// repo root whenever the contract changes.
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const source = join(repoRoot, 'contracts', 'managed', 'whisper-wall');

if (!existsSync(source)) {
  console.error(`\n❌ ${source} does not exist. Run \`npm run compile\` at the repo root first.\n`);
  process.exit(1);
}

// 1. JS/TS bindings -> src/generated (bundled into the app by Vite/Rollup)
const genTarget = join(__dirname, '..', 'src', 'generated', 'whisper-wall');
rmSync(genTarget, { recursive: true, force: true });
mkdirSync(genTarget, { recursive: true });
for (const file of ['index.js', 'index.d.ts', 'index.js.map']) {
  cpSync(join(source, 'contract', file), join(genTarget, file));
}

// 2. zk assets (keys + zkir) -> public/managed (fetched over HTTP at proving time)
const publicTarget = join(__dirname, '..', 'public', 'managed', 'whisper-wall');
rmSync(publicTarget, { recursive: true, force: true });
mkdirSync(publicTarget, { recursive: true });
cpSync(join(source, 'keys'), join(publicTarget, 'keys'), { recursive: true });
cpSync(join(source, 'zkir'), join(publicTarget, 'zkir'), { recursive: true });
cpSync(join(source, 'compiler', 'contract-info.json'), join(publicTarget, 'contract-info.json'));

console.log(`✅ Synced whisper-wall contract into:\n   ${genTarget}\n   ${publicTarget}`);
