/* ============================================================
   ShopPersona prototype — inference layer
   ------------------------------------------------------------
   NOTE FOR THE TEAM: there is no model call here. Every sentence
   the analyst says is written in advance. What *is* real is the
   scoring: the four axis values, the 16-way type lookup, the
   confidence figure and the product match percentages are all
   computed from the purchase readings you accept or overrule.

   The intended split is the same as the ShopWise build — an LLM
   proposes the *reasons* (free text), and ordinary code does the
   arithmetic (axes, budget filter, ranking). Swap REASONS for a
   model response and nothing below has to change.
   ============================================================ */

/* ── the four axes ──────────────────────────────────────────
   Positive = the first pole. Code order is plan → price → mode → brand,
   so a person reading "DVFL" gets Deliberate / Value / Function / Loyal. */
const AXES = [
  { k: "plan",  name: "Planning",   pos: "Deliberate", neg: "Spontaneous", posL: "D", negL: "S" },
  { k: "price", name: "Spend",      pos: "Premium",    neg: "Value",       posL: "P", negL: "V" },
  { k: "mode",  name: "Motive",     pos: "Expression", neg: "Function",    posL: "E", negL: "F" },
  { k: "brand", name: "Attachment", pos: "Novelty",    neg: "Loyal",       posL: "N", negL: "L" }
];

const TYPES = {
  DVFL: { name: "The Quartermaster", line: "Researches once, buys the workhorse, then rebuys it for a decade." },
  DVFN: { name: "The Spec Hunter",   line: "Opens a comparison sheet for a S$40 purchase, and owes no brand anything." },
  DVEL: { name: "The Curator",       line: "Builds one coherent look slowly, out of pieces that were never expensive." },
  DVEN: { name: "The Thrift Scout",  line: "Plans the hunt, not the spend. Style comes from finding, not paying." },
  DPFL: { name: "The Lifer",         line: "Buys the best version once, then stays with whoever made it." },
  DPFN: { name: "The Upgrader",      line: "Reads everything, pays for top spec, switches the moment something beats it." },
  DPEL: { name: "The Connoisseur",   line: "Slow, expensive and consistent. The house style is the whole point." },
  DPEN: { name: "The Collector",     line: "Researches deeply, spends freely, keeps moving to the next maker." },
  SVFL: { name: "The Restocker",     line: "Reorders the known-good thing the day it runs out. Shopping is a chore to close." },
  SVFN: { name: "The Deal Reflex",   line: "Sees a useful thing at a good price and buys before the tab closes." },
  SVEL: { name: "The Moodboarder",   line: "Quick, cheap, on-palette. The look is settled; only the pieces change." },
  SVEN: { name: "The Trend Sampler", line: "Tries everything once, cheaply, and keeps about a third of it." },
  SPFL: { name: "The Fast Loyalist", line: "No hesitation, no discount code, same brand as last time." },
  SPFN: { name: "The Early Adopter", line: "Buys the new thing at launch price and finds the use case afterwards." },
  SPEL: { name: "The Statement Buyer", line: "Pays a premium, on impulse, for pieces that clearly belong together." },
  SPEN: { name: "The Maximalist",    line: "Fast, expensive, expressive, and never the same thing twice." }
};

/* ── line-art glyphs (stand in for product photography) ──── */
const GLYPHS = {
  keyboard: "M5 14h30v12H5zM10 22h20",
  sofa: "M7 21v-3a3 3 0 0 1 6 0v3h14v-3a3 3 0 0 1 6 0v3M7 21h26v9H7zM10 30v3M30 30v3",
  mug: "M9 14h16v12a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4zM25 17h3a4 4 0 0 1 0 8h-3",
  jacket: "M15 9l5 4 5-4 7 4-2 7v12H10V20l-2-7z",
  kettle: "M12 18h14v8a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4zM26 21l5-6M16 18v-4h5",
  headphone: "M9 24v-4a11 11 0 0 1 22 0v4M6 23h5v8H8a2 2 0 0 1-2-2zM29 23h5v6a2 2 0 0 1-2 2h-3z",
  desk: "M6 17h28M9 17v14M31 17v14M14 13h8",
  chair: "M13 8h14v13H13zM10 21h20M14 21v10M26 21v10",
  lamp: "M12 20l8-9 8 9zM20 20v11M14 31h12",
  rack: "M9 11v20M31 11v20M9 16h22M9 22h22M9 28h22",
  bag: "M9 16h22l-2 16H11zM15 16v-4a5 5 0 0 1 10 0v4",
  shelf: "M9 9h22v22H9zM9 17h22M9 24h22",
  shirt: "M15 9l5 4 5-4 7 5-4 4v13H12V18l-4-4z",
  sock: "M15 9h7v13l5 4a5 5 0 1 1-7 7l-7-6V9z",
  panel: "M8 10h11v20H8zM21 10h11v20H21z",
  cat: "M13 15l-2-6 6 3M27 15l2-6-6 3M20 12a9 9 0 1 0 .1 0zM17 21h.01M23 21h.01",
  cube: "M8 14h24v16H8zM8 20h24M20 14v6",
  carafe: "M17 8h6v6l5 8v7a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4v-7l5-8z",
  shoe: "M7 27h13l6-6 5 2a6 6 0 0 1 4 5.6V30H7zM7 22v5",
  pan: "M8 18h16v5a8 8 0 0 1-16 0zM24 20h9",
  box: "M8 13h24v18H8zM8 20h24"
};

const tile = (kind) =>
  `<span class="tile" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="${GLYPHS[kind] || GLYPHS.box}"/></svg></span>`;

/* ── the purchase history (fictional) ───────────────────────
   reasons[0] is what the analyst proposes; the rest are what it
   offers when the user says "actually, no". w = axis push.
   x:true means "this reading disqualifies the purchase as evidence". */
