# Finance Drills

Mental arithmetic practice on real company figures — the sort of estimation an
equity research or trading interview expects you to do without a calculator.

Live: https://willcpan.github.io/finance-drills/

Every question is generated from real figures for 179 companies. Answer, and the
app shows you the shortcut worked through with that question's numbers — the
point is to get faster, not just to be graded.

## Running it

```bash
npm install
npm run dev            # dev server
npm test               # vitest
npm run lint           # eslint
npm run build          # production build into dist/
npm run refresh:prices # pull fresh quotes into data/prices.json
```

Deploys to GitHub Pages automatically on every push to `main`.

## Where the data comes from

Two files, split along how fast each half ages:

| File | Holds | Refreshed |
| --- | --- | --- |
| `Stockdata.csv` | revenue, EPS, operating profit, annual dividend | by hand; these move once a quarter |
| `data/prices.json` | company name, price, and the closes yesterday, a month back and a year back | by `scripts/refresh-prices.mjs` |

`src/utils/buildStockData.ts` merges the two at build time and the build injects
the result as `__GAME_STOCK_DATA__`, so **the page never calls a data provider at
runtime** — there is no CORS negotiation to lose, nothing to fail while someone is
mid-drill, and the CSP stays as tight as it was.

Prices come from Yahoo's `v8/finance/chart` endpoint, which needs no key. One
call per ticker returns a year of daily bars, so the company name and the
longer-horizon closes cost no extra requests. Fundamentals are not fetched: the
endpoint that serves them (`v10/finance/quoteSummary`) answers 401 without a
session crumb.

Two things about that endpoint are worth knowing before changing the script:

- **`meta.chartPreviousClose` is the close before the requested range, not
  yesterday's.** Over `range=1y` it holds the close from a year ago; over
  `range=5d` it is five sessions back, which quietly made the day-move question
  a six-session move. Every close is now read off the bar series by date.
- **A split rewrites history.** Yahoo divides the pre-split closes in `adjclose`
  but leaves `close` as the price actually printed that day, so quoting a raw
  close from before a 10:1 split would invent a 90% crash. Where the two
  diverge by more than 25% — far past any dividend adjustment — that horizon is
  dropped for that company.

The stored closes are the raw ones, so a month or year move is a **price** move
and not a total return: it excludes dividends. That is what the question asks —
the percentage between two prices it puts on the screen — and it keeps the
arithmetic consistent with the current price, which is also unadjusted.

The refresh runs inside the deploy workflow on a weekday cron at 21:30 UTC, after
the US close. It commits `data/prices.json` and then builds from the tree it just
refreshed — a commit pushed with `GITHUB_TOKEN` starts no further workflow run, so
a separate deploy workflow would never see the new prices. Two guards keep a bad
fetch off the site: the script exits non-zero if it resolves under 90% of tickers
(leaving the committed file untouched), and the workflow runs the test suite,
which asserts against the data the build just loaded, before deploying.

A ticker with no usable quote sits the drill out rather than pairing a frozen
price with an invented previous close. Seven do today — acquired, taken private,
or listed only in another currency (ABB, DFS, MMC, MRO, ORAN, PXD, WBA). A
company whose history is missing or split-affected keeps its place and simply
loses its month and year questions. If a build finds no quote file at all, it
falls back to the CSV's own prices so a fresh clone still runs `npm run dev`;
that build has no names and no history, so it drills the day move only.

Questions name the company as well as the ticker — "Union Pacific Corporation
(UNP) trades at…" — because a ticker alone is how a desk talks but not always
enough to know who you are looking at. One `subject()` helper renders that, so
the name reaches all twelve company-backed templates from one place.

## Question types

| Type | Given | Asked for |
| --- | --- | --- |
| Price Increase / Decrease | price, % move | new price |
| Percentage Change | yesterday's close, price | % move over the session |
| 1-Month Change | the close a month ago, price | % move over the month |
| 1-Year Change | the close a year ago, price | % move over the year |
| Recovery Gain | a % fall | % gain to get back to even |
| Dividend Yield | price, dividend | yield |
| Dividend Per Share | price, yield | cash dividend |
| Payout Ratio | EPS, dividend | % of earnings paid out |
| P/E Ratio | price, EPS | multiple |
| Earnings Yield | price, EPS | EPS as % of price |
| Operating Margin | revenue, operating profit | margin |
| Rule of 72 | a growth rate | years to double |

## How answers are judged

Tolerance is **absolute and in the answer's own units**, computed when the
question is built. Three rules drive it:

1. A price tolerance stays well below the smallest move asked about. If the
   margin were wider than the move, the price printed in the question would sit
   inside it and you could score by retyping a number off the screen.
2. Percentage-point answers get a flat tolerance rather than a fraction of the
   answer. A percentage change is often near zero and is negative about half the
   time; scaling by the answer collapses the tolerance or turns it negative, and
   a negative tolerance makes a question impossible to get right.
3. The exception is the month and year moves, which run to tens of points and
   occasionally past a hundred — a flat 0.05pp on a 509% answer would be asking
   for four significant figures. Those scale with the answer, but never tighten
   past the flat tolerance, so a month that barely moved is judged like a day.

The first two were real bugs before — see `src/utils/questionGenerator.test.ts`,
which pins each of them.

## Playing it

The whole drill runs from the keyboard, because reaching for a mouse costs a
beat on something scored by speed. Type a number and submit with **Enter or
Space** — every answer is a number, so a space can never be part of one, which
leaves it free as the nearer key. Once the answer is showing, focus moves to
Continue, so the same key carries you to the next question.

## Question quality

Real market data contains values that are arithmetically valid but useless to
drill. One company here earns about a cent a share, giving a P/E of 12,150 and a
payout ratio of 30,000%. `SENSIBLE` in `src/utils/stockData.ts` declares the band
each derived figure has to land in, and question types only draw from rows that
qualify — which today leaves every type a pool of at least 130 companies. Rows
with unparseable cells are dropped at build time, and six companies sit outside
the price band because a $3 or $1,800 share price makes a poor mental-arithmetic
drill.

Two data bugs are pinned by `src/utils/buildStockData.test.ts`. The previous
close used to be invented — a hash of the ticker, within a fixed ±2% of the price
— so Percentage Change drilled a move that never happened; it is now the close
the exchange reported. And the CSV carried 80 exact duplicate rows, which
corrupted no answer but left those companies up to four times more likely to come
up; the loader keeps the first row for each ticker.

## Layout

```
scripts/
  refresh-prices.mjs     pulls quotes into data/prices.json
src/
  utils/
    buildStockData.ts    build-time merge of CSV fundamentals + live prices
    stockData.ts         injected data, price date, eligibility bands
    questionGenerator.ts question types, tolerances, methods
    gameEngine.ts        pure reducer: scoring, streaks, adaptive difficulty
    stats.ts             localStorage persistence (pure merge + guarded storage)
    format.ts            number and unit formatting
  hooks/useGame.ts       reducer + question supply + timestamp-based countdown
  components/            SetupScreen, QuestionCard, ScoreBoard, Timer,
                         ResultScreen, StatsPanel, GameContainer
```

Game state lives in a pure reducer so scoring and adaptive difficulty can be
tested without rendering. The countdown is derived from the timestamp a question
was shown rather than a ticking counter — a timer holding its own state was the
cause of an earlier bug where the clock never reset between questions.

Stats are per-browser via `localStorage`; nothing leaves the page. There is no
backend, no analytics and no third-party script.

## Stack

Vite, React, TypeScript, Tailwind, shadcn/ui, vitest.
