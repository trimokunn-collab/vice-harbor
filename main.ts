// VICE HARBOR — hand-in program for the make.fun gta6-01 bounty.
//
// The game is a plain static site in this directory's game/ folder:
// index.html plus two classic scripts and one stylesheet, no build
// step, no network. This program's whole job is the hand-in — it
// copies the game (and the screenshots, when they are present) into
// the output directory and writes the dossier the judge reads,
// produced by the vendored make.fun library in ./vendor.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(out, { recursive: true });

cpSync(join(here, "game"), join(out, "game"), { recursive: true });

const shotsHere = join(here, "screenshots");
if (existsSync(shotsHere)) {
  mkdirSync(join(out, "screenshots"), { recursive: true });
  cpSync(shotsHere, join(out, "screenshots"), { recursive: true });
}

writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log("Vice Harbor handed in: game, screenshots and dossier are in " + out);
