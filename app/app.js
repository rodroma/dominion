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
const filtersEl = $("filters");
const queryPreviewEl = $("query-preview");
const queryTextEl = $("query-text");

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
  const query = effectiveQuery();
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

/* ---------------- visual filters ---------------- */

const filterState = {
  type: new Set(),
  typeMode: "any", // any | all
  typeShowAll: false,
  set: new Set(),
  costMin: "",
  costMax: "",
  potion: "any", // any | yes | no
  debt: false,
  edition: "", // "" | 1E | 2E
  kingdom: false,
  landscape: false,
  promo: false,
  nonsupply: false,
  overpay: false,
  special: false,
  collapsed: false,
};

let allTypes = [];
let allSets = [];

const SET_ORDER = [
  "Dominion", "Intrigue", "Seaside", "Alchemy", "Prosperity", "Cornucopia",
  "Hinterlands", "Dark Ages", "Guilds", "Cornucopia & Guilds", "Adventures",
  "Empires", "Nocturne", "Renaissance", "Menagerie", "Allies", "Plunder",
  "Rising Sun", "Promos",
];

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, 120);
}

function indexFilters() {
  const counts = new Map();
  for (const c of engine.cards) {
    for (const t of c.types) counts.set(t, (counts.get(t) || 0) + 1);
  }
  allTypes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  const present = new Set(engine.cards.map((c) => c.set));
  allSets = [
    ...SET_ORDER.filter((s) => present.has(s)),
    ...[...present].filter((s) => !SET_ORDER.includes(s)).sort(),
  ];
}

function quoteValue(v) {
  return /^[A-Za-z0-9_.+-]+$/.test(v) ? v : `"${v.replace(/"/g, "")}"`;
}

/** Turn the visual filter state into query-syntax terms. */
function filterParts() {
  const parts = [];

  const types = [...filterState.type];
  if (types.length === 1) {
    parts.push(`t:${quoteValue(types[0].toLowerCase())}`);
  } else if (types.length > 1) {
    parts.push(
      filterState.typeMode === "all"
        ? types.map((t) => `t:${quoteValue(t.toLowerCase())}`).join(" ")
        : `t:(${types.map((t) => quoteValue(t.toLowerCase())).join(" or ")})`,
    );
  }

  const sets = [...filterState.set];
  if (sets.length === 1) parts.push(`set:${quoteValue(sets[0].toLowerCase())}`);
  else if (sets.length > 1) {
    parts.push(`set:(${sets.map((s) => quoteValue(s.toLowerCase())).join(" or ")})`);
  }

  if (filterState.costMin !== "") parts.push(`cost>=${filterState.costMin}`);
  if (filterState.costMax !== "") parts.push(`cost<=${filterState.costMax}`);
  if (filterState.potion === "yes") parts.push("potion:1");
  if (filterState.potion === "no") parts.push("potion:0");
  if (filterState.debt) parts.push("debt>0");
  if (filterState.edition) parts.push(`edition:${filterState.edition.toLowerCase()}`);

  if (filterState.kingdom) parts.push("is:kingdom");
  if (filterState.landscape) parts.push("is:landscape");
  if (filterState.promo) parts.push("is:promo");
  if (filterState.nonsupply) parts.push("is:nonsupply");
  if (filterState.overpay) parts.push("has:overpay");
  if (filterState.special) parts.push("has:special");

  return parts;
}

/** Typed query AND visual filters; groups the typed part to keep its meaning. */
function effectiveQuery() {
  const manual = qEl.value.trim();
  const clause = filterParts().join(" ");
  if (!clause) return manual;
  return (manual ? `(${manual}) ` : "") + clause;
}

function updatePreview() {
  const active = filterParts().length > 0;
  queryPreviewEl.hidden = !active;
  if (active) queryTextEl.textContent = effectiveQuery();
}

function syncFilters() {
  updatePreview();
  run();
}

function toggleIn(set, value) {
  if (set.has(value)) {
    set.delete(value);
    return false;
  }
  set.add(value);
  return true;
}

function chipButton(label, active, onToggle) {
  const b = el("button", "fchip" + (active ? " on" : ""), label);
  b.type = "button";
  b.setAttribute("aria-pressed", active ? "true" : "false");
  b.addEventListener("click", () => onToggle(b));
  return b;
}

function toggleFlag(key, btn) {
  filterState[key] = !filterState[key];
  btn.classList.toggle("on", filterState[key]);
  btn.setAttribute("aria-pressed", filterState[key] ? "true" : "false");
  syncFilters();
}

function buildFilters() {
  if (!engine) return;
  filtersEl.replaceChildren();
  filtersEl.classList.toggle("collapsed", filterState.collapsed);

  const head = el("div", "filter-head");
  head.append(el("span", "filter-title", "Filters"));
  const toggle = el("button", "ghost small", filterState.collapsed ? "Show" : "Hide");
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    filterState.collapsed = !filterState.collapsed;
    filtersEl.classList.toggle("collapsed", filterState.collapsed);
    toggle.textContent = filterState.collapsed ? "Show" : "Hide";
  });
  const clear = el("button", "ghost small", "Clear");
  clear.type = "button";
  clear.addEventListener("click", clearFilters);
  head.append(toggle, clear);
  filtersEl.append(head);

  filtersEl.append(typeRow(), setRow(), costRow(), traitRow());
}