const PURCHASES = [
  {
    id: "b1", name: "Ostrel K70 keyboard", brand: "Ostrel", kind: "keyboard", price: 168, date: "3 Aug",
    reasons: [
      { t: "You ordered a wrist rest and switch lubricant in the same week. That reads as a planned desk project, not one click.", w: { plan: 3, mode: -1 } },
      { t: "You took the hot-swap board over the cheaper fixed one. That only pays off if you expect to change parts later.", w: { plan: 2, brand: 2 } },
      { t: "The cream colourway is S$40 more than black for identical internals. You paid that difference.", w: { mode: 3, price: 2 } },
      { t: "The old one died mid-week and you replaced it the same evening.", w: { plan: -3, brand: -2 } }
    ]
  },
  {
    id: "b2", name: "Torvald 3-seat sofa, sage", brand: "Torvald", kind: "sofa", price: 1290, date: "11 Jun",
    reasons: [
      { t: "Six weeks passed between your fabric-sample order and this purchase. Sampled, slept on, then committed.", w: { plan: 3, price: 1 } },
      { t: "Same maker as your bed frame and your shelf. You buy the house, not the piece.", w: { brand: -3, mode: 1 } },
      { t: "The identical frame in grey was 22% cheaper. The sage cost you S$280 in colour alone.", w: { mode: 3, price: 2 } },
      { t: "It was the last one in a warehouse clearance and you took it that evening.", w: { plan: -3, price: -2 } }
    ]
  },
  {
    id: "b3", name: "Coffee beans 1 kg — 5th order", brand: "Ridge Roasters", kind: "mug", price: 34, date: "2 Sep",
    reasons: [
      { t: "Fifth identical order of the same roast. When something works, you stop shopping for it.", w: { brand: -3, plan: 1 } },
      { t: "You moved from 250 g bags to the 1 kg. Unit price drops 31% and you did that maths.", w: { price: -3, plan: 2 } },
      { t: "You reorder on the morning it runs out, never before.", w: { plan: -2, mode: -1 } },
      { t: "You've never tried the other nine roasts this roaster sells, or anyone else's.", w: { brand: -2, mode: -2 } }
    ]
  },
  {
    id: "b4", name: "Nocturne wool overshirt", brand: "Nocturne", kind: "jacket", price: 210, date: "19 Jul",
    reasons: [
      { t: "Third piece from the same small label this year. You've found a look and you're staying inside it.", w: { brand: -2, mode: 2 } },
      { t: "Full price, three days after the drop, no code used. Nothing about that is patient.", w: { plan: -2, price: 2 } },
      { t: "Merino, taped seams, a ten-year repair policy — you bought the spec sheet, not the photo.", w: { mode: -2, plan: 2 } },
      { t: "You needed a jacket for a Seoul trip that week and this was in stock.", w: { plan: -3, mode: -2 } }
    ]
  },
  {
    id: "b5", name: "Kessel travel kettle 0.5 L", brand: "Kessel", kind: "kettle", price: 45, date: "28 Jul",
    reasons: [
      { t: "Bought two days before a flight — a gap you noticed late and closed with the first thing that worked.", w: { plan: -3, mode: -2 } },
      { t: "Dual voltage, folding handle, 480 g. You chose on constraints, and the constraints were travel.", w: { mode: -3, plan: 1 } },
      { t: "Cheapest of the four models that had dual voltage — you found the floor of the requirement.", w: { price: -3, plan: 1 } },
      { t: "It matches your kitchen palette, which the S$29 one didn't.", w: { mode: 3, price: 1 } }
    ]
  },
  {
    id: "b6", name: "Aurel Drift 2 headphones", brand: "Aurel Audio", kind: "headphone", price: 79, date: "12 Sep",
    reasons: [
      { t: "Nine days, six models compared, and you landed on the mid-priced one with the best documented mics.", w: { plan: 3, price: -2 } },
      { t: "Aurel is a brand you'd never bought from. You went with the evidence over the familiar name.", w: { brand: 2, plan: 1 } },
      { t: "You capped yourself at S$100 and never looked above the line, even at the reviewers' favourite.", w: { price: -3, plan: 2 } },
      { t: "It was on the storefront at 30% off and you bought it that day.", w: { plan: -3, price: -2 } }
    ]
  },
  {
    id: "b7", name: "Hand-glazed mug, run of 40", brand: "Vessel Studio", kind: "carafe", price: 62, date: "30 Aug",
    reasons: [
      { t: "S$62 for a mug is not a function purchase. This one is about the shelf it sits on.", w: { mode: 3, price: 2 } },
      { t: "A numbered run of 40 that sold out in an hour. What you bought was the scarcity.", w: { plan: -2, brand: 2 } },
      { t: "Fourth piece from the same ceramicist. You're collecting a maker, not a mug.", w: { brand: -2, mode: 2 } },
      { t: "It was a gift for someone else — don't read me into it.", w: {}, x: true }
    ]
  },
  {
    id: "b8", name: "Ardent standing desk frame", brand: "Ardent", kind: "desk", price: 540, date: "5 May",
    reasons: [
      { t: "You bought the frame alone and kept your old desktop. That's a targeted fix, not a new setup.", w: { mode: -3, price: -2 } },
      { t: "Top of the three frames, chosen for a 120 kg lift rating you will never get near.", w: { price: 3, plan: 2 } },
      { t: "You waited five weeks for it to come back in stock rather than take the available alternative.", w: { plan: 3, brand: -2 } },
      { t: "Your back hurt and you ordered the first one with next-day delivery.", w: { plan: -3, mode: -2 } }
    ]
  }
];

const BATCHES = [["b1", "b2", "b3", "b4"], ["b5", "b6", "b7", "b8"]];

/* ── tie-break questions, one per axis ──────────────────── */
const QUESTIONS = {
  plan: {
    q: "Your everyday bag rips on a Tuesday. What actually happens next?",
    opts: [
      { t: "Reorder the same one tonight", w: { plan: -2, brand: -3 } },
      { t: "Open a comparison sheet", w: { plan: 3, mode: -1 } },
      { t: "Carry the ripped one for a month", w: { plan: 1, price: -2 } }
    ]
  },
  price: {
    q: "Two versions of the same tool: S$40, or S$120 that lasts about twice as long.",
    opts: [
      { t: "Take the S$120", w: { price: 3, plan: 1 } },
      { t: "Take the S$40 twice", w: { price: -3 } },
      { t: "Hunt for a S$70 middle", w: { price: -1, plan: 3 } }
    ]
  },
  mode: {
    q: "Same chair, same spec. The colour you actually want costs S$60 more.",
    opts: [
      { t: "Pay the S$60", w: { mode: 3, price: 1 } },
      { t: "Take the cheaper colour", w: { mode: -3, price: -1 } },
      { t: "Only if people see it", w: { mode: 1 } }
    ]
  },
  brand: {
    q: "A brand you've bought four times ships v2. A brand you've never tried reviews slightly better.",
    opts: [
      { t: "Stay with the one I know", w: { brand: -3 } },
      { t: "Try the new one", w: { brand: 3, plan: 1 } },
      { t: "Wait six months for reviews", w: { plan: 3, brand: 1 } }
    ]
  }
};

/* ── individual needs ───────────────────────────────────── */
const NEEDS = [
  { k: "wfh",    label: "Works from home" },
  { k: "small",  label: "Small apartment" },
  { k: "travel", label: "Travels monthly" },
  { k: "quiet",  label: "Noise-sensitive" },
  { k: "cook",   label: "Cooks daily" },
  { k: "pet",    label: "Has a cat" },
  { k: "gift",   label: "Buys gifts often" },
  { k: "gym",    label: "Trains 3× a week" }
];

const NEED_WORDS = [
  [/\b(studio|small (flat|apartment|place)|tiny|no space|cramped)\b/i, "small"],
  [/\b(work from home|wfh|home office|remote|desk all day)\b/i, "wfh"],
  [/\b(travel|flight|flying|trip|abroad|overseas)\b/i, "travel"],
  [/\b(noise|noisy|quiet|thin walls|neighbou?r)\b/i, "quiet"],
  [/\b(cook|cooking|kitchen|meal|baking)\b/i, "cook"],
  [/\b(cat|kitten|pet)\b/i, "pet"],
  [/\b(gift|present|birthday|wedding)\b/i, "gift"],
  [/\b(gym|training|workout|run|lifting)\b/i, "gym"]
];

/* ── catalogue. fit = where a product sits on each axis ──── */
const CATALOGUE = [
  { id: "c1",  name: "Vantor Task Chair Mk2", brand: "Vantor", kind: "chair", price: 680,
    fit: { plan: 60, price: 55, mode: -40, brand: -20 }, needs: ["wfh"],
    note: "Ten-year parts warranty and a published lumbar spec — a researched, keep-it-forever purchase." },
  { id: "c2",  name: "Lume Arc desk lamp", brand: "Lume", kind: "lamp", price: 139,
    fit: { mode: 55, price: 25, plan: 20 }, needs: ["wfh", "small"],
    note: "Sold on how the room looks with it, not on lumens." },
  { id: "c3",  name: "Hollo fold-flat drying rack", brand: "Hollo", kind: "rack", price: 58,
    fit: { mode: -65, price: -45, plan: 30 }, needs: ["small"],
    note: "Pure problem-solving: it disappears into a 6 cm gap and does nothing else." },
  { id: "c4",  name: "Kessel Compact espresso", brand: "Kessel", kind: "pan", price: 320,
    fit: { plan: 50, price: 45, mode: 20, brand: -25 }, needs: ["cook"],
    note: "The version people buy after reading for a month; same maker as your kettle." },
  { id: "c5",  name: "Nocturne canvas weekender", brand: "Nocturne", kind: "bag", price: 245,
    fit: { mode: 45, price: 30, brand: -50 }, needs: ["travel"],
    note: "Fourth piece from a label you already wear — the loyal, expressive pick." },
  { id: "c6",  name: "Aurel Field ANC", brand: "Aurel Audio", kind: "headphone", price: 210,
    fit: { plan: 45, price: 35, mode: -30, brand: -30 }, needs: ["travel", "quiet"],
    note: "The documented step up from the Drift 2 you already chose on evidence." },
  { id: "c7",  name: "Torvald Shelf 88", brand: "Torvald", kind: "shelf", price: 410,
    fit: { brand: -65, plan: 40, mode: 25 }, needs: ["small"],
    note: "Matches the sofa and the bed frame. Nothing new to decide." },
  { id: "c8",  name: "Mira everyday merino tee", brand: "Mira", kind: "shirt", price: 89,
    fit: { mode: 30, price: 30, brand: -30, plan: 20 }, needs: [],
    note: "One shirt, bought three times, worn until it fails." },
  { id: "c9",  name: "Grid restock set — 12 socks", brand: "Grid", kind: "sock", price: 46,
    fit: { mode: -75, price: -50, brand: -50, plan: 15 }, needs: [],
    note: "The least interesting purchase available, which is the point of it." },
  { id: "c10", name: "Fenn acoustic panel set", brand: "Fenn", kind: "panel", price: 168,
    fit: { plan: 45, mode: 15, price: 10 }, needs: ["quiet", "wfh"],
    note: "Bought after measuring the problem, not after hearing about it." },
  { id: "c11", name: "Paloma cat tower, oak", brand: "Paloma", kind: "cat", price: 189,
    fit: { mode: 55, price: 35 }, needs: ["pet"],
    note: "Costs 3× the carpeted one because you have to look at it every day." },
  { id: "c12", name: "Orbit packing cube set", brand: "Orbit", kind: "cube", price: 39,
    fit: { mode: -55, price: -40, plan: 45 }, needs: ["travel"],
    note: "Cheap, dull, and it removes a recurring annoyance permanently." },
  { id: "c13", name: "Vessel hand-thrown carafe", brand: "Vessel Studio", kind: "carafe", price: 95,
    fit: { mode: 70, price: 40, brand: 25 }, needs: ["gift", "cook"],
    note: "From the studio whose mug you already own; the next piece in a set you're building." },
  { id: "c14", name: "Rove Trail Runner v4", brand: "Rove", kind: "shoe", price: 175,
    fit: { brand: -55, plan: 35, mode: -25 }, needs: ["gym"],
    note: "The v3 worked, so this is a rebuy with a version number on it." },
  { id: "c15", name: "Nova switch sampler kit", brand: "Nova", kind: "keyboard", price: 24,
    fit: { brand: 65, plan: 25, mode: 30, price: -35 }, needs: ["wfh"],
    note: "Nine switch types to try, which only appeals if you like changing things." },
  { id: "c16", name: "Halden induction pan 24 cm", brand: "Halden", kind: "pan", price: 118,
    fit: { mode: -45, price: 30, plan: 45 }, needs: ["cook", "small"],
    note: "One pan, oven-safe, the researched answer to owning fewer pans." }
];

