# ShopPersona — purchase-personality prototype (UI only)

Companion front-end to the ShopWise build. Instead of taking a stated requirement and shortlisting
against it, this one goes the other way: it reads a **purchase history**, argues for one of **16
shopping types**, shows its reasoning purchase by purchase, and lets the user overrule any of it.
Budget and individual needs sit on top as hard filters.

**No model call is made.** Every sentence the analyst says is written in advance. What *is* real is
the arithmetic — the four axis scores, the 16-way type lookup, the confidence figure and the product
match percentages are all computed from the readings you accept, correct or exclude.

## Run it

No build step, no dependencies.

```bash
python3 -m http.server 8000
# then http://localhost:8000/shoppersona/
```

## The type system

Four axes, code order `plan → price → mode → brand`:

| Axis | Positive pole | Negative pole |
| --- | --- | --- |
| Planning | **D**eliberate | **S**pontaneous |
| Spend | **P**remium | **V**alue |
| Motive | **E**xpression | **F**unction |
| Attachment | **N**ovelty | **L**oyal |

So `DVFL` is the Quartermaster (researches once, buys the workhorse, rebuys it for a decade) and
`SPEN` is the Maximalist. All 16 are in `TYPES` with a name and a one-line description.

## The four rounds

1. **Round 1** — reads four purchases, proposes a reading and an axis push for each, names a type.
2. **Round 2** — reads the other four. On the default readings the type moves `DPEL → DVFL`;
   two letters flip, which is the point of showing round 1 at all.
3. **Round 3** — asks about the two axes the receipts left nearest a coin flip.
4. **Round 4** — final picks, a budget breakdown, and one thing it would *not* buy.

Confidence runs roughly 36% → 64% → 76% → 82%, higher if the user corrects readings.

## How a correction changes the model

Each purchase carries four candidate reasons. `reasons[0]` is what the analyst proposes; the other
three are offered under "Actually, no…". Picking one:

- swaps the axis push for that purchase,
- marks it `fixed`, which weights it **1.6×** against an uninspected reading,
- or, for a reason flagged `x: true` (*"it was a gift"*), drops the purchase from the evidence entirely.

A direct answer in round 3 weights **1.8×**. Declaring your own type in the 16-way picker keeps 30%
of what the purchases said and lets your call carry the rest — the purchases never disappear.
The **Evidence trail** modal lists every row that produced the current four letters.

## Budget and needs

Budget is a **hard cap enforced in code**, exactly as in the ShopWise build: anything above it is
dropped before ranking, whatever the type says, and the count of dropped items is shown. Needs are
the eight toggles in the left column; free text in the composer is parsed for a budget
(`"under S$250 a month"`) or a situation (`"I just moved into a studio"`), and anything it can't
parse is kept visibly *beside* the profile rather than silently folded into it.

Ranking is `0.56 × axis fit + 0.26 × needs match + 0.18 × budget headroom`, then scaled by
confidence — an uncertain profile is not allowed to claim a precise match percentage.

## What is here

| Piece | Where |
| --- | --- |
| Purchase history, budget cap, needs toggles | left column, `renderBuys()` / `renderNeeds()` |
| Signal cards — one purchase, one inference, four axis pushes | `paintSignal()` |
| Reason picker and exclusion | `openPicker()`, `choose()` |
| Type card, four axis meters, confidence | `renderType()` |
| Recommendations with per-item reasoning | `rank()`, `score()`, `why()` |
| The 16-type picker / user override | `typesModal()`, `lockType()` |
| Evidence trail | `trailModal()` |
| Dark / light theme, ambient background | `styles.css` |

## Where the real logic goes

- `PURCHASES[].reasons` — currently four hand-written candidate readings per purchase. This is the
  LLM's job: given a purchase, its date, its price and the rest of the history, *propose* the
  reasons. Keep them as short natural-language claims with an explicit axis push, so the user can
  still disagree with a specific one.
- `axes()` / `confidence()` / `score()` — keep these in ordinary code. The model proposes reasons;
  it should not be the thing doing the arithmetic or enforcing the budget.
- `CATALOGUE` — swap for the real catalogue. `fit` is the only new field a record needs.
- `QUESTIONS` — currently one fixed question per axis. The real version should generate a question
  aimed at whichever axis is closest to zero, which is already what `sortedAxes()` picks out.

The exclusion path (*"it was a gift — don't read me into it"*) is deliberate. A system that infers
personality from purchases has to let the person say a purchase wasn't about them.