function typeRow() {
  const row = el("div", "filter-row");
  row.append(el("span", "filter-label", "Type"));

  const chips = el("div", "chips");
  const limit = filterState.typeShowAll ? allTypes.length : 16;
  for (const t of allTypes.slice(0, limit)) {
    chips.append(
      chipButton(t, filterState.type.has(t), (b) => {
        const on = toggleIn(filterState.type, t);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        syncFilters();
      }),
    );
  }
  if (allTypes.length > 16) {
    const more = el(
      "button",
      "more",
      filterState.typeShowAll ? "less" : `+${allTypes.length - 16} more`,
    );
    more.type = "button";
    more.addEventListener("click", () => {
      filterState.typeShowAll = !filterState.typeShowAll;
      buildFilters();
    });
    chips.append(more);
  }
  row.append(chips);

  const modeWrap = el("label", "mode");
  modeWrap.append(document.createTextNode("match "));
  const mode = document.createElement("select");
  for (const v of ["any", "all"]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if (filterState.typeMode === v) o.selected = true;
    mode.append(o);
  }
  mode.addEventListener("change", () => {
    filterState.typeMode = mode.value;
    syncFilters();
  });
  modeWrap.append(mode);
  row.append(modeWrap);
  return row;
}

function setRow() {
  const row = el("div", "filter-row");
  row.append(el("span", "filter-label", "Expansion"));
  const chips = el("div", "chips");
  for (const s of allSets) {
    chips.append(
      chipButton(s, filterState.set.has(s), (b) => {
        const on = toggleIn(filterState.set, s);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        syncFilters();
      }),
    );
  }
  row.append(chips);
  return row;
}

function numberField(labelText, value, onChange) {
  const label = el("label", "num");
  label.append(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.inputMode = "numeric";
  input.value = value;
  input.placeholder = "any";
  input.addEventListener("input", () => {
    onChange(input.value);
    updatePreview();
    schedule();
  });
  label.append(input);
  return label;
}

function selectField(labelText, options, value, onChange) {
  const label = el("label", "num");
  label.append(document.createTextNode(labelText));
  const sel = document.createElement("select");
  for (const [v, text] of options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = text;
    if (value === v) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener("change", () => {
    onChange(sel.value);
    syncFilters();
  });
  label.append(sel);
  return label;
}

function costRow() {
  const row = el("div", "filter-row");
  row.append(el("span", "filter-label", "Cost"));
  const wrap = el("div", "filter-inputs");
  wrap.append(
    numberField("$ min", filterState.costMin, (v) => (filterState.costMin = v)),
    numberField("$ max", filterState.costMax, (v) => (filterState.costMax = v)),
    selectField(
      "Potion",
      [["any", "any"], ["yes", "yes"], ["no", "no"]],
      filterState.potion,
      (v) => (filterState.potion = v),
    ),
  );
  for (const [key, label] of [["debt", "Debt"], ["overpay", "Overpay"], ["special", "Special"]]) {
    wrap.append(chipButton(label, filterState[key], (b) => toggleFlag(key, b)));
  }
  row.append(wrap);
  return row;
}

function traitRow() {
  const row = el("div", "filter-row");
  row.append(el("span", "filter-label", "Traits"));
  const chips = el("div", "chips");
  for (const [key, label] of [
    ["kingdom", "Kingdom"],
    ["landscape", "Landscape"],
    ["promo", "Promo"],
    ["nonsupply", "Non-supply"],
  ]) {
    chips.append(chipButton(label, filterState[key], (b) => toggleFlag(key, b)));
  }
  row.append(chips);

  const ed = selectField(
    "Edition",
    [["", "any"], ["1E", "1E"], ["2E", "2E"]],
    filterState.edition,
    (v) => (filterState.edition = v),
  );
  ed.classList.add("edition");
  row.append(ed);
  return row;
}

function resetFilterState() {
  filterState.type.clear();
  filterState.set.clear();
  filterState.typeMode = "any";
  filterState.typeShowAll = false;
  filterState.costMin = "";
  filterState.costMax = "";
  filterState.potion = "any";
  filterState.debt = false;
  filterState.edition = "";
  filterState.kingdom = false;
  filterState.landscape = false;
  filterState.promo = false;
  filterState.nonsupply = false;
  filterState.overpay = false;
  filterState.special = false;
}

function clearFilters() {
  resetFilterState();
  buildFilters();
  syncFilters();
}

/* ---------------- syntax primer ---------------- */

function chip(text) {
  return el("code", "chip", text);
}

function runExample(query) {
  resetFilterState();
  if (engine) buildFilters();
  qEl.value = query;
  clearHash();
  showView("search");
  updatePreview();
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
  body.append(
    el(
      "p",
      "lead",
      "Tip: the Filters bar on the search screen builds this syntax for you — watch the query line update as you click.",
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

qEl.addEventListener("input", () => {
  updatePreview();
  schedule();
});
pilesEl.addEventListener("change", run);
groupbyEl.addEventListener("change", run);
$("copy-query").addEventListener("click", async () => {
  const btn = $("copy-query");
  try {
    await navigator.clipboard.writeText(queryTextEl.textContent || "");
    btn.textContent = "copied";
    setTimeout(() => (btn.textContent = "copy"), 1200);
  } catch {
    // clipboard blocked; leave the button untouched
  }
});
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
  indexFilters();
  buildFilters();
  updatePreview();
  run();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot().catch((e) => {
  statusEl.textContent = `failed to load data: ${e.message}`;
});