/* ── state ──────────────────────────────────────────────── */
const state = {
  budget: 450,
  needs: new Set(["wfh", "small"]),
  notes: [],
  stage: 0,          // 0 nothing · 1,2 purchase batches · 3 tie-break · 4 final
  answers: [],
  lock: null,        // type code the user insisted on
  busy: false
};

const $ = (s) => document.querySelector(s);
const thread = $("#thread");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const scroll = () => { thread.scrollTop = thread.scrollHeight; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n) => n.toLocaleString("en-SG");
const byId = (id) => PURCHASES.find((p) => p.id === id);
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ============================================================
   THE ACTUAL MODEL — small, deterministic, inspectable
   ============================================================ */

/* Every accepted reading pushes the four axes. A reading the user
   corrected counts for more than one the analyst guessed, and a
   direct answer counts for more than either. */
function axes() {
  const a = { plan: 0, price: 0, mode: 0, brand: 0 };
  PURCHASES.forEach((p) => {
    if (!p.read || p.out) return;
    const r = p.reasons[p.pick];
    const weight = p.fixed ? 1.6 : 1;
    for (const ax in r.w) a[ax] += r.w[ax] * weight;
  });
  state.answers.forEach((ans) => {
    for (const ax in ans.w) a[ax] += ans.w[ax] * 1.8;
  });
  for (const ax in a) a[ax] = clamp(Math.round(a[ax] * 9), -100, 100);

  // a user-declared type outranks the evidence, but doesn't erase it
  if (state.lock) {
    state.lock.split("").forEach((L, i) => {
      const A = AXES[i];
      const sign = L === A.posL ? 1 : -1;
      a[A.k] = clamp(Math.round(a[A.k] * 0.3 + sign * 62), -100, 100);
    });
  }
  return a;
}

const code = (a) => AXES.map((A) => (a[A.k] >= 0 ? A.posL : A.negL)).join("");
const poleOf = (A, a) => (a[A.k] >= 0 ? A.pos : A.neg);

function confidence() {
  const read = PURCHASES.filter((p) => p.read && !p.out).length;
  const fixed = PURCHASES.filter((p) => p.fixed).length;
  const c = 8 + read * 7 + fixed * 3 + state.answers.length * 6 +
            (state.lock ? 14 : 0) + (state.stage >= 4 ? 6 : 0);
  return clamp(Math.round(c), 0, 95);
}

const sortedAxes = (a) => [...AXES].sort((x, y) => Math.abs(a[x.k]) - Math.abs(a[y.k]));
const weakest = (a) => sortedAxes(a)[0];
const strongest = (a) => sortedAxes(a)[3];

/* Budget is a hard filter in code, exactly as in the ShopWise build —
   the personality is never allowed to recommend past the cap. */
function rank() {
  const a = axes();
  const affordable = CATALOGUE.filter((p) => p.price <= state.budget);
  const pool = affordable.length ? affordable : [...CATALOGUE].sort((x, y) => x.price - y.price).slice(0, 3);
  return {
    over: CATALOGUE.length - affordable.length,
    tight: !affordable.length,
    list: pool.map((p) => ({ ...p, score: score(p, a), why: why(p, a) })).sort((x, y) => y.score - x.score)
  };
}

/* ctx lets the same scorer run against a context that isn't the
   single user — see the couple case below. Left out, it scores
   exactly as it always did. */
function score(p, a, ctx) {
  const needs = ctx ? ctx.needs : state.needs;
  const budget = ctx ? ctx.budget : state.budget;
  const conf = ctx ? ctx.conf : confidence();
  let acc = 0, wsum = 0;
  for (const ax in p.fit) {
    const w = Math.abs(p.fit[ax]) / 100;
    const dist = Math.abs(p.fit[ax] - a[ax]) / 200;
    acc += (1 - dist) * w;
    wsum += w;
  }
  const axisFit = wsum ? acc / wsum : 0.5;
  const needFit = p.needs.length
    ? p.needs.filter((n) => needs.has(n)).length / p.needs.length
    : 0.45;
  const headroom = 1 - Math.min(1, p.price / Math.max(budget, 1)) * 0.55;
  const raw = 0.56 * axisFit + 0.26 * needFit + 0.18 * headroom;
  // an uncertain profile can't claim a precise match, so scores start hedged
  return Math.round(100 * raw * (0.74 + 0.26 * conf / 100));
}

/* The sentence under each recommendation: which axis carried it,
   which stated need it serves, and what it costs against the cap. */
function why(p, a) {
  const bits = [];
  const aligned = Object.keys(p.fit)
    .filter((ax) => Math.sign(p.fit[ax]) === Math.sign(a[ax] || p.fit[ax]) && Math.abs(a[ax]) > 12)
    .sort((x, y) => Math.abs(p.fit[y]) - Math.abs(p.fit[x]));
  if (aligned.length) {
    const A = AXES.find((x) => x.k === aligned[0]);
    bits.push(`Reads <b>${poleOf(A, a)}</b>, like you`);
  } else {
    bits.push("A read on the axes you haven't pinned down yet");
  }
  const hit = p.needs.filter((n) => state.needs.has(n));
  if (hit.length) bits.push(`covers <b>${NEEDS.find((n) => n.k === hit[0]).label.toLowerCase()}</b>`);
  bits.push(`S$${fmt(p.price)} of a S$${fmt(state.budget)} month`);
  return bits.join(" · ") + ".";
}

/* ============================================================
   RENDERING
   ============================================================ */

