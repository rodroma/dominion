/**
 * Assemble the deployable static site into `public/`:
 *   public/
 *     index.html, app.js, styles.css, sw.js, manifest.webmanifest, icon.svg
 *     dist/core/*.js          (compiled engine)
 *     data/bundle*.json(.br)  (the dataset the client fetches)
 *
 * Run with: npm run build:site   (which also builds the bundle and compiles)
 * Then publish `public/` on any static host.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const PUBLIC = resolve(ROOT, "public");
const APP = resolve(ROOT, "app");
const DIST = resolve(ROOT, "dist");
const DATA = resolve(ROOT, "data");

function copyInto(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = resolve(srcDir, entry.name);
    const dest = resolve(destDir, entry.name);
    if (entry.isDirectory()) copyInto(src, dest);
    else cpSync(src, dest);
  }
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error("dist/ not found. Run: npm run compile");
    process.exit(1);
  }
  const bundle = resolve(DATA, "bundle.json");
  if (!existsSync(bundle)) {
    console.error("data/bundle.json not found. Run: npm run build");
    process.exit(1);
  }

  rmSync(PUBLIC, { recursive: true, force: true });
  mkdirSync(PUBLIC, { recursive: true });

  copyInto(APP, PUBLIC);
  copyInto(resolve(DIST, "core"), resolve(PUBLIC, "dist", "core"));

  const dataOut = resolve(PUBLIC, "data");
  mkdirSync(dataOut, { recursive: true });
  for (const name of readdirSync(DATA)) {
    if (name === "bundle.json" || name.startsWith("bundle.")) {
      cpSync(resolve(DATA, name), resolve(dataOut, name));
    }
  }

  console.log(`assembled public/  (publish this directory)`);
}

main();
