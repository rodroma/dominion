import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeBundle, type RawBundle } from "./core/bundle.ts";
import { Engine, GROUP_FIELDS, type GroupField } from "./core/engine.ts";
import { QueryError } from "./core/lexer.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUNDLE = resolve(ROOT, "data", "bundle.json");

interface Args {
  query: string;
  json: boolean;
  count: boolean;
  explain: boolean;
  piles: boolean;
  groupBy: GroupField | null;
  limit: number;
}

function usage(): string {
  return [
    "usage: dominion <query> [options]",
    "",
    "options:",
    "  --json             output matching cards as JSON",
    "  --count            print only the number of matches",
    "  --group-by <f>     group counts by one of: " + GROUP_FIELDS.join(", "),
    "  --piles            also list matching piles",
    "  --limit <n>        limit printed cards (default 50)",
    "  --explain          print the parsed query instead of running it",
    "",
    "examples:",
    '  dominion "t:attack cost:3"',
    '  dominion "set:(empires or adventures) is:duration" --count',
    '  dominion "n:rock" --piles',
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    query: "",
    json: false,
    count: false,
    explain: false,
    piles: false,
    groupBy: null,
    limit: 50,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--count") args.count = true;
    else if (a === "--explain") args.explain = true;
    else if (a === "--piles") args.piles = true;
    else if (a === "--group-by") {
      const v = argv[++i] as GroupField;
      if (!GROUP_FIELDS.includes(v)) throw new Error(`Unknown group field '${v}'`);
      args.groupBy = v;
    } else if (a === "--limit") {
      args.limit = Number(argv[++i]);
    } else if (a === "-h" || a === "--help") {
      console.log(usage());
      process.exit(0);
    } else {
      rest.push(a);
    }
  }
  args.query = rest.join(" ").trim();
  return args;
}

function loadEngine(): Engine {
  let raw: RawBundle;
  try {
    raw = JSON.parse(readFileSync(BUNDLE, "utf8")) as RawBundle;
  } catch {
    console.error(`Could not read ${BUNDLE}. Run: npm run build`);
    process.exit(2);
    throw new Error("unreachable");
  }
  return new Engine(decodeBundle(raw));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    console.log(usage());
    process.exit(1);
  }
  const engine = loadEngine();

  try {
    if (args.explain) {
      console.log(engine.explain(args.query));
      return;
    }

    if (args.groupBy) {
      const g = engine.groupBy(args.query, args.groupBy);
      const rows = [...g.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (args.json) {
        console.log(JSON.stringify(Object.fromEntries(rows), null, 2));
      } else {
        for (const [k, n] of rows) console.log(`${String(n).padStart(4)}  ${k}`);
        console.log(`${String(engine.count(args.query)).padStart(4)}  (total matches)`);
      }
      return;
    }

    if (args.count) {
      console.log(engine.count(args.query));
      return;
    }

    const { cards, piles } = engine.search(args.query, { includePiles: args.piles });

    if (args.json) {
      console.log(JSON.stringify({ cards, piles }, null, 2));
      return;
    }

    if (piles.length) {
      for (const p of piles) {
        console.log(`[pile] ${p.name}  ${p.cost}  ${p.set}  (${p.members.join(", ")})`);
      }
    }
    for (const c of cards.slice(0, args.limit)) {
      const types = c.types.join(" ");
      console.log(`${c.name.padEnd(22)} ${(c.cost || "-").padEnd(7)} ${c.set.padEnd(16)} ${types}`);
    }
    console.log(`\n${cards.length} card(s)${piles.length ? `, ${piles.length} pile(s)` : ""}`);
  } catch (e) {
    if (e instanceof QueryError) {
      console.error(`query error: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

main();