function renderNeeds() {
  const ul = $("#needsList");
  ul.innerHTML = "";
  NEEDS.forEach((n) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (state.needs.has(n.k) ? " on" : "");
    b.textContent = n.label;
    b.onclick = () => {
      state.needs.has(n.k) ? state.needs.delete(n.k) : state.needs.add(n.k);
      refresh();
    };
    li.appendChild(b);
    ul.appendChild(li);
  });
  state.notes.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="chip note">“${escapeHtml(t)}”</span>`;
    ul.appendChild(li);
  });
}

function renderBuys() {
  const ul = $("#buysList");
  ul.innerHTML = "";
  PURCHASES.forEach((p) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "buy" + (p.read ? " read" : "") + (p.fixed ? " fixed" : "") + (p.out ? " out" : "");
    const r = p.read ? p.reasons[p.pick] : null;
    b.innerHTML = `
      ${tile(p.kind)}
      <div><div class="bn">${p.name}</div><div class="bd">${p.brand} · ${p.date}</div></div>
      <div class="bp">S$${fmt(p.price)}</div>
      ${r ? `<div class="bwhy${p.fixed ? " you" : ""}">${p.out ? "Excluded — " : p.fixed ? "Your read: " : ""}${r.t}</div>` : ""}`;
    b.onclick = () => jumpTo(p.id);
    li.appendChild(b);
    ul.appendChild(li);
  });
  const read = PURCHASES.filter((p) => p.read).length;
  $("#readCount").textContent = `${read} / ${PURCHASES.length} read`;
}

function renderType() {
  const box = $("#typeBox");
  if (!state.stage) {
    box.innerHTML = `<div class="type-card empty">No type yet. The analyst refuses to guess before it has read a purchase — ask it to start on the left history.</div>`;
    $("#axesBox").innerHTML = "";
    return;
  }
  const a = axes(), c = code(a), T = TYPES[c], conf = confidence();
  box.innerHTML = `
    <div class="type-card${state.lock ? " locked" : ""}">
      <div class="type-code">${c}</div>
      <div class="type-name">${T.name}</div>
      <p class="type-line">${T.line}</p>
      <div class="conf"><div class="conf-bar"><i></i></div><span>${conf}% confidence${state.lock ? " · your call, not mine" : ""}</span></div>
    </div>`;
  requestAnimationFrame(() => { const i = box.querySelector(".conf-bar i"); if (i) i.style.width = conf + "%"; });

  $("#axesBox").innerHTML = AXES.map((A) => {
    const v = a[A.k];
    const pos = 50 - v / 2;                       // positive pole sits on the left
    const left = Math.min(pos, 50), width = Math.abs(50 - pos);
    return `
      <div class="axis-row">
        <div class="axis-labels"><span class="${v >= 0 ? "on" : ""}">${A.pos}</span><span class="${v < 0 ? "on" : ""}">${A.neg}</span></div>
        <div class="axis-track"><b style="left:${left}%;width:${width}%"></b><u></u><i style="left:${pos}%"></i></div>
        <div class="axis-val">${A.name} · ${v === 0 ? "undecided" : Math.abs(v) + " toward " + poleOf(A, a)}</div>
      </div>`;
  }).join("");
}

function renderRecs() {
  const box = $("#recs"), title = $("#recsTitle"), sub = $("#recsSub");
  if (!state.stage) {
    box.innerHTML = "";
    title.textContent = "Recommendations";
    sub.textContent = "Nothing yet. The analyst needs at least one round of purchases before it will name anything.";
    return;
  }
  const HEAD = [
    ["Early picks", "A wide net off four purchases. Treat the percentages as loose."],
    ["Sharpened picks", "Eight purchases in. The axes have moved, and so have these."],
    ["Tuned picks", "Your two direct answers now outweigh anything I inferred."],
    ["Final picks", "Locked profile, hard budget cap, your stated situation."]
  ][clamp(state.stage - 1, 0, 3)];
  const n = state.stage >= 3 ? 3 : 4;

  const r = rank();
  title.textContent = HEAD[0];
  sub.innerHTML = `${HEAD[1]}${r.over ? ` <em style="color:var(--warn);font-style:normal">${r.over} item${r.over > 1 ? "s" : ""} dropped over budget.</em>` : ""}`;

  box.className = "recs";
  box.innerHTML = r.list.slice(0, n).map((p, i) => `
    <article class="rec" style="animation-delay:${i * 70}ms">
      ${tile(p.kind)}
      <div>
        <div class="rec-top">
          <div><div class="rec-name">${p.name}</div><div class="rec-brand">${p.brand}</div></div>
          <div class="rec-match"><b>${p.score}%</b><span>match</span></div>
        </div>
        <div class="meter"><i data-w="${p.score}"></i></div>
        <div class="rec-why">${p.why}</div>
        ${state.stage >= 3 ? `<div class="rec-foot">${p.note}</div>` : ""}
      </div>
    </article>`).join("");
  requestAnimationFrame(() => box.querySelectorAll(".meter i").forEach((m) => { m.style.width = m.dataset.w + "%"; }));
}

function renderStats() {
  $("#statRead").textContent = PURCHASES.filter((p) => p.read && !p.out).length;
  $("#statFixed").textContent = PURCHASES.filter((p) => p.fixed).length;
  $("#statConf").textContent = confidence() + "%";
}

function refresh() {
  renderNeeds();
  renderBuys();
  renderType();
  renderRecs();
  renderStats();
}

const setRound = (n) => { $("#roundPill").textContent = `Round ${n} of 4`; };

/* ── messages ───────────────────────────────────────────── */
function addMessage(role, html, { instant = false } = {}) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = `<div class="av">${role === "bot" ? "SP" : "YOU"}</div><div class="bubble"></div>`;
  thread.appendChild(msg);
  const bubble = msg.querySelector(".bubble");
  scroll();
  if (role === "user" || instant) { bubble.innerHTML = html; return Promise.resolve(bubble); }
  return typeOut(bubble, html).then(() => bubble);
}

/* progressive reveal; cuts are only taken outside markup so a
   half-written <b> never reaches the screen */
function safeCuts(html) {
  const cuts = [];
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const c = html[i];
    if (c === "<") inTag = true;
    else if (c === ">") { inTag = false; cuts.push(i + 1); }
    else if (!inTag) cuts.push(i + 1);
  }
  return cuts;
}

function typeOut(el, html) {
  return new Promise((resolve) => {
    const caret = document.createElement("span");
    caret.className = "caret";
    el.appendChild(caret);
    const cuts = safeCuts(html);
    let n = 0;
    const step = () => {
      n = Math.min(cuts.length, n + 4);
      el.innerHTML = html.slice(0, cuts[n - 1]);
      el.appendChild(caret);
      scroll();
      if (n < cuts.length) setTimeout(step, 9);
      else { caret.remove(); el.innerHTML = html; resolve(); }
    };
    step();
  });
}

function showTyping() {
  const t = document.createElement("div");
  t.className = "msg bot";
  t.innerHTML = `<div class="av">SP</div><div class="bubble typing"><i></i><i></i><i></i></div>`;
  thread.appendChild(t);
  scroll();
  return t;
}

/* quick replies: [label, handler][] */
function renderQuickies(bubble, opts) {
  const wrap = document.createElement("div");
  wrap.className = "quickies";
  opts.forEach(([label, fn]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => { wrap.remove(); fn(); };
    wrap.appendChild(b);
  });
  bubble.appendChild(wrap);
  scroll();
  return wrap;
}

function renderCallout(bubble, html) {
  const d = document.createElement("div");
  d.className = "callout";
  d.innerHTML = html;
  bubble.appendChild(d);
  scroll();
}

/* ── signal cards ───────────────────────────────────────── */
const axChip = (ax, v) => {
  const A = AXES.find((x) => x.k === ax);
  return `<span class="ax">${v > 0 ? A.pos : A.neg} +${Math.abs(v)}</span>`;
};

function paintSignal(el, p) {
  const r = p.reasons[p.pick];
  el.className = "signal" + (p.out ? " out" : p.fixed ? " fixed" : p.done ? " done" : "");
  const chips = Object.entries(r.w).map(([ax, v]) => axChip(ax, v)).join("");
  el.innerHTML = `
    <div class="sig-head">
      ${tile(p.kind)}
      <div><div class="sig-name">${p.name}</div><div class="sig-meta">${p.brand} · ${p.date}</div></div>
      <div class="sig-price">S$${fmt(p.price)}</div>
    </div>
    <div class="sig-reason">${p.out ? "<b>Not used as evidence.</b> " : ""}${r.t}</div>
    ${p.out || !chips ? "" : `<div class="sig-axes">${chips}</div>`}
    <div class="sig-actions">
      ${p.done
        ? `<span class="sig-verdict ${p.out ? "out" : p.fixed ? "you" : ""}">${p.out ? "excluded" : p.fixed ? "your reading" : "confirmed"}</span>
           <button class="mini-btn" data-no="${p.id}">Change it</button>`
        : `<button class="mini-btn" data-ok="${p.id}">That's right</button>
           <button class="mini-btn" data-no="${p.id}">Actually, no…</button>`}
    </div>`;
}

function signalEl(p) {
  const el = document.createElement("article");
  el.id = "sig-" + p.id;
  paintSignal(el, p);
  return el;
}

function openPicker(el, p) {
  if (el.querySelector(".reason-picker")) return;
  const box = document.createElement("div");
  box.className = "reason-picker";
  box.innerHTML = `<span class="rp-label">Why did you really buy it?</span>`;
  p.reasons.forEach((r, i) => {
    if (i === p.pick) return;
    const b = document.createElement("button");
    b.className = "rp" + (r.x ? " rp-out" : "");
    const chips = Object.entries(r.w).map(([ax, v]) => `${v > 0 ? AXES.find((x) => x.k === ax).pos : AXES.find((x) => x.k === ax).neg} +${Math.abs(v)}`).join(" · ");
    b.innerHTML = `${r.t}<span class="rp-ax">${r.x ? "drops this purchase from the model" : "moves: " + chips}</span>`;
    b.onclick = () => choose(p, i);
    box.appendChild(b);
  });
  el.appendChild(box);
  scroll();
}

async function choose(p, i) {
  p.pick = i;
  p.fixed = true;
  p.done = true;
  p.out = !!p.reasons[i].x;
  const el = $("#sig-" + p.id);
  if (el) paintSignal(el, p);
  refresh();
  if (state.busy) return;
  state.busy = true;
  const [ax, v] = Object.entries(p.reasons[i].w)[0] || [];
  const A = AXES.find((x) => x.k === ax);
  await addMessage("bot", p.out
    ? `Dropped <b>${p.name}</b> from the evidence. A gift says more about the recipient than about you — the type now rests on ${PURCHASES.filter((x) => x.read && !x.out).length} purchases.`
    : `Taken. That reading pulls you toward <b>${v > 0 ? A.pos : A.neg}</b>, and I'm weighting it 1.6× against my own guess from here. Confidence ${confidence()}%.`);
  state.busy = false;
}

