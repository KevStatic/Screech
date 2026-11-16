// Fails when the production build ships a recorded audio file (Requirement 11.9).
// Every sound in Screech is synthesised at runtime, so dist must hold none.
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BANNED = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");

function walk(dir, found) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (BANNED.has(extname(name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  console.error(`dist not found, run pnpm build first (${dist})`);
  process.exit(1);
}

const offenders = walk(dist, []);
if (offenders.length > 0) {
  console.error("Audio files found in dist (all sound must be synthesised):");
  for (const file of offenders) console.error(`  ${file}`);
  process.exit(1);
}

console.log("OK: no .mp3, .wav, .ogg or .m4a files in dist.");
