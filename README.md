# Dominion Search

A local, offline-first search engine and PWA for the deck-building game
**Dominion** and all of its expansions, with a Scryfall-like query language.

- **837 cards + 15 piles** across **19 sets**, up to *Rising Sun* (2024). [^1]
- Complete client query payload is **~28 KB brotli** and works fully offline.
- One TypeScript codebase: engine runs in the browser **and** Node.
- Assets (card images, FAQ, translations) are loaded lazily from CDN.

[^1]: Basic cards (Copper…Colony), landscape cards (Events, Landmarks,
Projects, Ways, Traits, Allies, Prophecies, Loot, Boons, Hexes…), promos and
non-supply cards are all included.

## Query language

Fields (aliases in parentheses): `name (n)`, `type (t)`, `set (s, e,
expansion)`, `cost (c, cmc)`, `potion (p)`, `debt (d)`, `text (o)`, `artist
(a)`, `supply`, `edition (ed)`, `pile (parent)`, `is:`, `has:`.

Operators: `:`, `=`, `!=`, `<`, `<=`, `>`, `>=`. Combine with implicit AND,
`or`, `not` / `-`, and parentheses. Values may be quoted (`o:"gain a Gold"`)
or regex (`o:/trash.*Gold/`).

```text
t:attack cost:3                       # plain $3 Attacks
set:(empires or adventures) t:duration
cost:3p                               # $3 + Potion
cost:4d3                              # $4 + 3 debt
cost:2+                               # overpay
n:cat  /  n:rock                      # component match: Catapult/Rocks
is:event set:menagerie
has:overpay
o:/trash.*Gold/
-set:seaside is:attack
```

**Cost tokens** are composite and exact: `cost:3` is plain `$3` (so `$3*` and
`$3P` do **not** match); use `cost:3*`, `cost:3p`, `cost:d8`, etc. Relational
operators (`cost>=3`) compare the coin value only.

**Name matching** is substring-based over the whole name, so components of
split piles match either half (`n:cat` → Catapult, `n:rock` → Rocks).

**Set matching** is fuzzy with aliases and umbrella expansion: `base`→Dominion,
`dark`→Dark Ages, `c&g`→Cornucopia & Guilds; `set:cornucopia` matches both
*Cornucopia* and *Cornucopia & Guilds*.

### CLI

```bash
npm run build                       # build the bundle from data/cards.json
npm run cli -- "t:attack cost:3"    # run a query
node src/cli.ts "t:attack cost:3" --count
node src/cli.ts "set:cornucopia" --group-by set
node src/cli.ts "n:rock" --piles
node src/cli.ts "t:attack cost:3" --json
node src/cli.ts "t:attack cost:3" --explain
```

Options: `--count`, `--group-by <set|type|cost|debt|potion|edition|artist|pile>`,
`--json`, `--piles`, `--limit <n>`, `--explain`.

### PWA

```bash
npm run build:site  # bundle + compile + assemble public/
npm run serve       # http://localhost:8080/  (serves public/)
```

`public/` is the complete, self-contained static site — it's what you publish.
The service worker precaches the app and the dataset (all queries offline,
<1 ms) and runtime-caches card images from the wiki. Installable; works offline.

## Deploying

The app is 100% static: no server, no database, no build-time API. Publish the
`public/` directory produced by `npm run build:site`. See **HOSTING.md** for a
comparison of options.

## Layout

```
data/
  cards.json            source artifact (committed)
  cards.csv, sets.json  convenience exports
  bundle.json           decoded bundle (built)
  bundle.<hash>.json       + .json.br  (immutable, content-hashed)
src/
  core/                 engine: types, bundle, cost, sets, lexer, parser,
                        ast, fields, eval, engine   (browser + Node)
  build/
    build-bundle.ts     data/cards.json -> bundle (splits cards/piles)
    build-site.ts       assemble public/ (shell + dist/core + data)
    scrape.ts           optional re-scraper (fengari, Lua-in-JS)
    serve.ts            tiny static server for public/
  cli.ts                command-line wrapper over core
app/                    PWA source shell (index.html, app.js, sw.js, manifest)
public/                 assembled deployable site (built; gitignored)
tests/                  node:test golden queries
```

## Data model

The flat wiki list is split into two collections:

- **`cards`** — individually playable cards.
- **`piles`** — named piles that group cards (e.g. `Catapult/Rocks`, `Castles`,
  `Knights`, `Augurs`, `Clashes`, `Wizards`) with their members.

The combined pile entry is *not* a card, so there is no double counting:
`t:attack cost:3` returns 8 cards (Catapult, not Catapult/Rocks).

## Data source

The authoritative card database lives on the Dominion Strategy Wiki
(`wiki.dominionstrategy.com`), but that site is behind an Anubis proof-of-work
bot wall. The same data is mirrored on Miraheze
(`dominionstrategy.miraheze.org`), where every card is a structured Lua module
in the `Module:` namespace. `scrape.ts` fetches those modules via the MediaWiki
API and evaluates them with **fengari** (a Lua VM in JS) — no Python, no system
Lua.

Data is static (no errata), so `data/cards.json` is committed as the source of
truth; run `npm run scrape` only to refresh from upstream. A full scrape takes
~16 s and reproduces the committed file exactly.

## Development

```bash
npm install
npm run build:site  # bundle + compile + assemble public/
npm run serve       # http://localhost:8080/
npm test            # node:test golden queries
npm run typecheck   # tsc
```

## Attribution

Dominion is © Donald X. Vaccarino / Rio Grande Games; card names and text are
copyrighted by the publisher. This project is a compilation of data published
on the Dominion Wiki (community, CC BY-SA), for personal/research/tooling use.