function confirmSignal(p) {
  p.done = true;
  p.fixed = false;
  const el = $("#sig-" + p.id);
  if (el) paintSignal(el, p);
  refresh();
}

function jumpTo(id) {
  const el = $("#sig-" + id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 900);
}

/* ============================================================
   THE FOUR ROUNDS
   ============================================================ */

const BATCH_INTRO = [
  "Reading the four oldest purchases first. For each one I'll say what I think it means and what it does to the four axes — argue with any of them.",
  "Four more. These are the recent ones, and they're the ones pulling hardest, because nothing here says a person has to stay the same."
];

async function runBatch(n) {
  if (state.busy) return;
  state.busy = true;
  state.stage = Math.max(state.stage, n + 1);
  setRound(n + 1);

  const t = showTyping();
  await wait(750);
  t.remove();

  const b = await addMessage("bot", BATCH_INTRO[n]);
  const wrap = document.createElement("div");
  wrap.className = "signals";
  b.appendChild(wrap);

  for (const id of BATCHES[n]) {
    const p = byId(id);
    p.read = true;
    p.pick = 0;
    wrap.appendChild(signalEl(p));
    refresh();
    scroll();
    await wait(620);
  }
  state.busy = false;
  await verdict();
}

async function verdict() {
  const a = axes(), c = code(a), T = TYPES[c], conf = confidence();
  const w = weakest(a), s = strongest(a);
  refresh();

  const t = showTyping();
  await wait(600);
  t.remove();

  let txt;
  if (state.stage === 1) {
    txt = `Current read: <b>${c} — ${T.name}</b>, ${conf}% confidence. ${T.line}<br><br>` +
      `The ${s.name.toLowerCase()} axis is the one I'd defend — you sit ${Math.abs(a[s.k])} toward <b>${poleOf(s, a)}</b>. ` +
      `The ${w.name.toLowerCase()} axis is nearly a coin flip at ${Math.abs(a[w.k])}, so the <b>${code(a)[AXES.indexOf(w)]}</b> in that code is the letter most likely to be wrong.`;
  } else if (state.stage === 2) {
    txt = `Eight purchases in. <b>${c} — ${T.name}</b> at ${conf}%. ` +
      `Recommendations on the right have moved with it — ${state.needs.size} stated need${state.needs.size === 1 ? "" : "s"} and a S$${fmt(state.budget)} cap are doing the rest of the filtering.<br><br>` +
      `<b>${poleOf(w, a)}</b> is still the shakiest call. Two questions would fix that faster than ten more receipts.`;
  } else {
    txt = `With your answers weighted in: <b>${c} — ${T.name}</b>, ${conf}%. ` +
      `Your direct answers now count for nearly twice what my inferences do, which is why ${poleOf(w, a)} stopped wobbling.`;
  }

  const b = await addMessage("bot", txt);
  const next = [];
  if (state.stage === 1) next.push(["Read the other four", () => runBatch(1)]);
  if (state.stage === 2) next.push(["Ask me the two questions", () => runTiebreak()]);
  if (state.stage === 3) next.push(["Give me the final picks", () => runFinal()]);
  next.push(["That type isn't me", () => typesModal()]);
  next.push(["Show the evidence trail", () => trailModal()]);
  renderQuickies(b, next);
}

async function askAxis(A) {
  const q = QUESTIONS[A.k];
  const b = await addMessage("bot", `<b>${A.name}.</b> ${q.q}`);
  return new Promise((resolve) => {
    renderQuickies(b, q.opts.map((o) => [o.t, async () => {
      await addMessage("user", escapeHtml(o.t));
      state.answers.push({ ax: A.k, t: o.t, w: o.w });
      refresh();
      await wait(260);
      resolve();
    }]));
  });
}

async function runTiebreak() {
  if (state.busy) return;
  state.busy = true;
  state.stage = 3;
  setRound(3);
  const a = axes();
  const two = sortedAxes(a).slice(0, 2);
  const t = showTyping();
  await wait(650);
  t.remove();
  await addMessage("bot",
    `Two questions, aimed at the two axes the receipts didn't settle: <b>${two[0].name.toLowerCase()}</b> and <b>${two[1].name.toLowerCase()}</b>. Answer as you actually behave, not as you'd like to.`);
  for (const A of two) await askAxis(A);
  state.busy = false;
  await verdict();
}

async function runFinal() {
  if (state.busy) return;
  state.busy = true;
  state.stage = 4;
  setRound(4);
  refresh();

  const a = axes(), c = code(a), T = TYPES[c], conf = confidence();
  const r = rank();
  const top = r.list.slice(0, 3);
  const skip = r.list[r.list.length - 1];
  const spend = top.reduce((n, p) => n + p.price, 0);

  const t = showTyping();
  await wait(800);
  t.remove();

  const mine = PURCHASES.filter((p) => p.fixed).length;
  const b = await addMessage("bot",
    `Final read: <b>${c} — ${T.name}</b> at ${conf}%. I'll stop short of calling it certain` +
    `${mine ? `; ${mine} of these readings ${mine === 1 ? "is" : "are"} yours rather than mine, and that's the part I trust most` : ", and you took every reading of mine as it came, which is exactly the part I'd want you to push back on"}.<br><br>` +
    `Three picks, in order. <b>${top[0].name}</b> leads at ${top[0].score}%: ${top[0].note}`);

  renderCallout(b,
    `<b>Budget check.</b> All three together are S$${fmt(spend)} against your S$${fmt(state.budget)} month` +
    `${spend > state.budget ? ` — that's S$${fmt(spend - state.budget)} over, so they're a sequence, not a basket.` : `, which leaves S$${fmt(state.budget - spend)}.`}` +
    `${r.over ? ` ${r.over} catalogue item${r.over > 1 ? "s were" : " was"} never shown to you at all: over the cap.` : ""}<br><br>` +
    `<b>What I'd skip.</b> ${skip.name} at ${skip.score}% — ${skip.note.charAt(0).toLowerCase() + skip.note.slice(1)} That suits ${oppositeName(c)}, not you.`);

  renderQuickies(b, [
    [`Now do it with ${PARTNER.name}`, () => runCouple()],
    ["Show the evidence trail", () => trailModal()],
    ["I still think the type is wrong", () => typesModal()],
    ["Start over", () => boot()]
  ]);
  state.busy = false;
}

const oppositeName = (c) => {
  const flip = c.split("").map((L, i) => (L === AXES[i].posL ? AXES[i].negL : AXES[i].posL)).join("");
  return TYPES[flip].name;
};

/* ============================================================
   ONE CASE: TWO PEOPLE, ONE DECISION
   ------------------------------------------------------------
   The argument this case exists to make: a model that holds more
   context than either person in the room can arbitrate better
   than the two of them negotiating from memory. Neither half of
   a couple can recall the other's twelve months of receipts
   while arguing about a sofa on a Sunday. The model can, and it
   can score both sets against one cap without wanting anything.

   Everything here is additive and read-only. The four rounds
   never look at it, no state is mutated, and the single-person
   profile on the right is untouched by running it.
   ============================================================ */

