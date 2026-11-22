// VICE HARBOR — hand-in program for the make.fun gta6-01 bounty.
//
// The game itself is the static site under game/ (open game/index.html and
// play). This program is what the grader runs: it copies the game and its
// screenshots into the output directory and writes the dossier the judge
// reads, using the vendored make.fun library. Standard library only.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(out, { recursive: true });

cpSync(join(here, "game"), join(out, "game"), { recursive: true });

const shotsDir = join(here, "screenshots");
if (existsSync(shotsDir)) {
  mkdirSync(join(out, "screenshots"), { recursive: true });
  cpSync(shotsDir, join(out, "screenshots"), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000
});
writeFileSync(join(out, "dossier.json"), dossier);

console.log("vice-harbor: game, screenshots and dossier written to " + out);
