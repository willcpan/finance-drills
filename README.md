# Finance Drills

Mental arithmetic practice on real company figures — the sort of estimation an
equity research or trading interview expects you to do without a calculator.

Live: https://willcpan.github.io/finance-drills/

Every question is generated from the **S&P 500** — today's prices, and the
revenue, operating profit and earnings each company last reported to the SEC.
Answer, and the app shows you the shortcut worked through with that question's
numbers: the point is to get faster, not just to be graded.

## Running it

```bash
npm install
npm run dev            # dev server
npm test               # vitest
npm run lint           # eslint
npm run build          # production build into dist/
npm run refresh:universe # index members + SEC figures -> data/universe.json
npm run refresh:prices   # quotes and dividends      -> data/prices.json
```

Deploys to GitHub Pages automatically on every push to `main`.

## Where the data comes from

Two files, split by how fast their contents age and who publishes them:

| File | Holds | Source | Refreshed |
| --- | --- | --- | --- |
| `data/universe.json` | index membership, GICS sector, revenue, operating profit, EPS, and the year before | Wikipedia + SEC XBRL | `scripts/refresh-universe.mjs` |
| `data/prices.json` | price, the closes yesterday / a month / a year back, dividends paid | Yahoo `v8/finance/chart` | `scripts/refresh-prices.mjs` |

`src/utils/buildStockData.ts` joins the two at build time and the build injects
the result as `__GAME_STOCK_DATA__`, so **the page never calls a data provider at
runtime** — there is no CORS negotiation to lose, nothing to fail while someone is
mid-drill, and the CSP stays as tight as it was.

### The universe

The constituent list comes from Wikipedia's S&P 500 table, which carries each
company's **CIK** — the key that opens the SEC. Fundamentals then come from the
SEC's XBRL `frames` API, which returns one concept for every filer in a single
request, so the whole index costs about two dozen calls rather than 500
multi-megabyte company files.

Three things about the SEC worth knowing before touching that script:

- **A User-Agent containing the string "github" is rejected outright**, with a
  403 and "Your Request Originates from an Undeclared Automated Tool".
  Advertising the repository URL — the obvious, polite thing to do — is what
  trips it. Set `SEC_CONTACT` to an email to declare the traffic properly.
- **`frames` is organised by calendar year**, so a company whose fiscal year
  ends in February or September can be missing from every frame. Visa, Hershey
  and Constellation Brands all are. The stragglers are then fetched one at a
  time from `companyconcept`, which is why coverage lands near 96% rather than
  near 80%.
- **Operating income is not universal.** Banks, insurers and REITs largely do
  not report `OperatingIncomeLoss` at all — about 90 companies. That is an
  accounting fact, not a gap to paper over, so those companies keep every other
  question and lose the operating margin one.

A figure a company never reported is carried as `NaN`, never 0, because 0 is a
claim. JSON has no `NaN` and writes `null`, so `stockData.ts` converts it back on
load: as `null` it would not stay contagious through arithmetic —
`null / revenue * 100` is 0 in JavaScript, and a bank would quietly acquire a 0%
operating margin.

### The prices

Prices come from Yahoo's `v8/finance/chart` endpoint, which needs no key. One
call per ticker returns a year of daily bars, so the company name, the
longer-horizon closes and the dividends paid all cost no extra requests. The
whole index takes about 25 seconds.

Dividends are the trailing twelve months of payments actually made, rather than
an SEC figure: barely a quarter of the index files
`CommonStockDividendsPerShareDeclared`. A company that pays none sums to zero,
which is a fact about it rather than a missing value.

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

### Refreshing

Both refreshes run inside the deploy workflow on a weekday cron at 21:30 UTC,
after the US close. The workflow commits the data and then builds from the tree
it just refreshed — a commit pushed with `GITHUB_TOKEN` starts no further
workflow run, so a separate deploy workflow would never see the new data. Three
guards keep a bad fetch off the site: the universe script refuses to write if it
parses under 450 constituents or if under 80% of them have EPS, the price script
refuses under 90% coverage, and the workflow runs the test suite — which asserts
against the data the build just loaded — before deploying.

Because membership refreshes itself, a company that leaves the index leaves the
drill. The previous hand-typed list had no such mechanism, and seven of its
names had been acquired or taken private before anyone noticed.

An index member with no usable quote sits the drill out, since every question
prints a price — including the ones asking about earnings. None do today. A
company whose history is missing or split-affected keeps its place and loses
only its month and year questions.

Questions name the company as well as the ticker — "Union Pacific Corporation
(UNP) trades at…" — because a ticker alone is how a desk talks but not always
enough to know who you are looking at. One `subject()` helper renders that, so
the name reaches every question template from one place.

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
| Revenue Growth | two filed years of revenue | growth rate |
| EPS Growth | two filed years of EPS | growth rate |
| Doubling Time | the rate that company grew at | years to double |

Every question is about a named company. Rule of 72 used to be asked about an
anonymous "holding compounding at 12% a year" — invented rate, invented holding,
nothing to do with the market. Doubling Time asks the same arithmetic about the
rate a company's revenue actually grew at last year, which is why the universe
now carries the prior year as well as the latest one, measured under the same
XBRL concept so that growth is growth rather than a change of accounting tag.

The rate in a Doubling Time question is rounded once, and the answer follows
from the rounded figure — the one on screen. Answering `72 / 3.46` while the
question says 3.5% would mark correct arithmetic wrong.

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
drill: a company earning about a cent a share gives a P/E of 12,150 and a payout
ratio of 30,000%. `SENSIBLE` in `src/utils/stockData.ts` declares the band each
derived figure has to land in, and question types only draw from companies that
qualify — which today leaves every type a pool of at least 330. A handful sit
outside the price band at either end, because a $3 or a $1,800 share price makes
a poor mental-arithmetic drill.

Two bugs from the hand-maintained era are pinned by
`src/utils/buildStockData.test.ts`. The previous close used to be invented — a
hash of the ticker, within a fixed ±2% of the price — so Percentage Change
drilled a move that never happened; it is now the close the exchange reported.
And the old CSV carried 80 exact duplicate rows, which corrupted no answer but
left those companies up to four times more likely to come up; the join still
keeps only the first row per ticker, since two share classes of one company can
both sit in the index.

## Layout

```
data/
  universe.json          index members + what they reported (generated)
  prices.json            quotes, past closes, dividends (generated)
scripts/
  refresh-universe.mjs   Wikipedia constituents + SEC XBRL figures
  refresh-prices.mjs     Yahoo quotes, past closes and dividends
src/
  utils/
    buildStockData.ts    build-time join of the two data files
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