const PARTNER = {
  name: "Noor",
  budget: 520,
  needs: ["small", "cook", "gift"],
  /* Their history, read exactly the way yours is: one claim per
     purchase, one axis push. They volunteered these, so none of
     them carry a correction weight. */
  purchases: [
    { name: "Anouk ribbed floor lamp, ochre", brand: "Anouk", kind: "lamp", price: 290, date: "21 Aug",
      t: "Bought forty minutes after seeing it in a friend's flat, at full price. No list, no comparison, no wait.",
      w: { plan: -3, price: 2, mode: 2 } },
    { name: "Marran silk throw", brand: "Marran", kind: "jacket", price: 180, date: "2 Jul",
      t: "Fourth piece from the same atelier this year. The palette is settled; only the object changes.",
      w: { brand: -3, mode: 2 } },
    { name: "Lacour dinner plates, set of 6", brand: "Lacour", kind: "pan", price: 240, date: "14 Sep",
      t: "Took the hand-finished rim over the plain set at half the price — for plates that live in a cupboard.",
      w: { mode: 3, price: 3 } },
    { name: "Marran candle — 3rd reorder", brand: "Marran", kind: "carafe", price: 68, date: "28 Aug",
      t: "Third reorder of a S$68 candle. Not thrift, but not novelty either: a habit held at a premium.",
      w: { price: 2, brand: -2, plan: -1 } }
  ]
};

/* The shortlist the two of you have actually been arguing about.
   champion says who brought it to the table — the third one is
   nobody's, which is the part worth watching. */
const SHARED = [
  { id: "s1", name: "Torvald Loom 2-seat, grey", brand: "Torvald", kind: "sofa", price: 940,
    fit: { plan: 55, price: -30, mode: -55, brand: -60 }, needs: ["small"], champion: "you",
    forYou: "Same maker as your sofa and your shelf, a published ten-year frame warranty, and the grey costs nothing extra.",
    forThem: "The fourth grey object in a room they have spent a year trying to give a colour to." },
  { id: "s2", name: "Anouk Verre sideboard, ochre", brand: "Anouk", kind: "shelf", price: 1180,
    fit: { mode: 70, price: 55, plan: -35, brand: 25 }, needs: ["small", "gift"], champion: "them",
    forYou: "S$1,180 of storage you already have, from a maker neither of you has tested once.",
    forThem: "The only thing on this list anyone would look at on purpose." },
  { id: "s3", name: "Marran oiled-ash low table", brand: "Marran", kind: "desk", price: 720,
    fit: { plan: 35, price: 15, mode: 35, brand: -50 }, needs: ["small", "cook"], champion: null,
    forYou: "A published repair policy, replaceable legs, and the cheapest of the three by S$220.",
    forThem: "Marran again — the fifth piece, in the palette they already chose." }
];

const sumAxes = (list) => {
  const a = { plan: 0, price: 0, mode: 0, brand: 0 };
  list.forEach((p) => { for (const ax in p.w) a[ax] += p.w[ax]; });
  for (const ax in a) a[ax] = clamp(Math.round(a[ax] * 9), -100, 100);
  return a;
};

const partnerAxes = () => sumAxes(PARTNER.purchases);
/* Same shape as confidence(): a base, plus each purchase read, plus
   the correction weight — theirs are self-reported, so they all count
   as corrected. Four purchases is thin, and the figure says so. */
const partnerConf = () => clamp(8 + PARTNER.purchases.length * 7 + PARTNER.purchases.length * 3, 0, 95);

/* The merge is a confidence-weighted midpoint, not a polite average:
   whoever the model has read more of pulls harder. That's a bias, so
   the ruling prints the split instead of burying it. */
function jointAxes() {
  const you = axes(), them = partnerAxes();
  const wy = confidence(), wt = partnerConf(), tot = wy + wt || 1;
  const a = {};
  AXES.forEach((A) => { a[A.k] = clamp(Math.round((you[A.k] * wy + them[A.k] * wt) / tot), -100, 100); });
  return a;
}

const jointShare = () => Math.round(100 * confidence() / (confidence() + partnerConf() || 1));
const jointBudget = () => state.budget + PARTNER.budget;
const jointNeeds = () => new Set([...state.needs, ...PARTNER.needs]);

/* Two people are less certain than one, because the disagreement is
   real rather than noise. The average confidence takes a penalty for
   how far apart the two profiles sit. */
function jointConf() {
  const you = axes(), them = partnerAxes();
  const gap = AXES.reduce((n, A) => n + Math.abs(you[A.k] - them[A.k]), 0) / 4;
  return clamp(Math.round((confidence() + partnerConf()) / 2 - gap / 8), 0, 95);
}

const jointCtx = () => ({ needs: jointNeeds(), budget: jointBudget(), conf: jointConf() });
/* your profile, but judged on the joint cap — so the only thing that
   differs between the two rankings is whose context was in the room */
const soloCtx = () => ({ needs: state.needs, budget: jointBudget(), conf: confidence() });

function rankShared(a, ctx) {
  const affordable = SHARED.filter((p) => p.price <= ctx.budget);
  const pool = affordable.length ? affordable : [...SHARED].sort((x, y) => x.price - y.price).slice(0, 1);
  return {
    over: SHARED.filter((p) => p.price > ctx.budget),
    list: pool.map((p) => ({ ...p, score: score(p, a, ctx) })).sort((x, y) => y.score - x.score)
  };
}

const CHAMP = { you: "your pick", them: `${PARTNER.name}'s pick` };

function partnerCards() {
  return `<div class="signals">${PARTNER.purchases.map((p) => `
    <article class="signal done theirs">
      <div class="sig-head">
        ${tile(p.kind)}
        <div><div class="sig-name">${p.name}</div><div class="sig-meta">${p.brand} · ${p.date}</div></div>
        <div class="sig-price">S$${fmt(p.price)}</div>
      </div>
      <div class="sig-reason">${p.t}</div>
      <div class="sig-axes">${Object.entries(p.w).map(([ax, v]) => axChip(ax, v)).join("")}</div>
    </article>`).join("")}</div>`;
}

function duoCard(you, them) {
  const mini = (who, c, conf, cls) => `
    <div class="duo-card ${cls}">
      <span class="who">${who}</span>
      <div class="type-code">${c}</div>
      <div class="type-name">${TYPES[c].name}</div>
      <p class="type-line">${TYPES[c].line}</p>
      <span class="duo-conf">${conf}% confidence</span>
    </div>`;
  return `<div class="duo">
    ${mini("You", code(you), confidence(), "u")}
    ${mini(PARTNER.name, code(them), partnerConf(), "t")}
  </div>`;
}

/* One track per axis, two markers on it. The bar between them is the
   disagreement — the whole negotiation, drawn to scale. */
function agreementMap(you, them) {
  return `<div class="pair-key"><span class="k-u">you</span><span class="k-t">${PARTNER.name}</span><span class="k-g">the gap you're actually arguing about</span></div>
  <div class="axes pair-axes">${AXES.map((A) => {
    const py = 50 - you[A.k] / 2, pt = 50 - them[A.k] / 2;
    const gap = Math.abs(py - pt);
    const same = Math.sign(you[A.k] || 1) === Math.sign(them[A.k] || 1);
    return `
      <div class="axis-row">
        <div class="axis-labels"><span class="${you[A.k] >= 0 ? "on" : ""}">${A.pos}</span><span class="${you[A.k] < 0 ? "on" : ""}">${A.neg}</span></div>
        <div class="axis-track">
          <b class="${same ? "agree" : "gap"}" style="left:${Math.min(py, pt)}%;width:${gap}%"></b>
          <u></u>
          <i style="left:${py}%"></i><i class="them" style="left:${pt}%"></i>
        </div>
        <div class="axis-val">${A.name} · ${same
          ? `agreed on <b style="color:var(--accent)">${poleOf(A, you)}</b>`
          : `<b style="color:var(--warn)">${Math.round(gap * 2)} apart</b> — you ${poleOf(A, you).toLowerCase()}, ${PARTNER.name} ${poleOf(A, them).toLowerCase()}`}</div>
      </div>`;
  }).join("")}</div>`;
}

