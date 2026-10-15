import { decodeBundle, Engine } from "./dist/core/index.js";

const WIKI_IMG = "https://dominionstrategy.miraheze.org/wiki/Special:FilePath/";
const imgUrl = (file, w = 300) => `${WIKI_IMG}${encodeURIComponent(file)}?width=${w}`;

const $ = (id) => document.getElementById(id);
const qEl = $("q");
const resultsEl = $("results");
const groupsEl = $("groups");
const statusEl = $("status");
const pilesEl = $("piles");
const groupbyEl = $("groupby");
const searchviewEl = $("searchview");
const primerEl = $("primer");
const primerBodyEl = $("primer-body");

/** @type {Engine | null} */
let engine = null;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderCard(c) {
  const li = el("li", "card");

  const img = document.createElement("img");
  img.className = "thumb";
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = c.name;
  img.width = 84;
  if (c.wikiFile) img.src = imgUrl(c.wikiFile, 200);
  li.append(img);

  const body = el("div", "body");
  body.append(el("div", "name", c.name));
  const meta = [c.set, c.types.join(" "), c.edition, c.pile ? `pile: ${c.pile}` : ""]
    .filter(Boolean)
    .join(" · ");
  body.append(el("div", "meta", meta));
  if (c.text) body.append(el("div", "text", c.text));
  li.append(body);

  li.append(el("div", "cost", c.cost || "—"));
  return li;
}

function renderGroups(map, total) {
  groupsEl.replaceChildren();
  if (!map) return;
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const table = el("table", "grouptable");
  for (const [k, n] of entries) {
    const tr = el("tr");
    tr.append(el("td", null, String(n)), el("td", null, k));
    table.append(tr);
  }
  groupsEl.append(table);
  const t = el("div", "muted", `${total} matching cards`);
  t.style.padding = "0 0.75rem 0.5rem";
  groupsEl.append(t);
}

function run() {
  if (!engine) return;
  const query = qEl.value.trim();
  groupsEl.replaceChildren();
  resultsEl.replaceChildren();
  try {
    if (groupbyEl.value) {
      const map = engine.groupBy(query, groupbyEl.value);
      renderGroups(map, engine.count(query));
      statusEl.textContent = `${map.size} groups`;
      return;
    }

    const { cards, piles } = engine.search(query, { includePiles: pilesEl.checked });
    statusEl.textContent = `${cards.length} card${cards.length === 1 ? "" : "s"}` +
      (piles.length ? `, ${piles.length} pile${piles.length === 1 ? "" : "s"}` : "");

    for (const p of piles) {
      const li = el("li", "card");
      li.append(el("div", "thumb placeholder", "PILE"));
      const body = el("div", "body");
      body.append(
        el("div", "name", p.name),
        el("div", "meta", `pile · ${p.set} · ${p.members.join(", ")}`),
      );
      li.append(body, el("div", "cost", p.cost || "—"));
      resultsEl.append(li);
    }
    if (cards.length === 0 && piles.length === 0) {
      resultsEl.append(el("li", "empty", "No matches."));
      return;
    }
    for (const c of cards.slice(0, 300)) resultsEl.append(renderCard(c));
    if (cards.length > 300) {
      resultsEl.append(el("li", "empty", `… ${cards.length - 300} more (refine the query)`));
    }
  } catch (e) {
    statusEl.textContent = "";
    resultsEl.append(el("li", "empty", `query error: ${e.message}`));
  }
}

/* ---------------- syntax primer ---------------- */

function chip(text) {
  return el("code", "chip", text);
}

function runExample(query) {
  qEl.value = query;
  clearHash();
  showView("search");
  run();
  qEl.focus();
}

function exampleChip(query, label) {
  const c = el("code", "chip action", label || query);
  c.title = `Run: ${query}`;
  c.addEventListener("click", () => runExample(query));
  return c;
}