function sharedCards(list) {
  return `<div class="recs">${list.map((p, i) => `
    <article class="rec" style="animation-delay:${i * 70}ms">
      ${tile(p.kind)}
      <div>
        <div class="rec-top">
          <div>
            <div class="rec-name">${p.name}</div>
            <div class="rec-brand">${p.brand} · S$${fmt(p.price)}
              ${p.champion ? `<span class="tag ${p.champion === "you" ? "tag-you" : "tag-ok"}">${CHAMP[p.champion]}</span>`
                           : `<span class="tag tag-warn">nobody's pick</span>`}</div>
          </div>
          <div class="rec-match"><b>${p.score}%</b><span>joint</span></div>
        </div>
        <div class="meter"><i data-w="${p.score}"></i></div>
        <div class="rec-why"><b>For you:</b> ${p.forYou}</div>
        <div class="rec-foot"><b>For ${PARTNER.name}:</b> ${p.forThem}</div>
      </div>
    </article>`).join("")}</div>`;
}

async function runCouple() {
  if (state.busy) return;
  if (!state.stage) {
    const b = await addMessage("bot",
      `I can't arbitrate for two people while I've read nothing about one of them. Let me read your purchases first — ${PARTNER.name}'s four are already on file.`);
    renderQuickies(b, [["Read my purchase history", () => runBatch(0)]]);
    return;
  }
  state.busy = true;

  const t = showTyping();
  await wait(780);
  t.remove();

  await addMessage("bot",
    `A type is easy to argue about on your own. The harder case is two of you and one flat. ` +
    `<b>${PARTNER.name}</b> has been through this on their side — four purchases, read the same way yours were.<br><br>` +
    `Neither of you can hold the other's twelve months of receipts in your head during an argument about a sofa. I can. ` +
    `That's the only advantage I have here: not taste, <b>context</b>.`);

  const you = axes(), them = partnerAxes();

  const b1 = await addMessage("bot", `What their receipts say:`);
  b1.insertAdjacentHTML("beforeend", partnerCards());
  scroll();
  await wait(700);

  const b2 = await addMessage("bot",
    `Separately, you are <b>${code(you)}</b> and ${PARTNER.name} is <b>${code(them)}</b>. ` +
    `That's ${[...code(you)].filter((L, i) => L !== code(them)[i]).length} of four letters apart.`);
  b2.insertAdjacentHTML("beforeend", duoCard(you, them));
  b2.insertAdjacentHTML("beforeend", agreementMap(you, them));
  scroll();
  await wait(820);

  const j = jointAxes(), jc = code(j), share = jointShare();
  const jointRank = rankShared(j, jointCtx());
  const soloRank = rankShared(you, soloCtx());
  const top = jointRank.list[0], soloTop = soloRank.list[0];

  const b3 = await addMessage("bot",
    `Merged, the household reads <b>${jc} — ${TYPES[jc].name}</b> at ${jointConf()}%. ` +
    `Lower than either of you alone, because the disagreement is real and I'm not going to average it away.<br><br>` +
    `The merge is weighted <b>${share} / ${100 - share}</b> toward you — not because you're more right, but because I've read ` +
    `${PURCHASES.filter((p) => p.read && !p.out).length} of your purchases against ${PARTNER.purchases.length} of ${PARTNER.name}'s. ` +
    `If they read in four more, this number moves and so might the ruling.`);

  renderCallout(b3,
    `<b>Joint cap.</b> S$${fmt(state.budget)} of yours plus S$${fmt(PARTNER.budget)} of theirs — S$${fmt(jointBudget())}, enforced in code before either of you gets a vote.` +
    (jointRank.over.length
      ? ` ${jointRank.over.map((p) => `<b>${p.name}</b> at S$${fmt(p.price)}`).join(", ")} never reached the ranking. Raise the cap on the left and ${jointRank.over.length > 1 ? "they come" : "it comes"} back.`
      : ` All three cleared it.`));

  await wait(640);
  const b4 = await addMessage("bot", `Three items, scored against the merged profile and the joint cap:`);
  b4.insertAdjacentHTML("beforeend", sharedCards(jointRank.list));
  requestAnimationFrame(() => b4.querySelectorAll(".meter i").forEach((m) => { m.style.width = m.dataset.w + "%"; }));
  scroll();
  await wait(820);

  const flipped = soloTop.id !== top.id;
  const soloScore = score(top, you, soloCtx());
  // each side's concession, stated in the other one's words
  const conceded = SHARED.filter((p) => p.champion && p.id !== top.id).map((p) => p.champion === "you"
    ? `You give up <b>${p.name}</b>. ${PARTNER.name}'s objection: ${p.forThem}`
    : `${PARTNER.name} gives up <b>${p.name}</b>. Your objection: ${p.forYou}`);
  const widest = [...AXES].sort((x, y) => Math.abs(you[y.k] - them[y.k]) - Math.abs(you[x.k] - them[x.k]))[0];

  const b5 = await addMessage("bot",
    `<b>Ruling: ${top.name}, at ${top.score}%.</b> ` +
    (top.champion === null
      ? `Neither of you brought it. That's the finding — the thing that survives both profiles was nobody's opening position.<br><br>`
      : `Which was ${top.champion === "you" ? "your own opening position — so the merge cost you nothing, and that's a result too" : `${PARTNER.name}'s opening position, and it holds up against your receipts as well as theirs`}.<br><br>`) +
    (flipped
      ? `Run the same three items against <b>your context alone</b> and <b>${soloTop.name}</b> wins at ${soloTop.score}%, with ${top.name} at ${soloScore}%. ` +
        `Same catalogue, same cap, same arithmetic — only the context changed. That gap is the entire case for asking a model to hold both sides.`
      : `Against your context alone the order doesn't change, which is worth saying plainly: more context isn't automatically a different answer. Here it just made this one defensible to both of you.`));

  renderCallout(b5,
    `<b>What each of you gives up.</b> ${conceded.join("<br>")}<br><br>` +
    `<b>What I can't do.</b> I don't know which of you cares more, and no receipt will ever tell me. ` +
    `The <b>${widest.name.toLowerCase()}</b> gap — ${Math.abs(you[widest.k] - them[widest.k])} points wide — is the one to argue out loud. I've only sized it.`);

  renderQuickies(b5, [
    ["Show the evidence trail", () => trailModal()],
    ["Raise the budget and re-run", () => { setBudget(clamp(state.budget + 250, 50, 1500)); renderRecs(); runCouple(); }],
    ["Back to my own picks", () => runFinalOrVerdict()]
  ]);
  state.busy = false;
}

/* the couple pass is a side trip; this puts you back where you were */
const runFinalOrVerdict = () => (state.stage >= 4 ? runFinal() : verdict());

/* ============================================================
   MODALS
   ============================================================ */
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
const closeModal = () => { $("#modal").hidden = true; };

function trailModal() {
  const a = axes();
  const rows = PURCHASES.filter((p) => p.read).map((p) => {
    const r = p.reasons[p.pick];
    const push = Object.entries(r.w).map(([ax, v]) => `${v > 0 ? AXES.find((x) => x.k === ax).pos : AXES.find((x) => x.k === ax).neg} +${Math.abs(v)}`).join(", ");
    return `<tr>
      <td class="k">${p.name}<br><span style="color:var(--faint);font-size:11px">S$${fmt(p.price)} · ${p.date}</span></td>
      <td>${p.fixed ? "<em>your reading — </em>" : ""}${r.t}</td>
      <td>${p.out ? "<span class='tag tag-warn'>excluded</span>" : push || "—"}</td>
    </tr>`;
  }).join("");
  const ansRows = state.answers.map((x) =>
    `<tr><td class="k">Direct answer</td><td><em>${escapeHtml(x.t)}</em></td><td>${Object.entries(x.w).map(([ax, v]) => `${v > 0 ? AXES.find((y) => y.k === ax).pos : AXES.find((y) => y.k === ax).neg} +${Math.abs(v)}`).join(", ")}</td></tr>`).join("");

  openModal(`
    <h3>Evidence trail</h3>
    <p class="sub">Every letter in <b style="color:var(--accent)">${state.stage ? code(a) : "—"}</b> comes from a row below. Nothing here was inferred from a questionnaire, and anything you overruled is marked.</p>
    ${rows || ansRows ? `<table><thead><tr><th>Purchase</th><th>Reading used</th><th>Axis push</th></tr></thead><tbody>${rows}${ansRows}</tbody></table>`
      : `<p class="sub">Nothing read yet.</p>`}
    <h4>How the axes add up</h4>
    <p class="sub">Each push is summed, a reading you corrected counts 1.6×, a direct answer 1.8×, and the total is scaled to ±100. A declared type overrides the sum but keeps 30% of it, so your purchases never disappear entirely.</p>
    ${state.stage ? `<table><tbody>${AXES.map((A) => `<tr><td class="k">${A.name}</td><td>${A.pos} ↔ ${A.neg}</td><td>${a[A.k] === 0 ? "undecided" : Math.abs(a[A.k]) + " toward " + poleOf(A, a)}</td></tr>`).join("")}</tbody></table>` : ""}
  `);
}

function typesModal() {
  const cur = state.stage ? code(axes()) : "";
  openModal(`
    <h3>The 16 shopping types</h3>
    <p class="sub">Four axes: <b>D</b>eliberate/<b>S</b>pontaneous · <b>P</b>remium/<b>V</b>alue · <b>E</b>xpression/<b>F</b>unction · <b>N</b>ovelty/<b>L</b>oyal.
    Pick the one you believe is yours and I'll weight it above everything I read — the recommendations re-rank immediately.</p>
    <div class="type-grid">
      ${Object.entries(TYPES).map(([c, T]) => `
        <button class="type-opt${c === cur ? " cur" : ""}" data-type="${c}">
          <div class="tc">${c}</div><div class="tn">${T.name}</div><div class="tl">${T.line}</div>
        </button>`).join("")}
    </div>
    <p class="sub" style="margin-top:16px">${cur ? `I currently read you as <b style="color:var(--accent)">${cur}</b>.` : "Nothing read yet, so anything you pick here starts the profile."}</p>
  `);
}

async function lockType(c) {
  const before = state.stage ? code(axes()) : null;   // what I had, before you overruled it
  state.lock = c;
  if (!state.stage) state.stage = 1;
  closeModal();
  refresh();
  if (state.busy) return;
  state.busy = true;
  const diff = before ? [...before].filter((L, i) => L !== c[i]).length : null;
  await addMessage("bot",
    `Noted — you're <b>${c} — ${TYPES[c].name}</b>. ${!diff ? "" : `That's ${diff} letter${diff === 1 ? "" : "s"} off my read — the ${[...before].map((L, i) => (L === c[i] ? null : AXES[i].name.toLowerCase())).filter(Boolean).join(" and ")} ${diff === 1 ? "axis" : "axes"}. `}` +
    `I'm keeping 30% of what the purchases said and letting your call carry the rest, so the ranking on the right has already changed. Confidence ${confidence()}%, and it's your confidence now, not mine.`);
  state.busy = false;
}

/* ============================================================
   FREE TEXT — constraints, not conversation
   ============================================================ */
const SUGGESTIONS = [
  "I just moved into a studio",
  "Keep it under S$250 a month",
  "I fly for work most months",
  "Thin walls, noisy neighbours",
  "I cook every night",
  "Budget is S$900 this month",
  "I've got a cat now"
];

async function handleText(raw) {
  const text = raw.trim();
  if (!text || state.busy) return;
  state.busy = true;
  $("#input").value = "";
  await addMessage("user", escapeHtml(text));

  const changed = [];
  const money = text.match(/(?:s\$|\$|sgd\s*)\s*(\d{2,5})|\b(?:under|below|max|within|about|around|up to)\s+(\d{2,5})\b/i);
  if (money) {
    const v = Number(money[1] || money[2]);
    if (v >= 50 && v <= 1500) { setBudget(Math.round(v / 10) * 10); changed.push(`budget to <b>S$${fmt(state.budget)}</b>`); }
  }
  NEED_WORDS.forEach(([re, k]) => {
    if (re.test(text) && !state.needs.has(k)) {
      state.needs.add(k);
      changed.push(`<b>${NEEDS.find((n) => n.k === k).label.toLowerCase()}</b>`);
    }
  });
  if (!changed.length) {
    state.notes.push(text.slice(0, 48));
    if (state.notes.length > 3) state.notes.shift();
  }
  refresh();

  const t = showTyping();
  await wait(520);
  t.remove();

  if (changed.length) {
    const r = rank();
    await addMessage("bot",
      `Added ${changed.join(" and ")}. ${r.over ? `${r.over} item${r.over > 1 ? "s are" : " is"} now above the cap and out of the running` : "Nothing is over the cap"}, ` +
      `and the picks on the right re-ranked${state.stage ? ` — <b>${r.list[0].name}</b> moves to the top` : ", but I still need a purchase read before any of this is worth much"}.`);
  } else {
    await addMessage("bot",
      `Kept as a constraint. I can't parse it into a budget or a listed situation, so it sits beside the profile rather than inside it — this build only scores the eight situations on the left.`);
  }
  state.busy = false;
  renderSuggestions();
  $("#input").focus();
}

function renderSuggestions() {
  const box = $("#suggestions");
  box.innerHTML = "";
  [...SUGGESTIONS].sort(() => Math.random() - .5).slice(0, 3).forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s;
    b.onclick = () => handleText(s);
    box.appendChild(b);
  });
}