function primerTable(headers, rows) {
  const table = el("table");
  const thead = el("thead");
  const htr = el("tr");
  for (const h of headers) htr.append(el("th", null, h));
  thead.append(htr);
  table.append(thead);
  const tbody = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    for (const cell of row) {
      const td = el("td", cell.cls || null);
      if (typeof cell.content === "string") td.textContent = cell.content;
      else if (Array.isArray(cell.content)) td.append(...cell.content);
      else td.append(cell.content);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

const FIELD_ROWS = [
  {
    f: "name",
    a: "n",
    q: "n:cat",
    d: "Substring of the card name. Both halves of a split pile match (n:cat → Catapult, n:rock → Rocks).",
  },
  {
    f: "type",
    a: "t",
    q: "t:attack",
    d: "A card type: Action, Treasure, Victory, Attack, Duration, Reaction, Night, Event, Landmark, Project, Way, Trait, Ally, … Partial names work by prefix: t:even → Event.",
  },
  {
    f: "set",
    a: "s · e · expansion",
    q: "set:adventures",
    d: "An expansion; a partial name works too (s:empi → Empires). Aliases: base→Dominion, dark→Dark Ages, c&g→Cornucopia & Guilds. Umbrella: set:cornucopia also matches Cornucopia & Guilds.",
  },
  {
    f: "cost",
    a: "c · cmc",
    q: "cost:3",
    d: "Exact cost (see Cost tokens). Relational operators (cost>=4) compare the coin value only.",
  },
  { f: "potion", a: "p", q: "potion:1", d: "Number of Potions in the cost (0 or 1)." },
  { f: "debt", a: "d", q: "debt:8", d: "Debt in the cost." },
  {
    f: "text",
    a: "o · oracle",
    q: 'o:"gain a Gold"',
    d: 'Rules text: substring, "quoted phrase", or /regex/.',
  },
  { f: "artist", a: "a", q: 'a:"Claus Stephan"', d: "Illustrator name." },
  { f: "supply", a: "count", q: "supply:10", d: "Number of copies in the Supply." },
  { f: "edition", a: "ed", q: "edition:2e", d: "Edition: 1e or 2e. Partial works: ed:2." },
  {
    f: "pile",
    a: "parent · in",
    q: "pile:castle",
    d: "Cards that belong to a named pile (Castles, Knights, Augurs, Wizards, …).",
  },
  {
    f: "is:",
    a: "",
    q: "is:duration",
    d: "Flag or type: is:kingdom, is:landscape, is:supply, is:attack, is:duration, …",
  },
  { f: "has:", a: "", q: "has:overpay", d: "has:overpay, has:special, has:text." },
];

const COST_ROWS = [
  { q: "cost:3", d: "$3 — the $ is optional, so c:2 and c:$2 are the same" },
  { q: "cost:3p", d: "$3 + Potion (also cost:$3P)" },
  { q: "cost:p", d: "Potion only" },
  { q: "cost:4d3", d: "$4 + 3 Debt — also cost:$4+3D" },
  { q: "cost:d8", d: "8 Debt only — also cost:8D" },
  { q: "cost:7*", d: "$7, “special” (non-buyable or has a caveat)" },
  { q: "cost:2+", d: "$2, overpay" },
];

function buildPrimer() {
  const body = primerBodyEl;
  body.replaceChildren();
  body.append(
    el(
      "p",
      "lead",
      "Terms are separated by spaces and combined with AND. Combine with or and not / -, group with parentheses, and click any example to run it.",
    ),
  );

  body.append(el("h3", null, "Fields"));
  body.append(
    primerTable(
      ["Field", "Example", "Matches"],
      FIELD_ROWS.map((r) => [
        {
          cls: "term",
          content: [chip(r.f), r.a ? " " : "", r.a ? el("span", "aliases", r.a) : ""],
        },
        { content: exampleChip(r.q) },
        { cls: "desc", content: r.d },
      ]),
    ),
  );

  body.append(el("h3", null, "Values"));
  const valUl = el("ul", "rules");
  const valItems = [
    ["Unquoted", "t:attack", "— a single word, no spaces."],
    ["Partial", "t:even", "— type / set / edition accept prefixes (t:even → Event)."],
    ["Quoted", 'o:"gain a Gold"', "— keep spaces / punctuation."],
    ["Regex", "o:/trash.*Gold/", "— case-insensitive; . also matches newlines."],
    ["Choice list", "set:(empires or adventures)", "— matches any listed value."],
  ];
  for (const [label, ex, note] of valItems) {
    const li = el("li");
    li.append(el("span", null, `${label}: `), exampleChip(ex), document.createTextNode(` ${note}`));
    valUl.append(li);
  }
  body.append(valUl);

  body.append(el("h3", null, "Combining terms"));
  const combUl = el("ul", "rules");
  const combItems = [
    ["Implicit AND", "t:attack cost:3", "attack costing exactly $3"],
    ["or", "t:attack or t:duration", "either type"],
    ["not / -", "-set:seaside is:attack", "attacks outside Seaside"],
    ["Parentheses", "(set:empires or set:adventures) t:duration", "group terms"],
    ["Comparison", "cost>=4", "also <, <=, >, >=, =, !="],
  ];
  for (const [label, ex, note] of combItems) {
    const li = el("li");
    li.append(el("span", null, `${label}: `), exampleChip(ex), document.createTextNode(` ${note}`));
    combUl.append(li);
  }
  body.append(combUl);

  body.append(el("h3", null, "Cost tokens"));
  body.append(
    primerTable(
      ["Token", "Means"],
      COST_ROWS.map((r) => [{ content: exampleChip(r.q) }, { cls: "desc", content: r.d }]),
    ),
  );
  const costNote = el("p", "lead");
  costNote.style.marginTop = "0.6rem";
  costNote.append(
    document.createTextNode(
      "The whole cost is one token, and the $ is optional — you can even paste the displayed cost: ",
    ),
    exampleChip("c:$4+3D"),
    document.createTextNode(
      " (Wedding). Tokens are exact, so cost:3 does not match $3P or $3*. For ranges use separate fields, e.g. ",
    ),
    exampleChip("potion:1 cost>=4"),
    document.createTextNode(" (at least $4 and includes a Potion)."),
  );
  body.append(costNote);

  body.append(el("h3", null, "Examples"));
  const exWrap = el("div", "examples");
  const examples = [
    ["t:attack cost:3", "Attacks that cost exactly $3"],
    ["potion:1 cost>=4", "Costs at least $4 and includes a Potion"],
    ["set:(empires or adventures) is:duration", "Durations from Empires or Adventures"],
    ["has:overpay", "Overpay cards"],
    ["c:$4+3D", "Costs $4 + 3 Debt (Wedding)"],
    ['o:/trash.*Gold/ t:action', "Action cards whose text trashes then gains a Gold"],
    ["-set:seaside t:attack", "Attacks outside Seaside"],
    ["is:event set:menagerie", "Events from Menagerie"],
    ["edition:2e set:intrigue", "Second-edition Intrigue cards"],
  ];
  for (const [q, desc] of examples) {
    const row = el("div", "ex");
    row.append(exampleChip(q), el("span", "desc", desc));
    exWrap.append(row);
  }
  body.append(exWrap);
}

function showView(name) {
  searchviewEl.hidden = name !== "search";
  primerEl.hidden = name !== "syntax";
  window.scrollTo(0, 0);
}

function clearHash() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

function applyHash() {
  showView(location.hash === "#syntax" ? "syntax" : "search");
}

$("show-primer").addEventListener("click", () => {
  location.hash = "syntax";
  applyHash();
});
$("back-to-search").addEventListener("click", () => {
  clearHash();
  showView("search");
});
window.addEventListener("hashchange", applyHash);

let timer = 0;
qEl.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(run, 120);
});
pilesEl.addEventListener("change", run);
groupbyEl.addEventListener("change", run);
$("searchbar").addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});

async function boot() {
  buildPrimer();
  applyHash();
  const res = await fetch("./data/bundle.json");
  const raw = await res.json();
  engine = new Engine(decodeBundle(raw));
  $("version").textContent = `data ${engine.version} · ${engine.cards.length} cards · ${engine.piles.length} piles`;
  run();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot().catch((e) => {
  statusEl.textContent = `failed to load data: ${e.message}`;
});