function setBudget(v) {
  state.budget = v;
  $("#budgetValue").textContent = "S$" + fmt(v);
  $("#budgetRange").value = v;
}

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
  closeModal();
  thread.innerHTML = "";
  PURCHASES.forEach((p) => { p.read = false; p.pick = 0; p.fixed = false; p.done = false; p.out = false; });
  state.stage = 0;
  state.answers = [];
  state.notes = [];
  state.lock = null;
  state.needs = new Set(["wfh", "small"]);
  state.busy = false;
  setBudget(450);
  setRound(0);
  refresh();
  renderSuggestions();

  await addMessage("bot",
    "I'm the <b>Persona Analyst</b>. I don't ask you what kind of shopper you are — I read what you actually bought and argue for a type, one of sixteen.");
  const b = await addMessage("bot",
    "Every letter has to be paid for by a purchase, and I'll show you the reasoning on each one. Where I've read you wrong, correct it: a reading you give me outweighs a reading I guessed, and the recommendations sharpen each round.");
  const opening = renderQuickies(b, [
    ["Read my purchase history", () => runBatch(0)],
    ["What are the 16 types?", () => typesModal()],
    ["How does this work?", () => explain()]
  ]);

  // ?auto=1 skips straight into round 1, ?auto=couple straight into the
  // two-person case with the history already read — both for the presentation
  const auto = new URLSearchParams(location.search).get("auto");
  if (auto) {
    opening.remove();
    if (auto === "couple") {
      PURCHASES.forEach((p) => { p.read = true; p.pick = 0; });
      state.stage = 2;
      setRound(2);
      refresh();
      runCouple();
    } else {
      runBatch(0);
    }
  }
}

async function explain() {
  if (state.busy) return;
  state.busy = true;
  const b = await addMessage("bot",
    "Four rounds. <b>One</b> — I read four purchases and propose a type. <b>Two</b> — four more, and the type usually moves. " +
    "<b>Three</b> — I ask about the two axes the receipts couldn't settle. <b>Four</b> — final picks, filtered by your budget and your situation.<br><br>" +
    "Your budget is a hard cap enforced in code, not by me: anything above it never reaches the ranking, whatever your type says.");
  renderQuickies(b, [["Start reading", () => runBatch(0)], ["Show me the 16 types", () => typesModal()]]);
  state.busy = false;
}

/* ── events ─────────────────────────────────────────────────
   Bound through on(), which skips a selector that isn't on the page
   instead of throwing. Without it a single stale element reference —
   a browser holding a cached app.js against a newer index.html, say —
   takes out every listener below it and boot() with them. */
function on(sel, ev, fn) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (el) el.addEventListener(ev, fn);
  else console.warn(`[shoppersona] no element for ${sel}; that handler is inactive`);
}

on("#composer", "submit", (e) => { e.preventDefault(); handleText($("#input").value); });
on("#budgetRange", "input", (e) => { setBudget(Number(e.target.value)); renderRecs(); });
on("#resetBtn", "click", boot);
on("#trailBtn", "click", trailModal);
on("#overrideBtn", "click", typesModal);
on("#coupleBtn", "click", runCouple);
on("#modalClose", "click", closeModal);
on("#modal", "click", (e) => { if (e.target.id === "modal") closeModal(); });
on(document, "keydown", (e) => { if (e.key === "Escape") closeModal(); });

on(thread, "click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.ok) confirmSignal(byId(btn.dataset.ok));
  if (btn.dataset.no) openPicker($("#sig-" + btn.dataset.no), byId(btn.dataset.no));
});

on("#modalBody", "click", (e) => {
  const opt = e.target.closest("[data-type]");
  if (opt) lockType(opt.dataset.type);
});

on("#themeToggle", "click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("shoppersona-theme", root.dataset.theme);
});
document.documentElement.dataset.theme = localStorage.getItem("shoppersona-theme") || "dark";

boot();
