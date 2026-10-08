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
| `data/universe.json` | index membership, GICS sector, revenue, operating profit, EPS, up to seven years of revenue and EPS history, shares outstanding | Wikipedia + SEC XBRL | `scripts/refresh-universe.mjs` |
| `data/prices.json` | price, the closes yesterday / a month / a year / three / five years back, dividends paid | Yahoo `v8/finance/chart` | `scripts/refresh-prices.mjs` |

`src/utils/buildStockData.ts` joins the two at build time and the build injects
the result as `__GAME_STOCK_DATA__`, so **the page never calls a data provider at
runtime** — there is no CORS negotiation to lose, nothing to fail while someone is
mid-drill, and the CSP stays as tight as it was.

### The universe

The constituent list comes from Wikipedia's S&P 500 table, which carries each
company's **CIK** — the key that opens the SEC. Fundamentals then come from the
SEC's XBRL `frames` API, which returns one concept for every filer in a single
request, so the whole index costs about sixty calls rather than 500
multi-megabyte company files.

It walks seven calendar years back, so the CAGR questions can span three or five
years of what was actually filed. A company's history is the run of consecutive
years filed under the same XBRL concept as its latest year, so a change of
revenue tag never shows up as growth.

Shares outstanding come from the cover page of each 10-K and 10-Q
(`dei:EntityCommonStockSharesOutstanding`, framed by calendar quarter), cross-
checked against the diluted weighted-average count behind EPS. A company whose
two counts differ by more than 20% — almost always because the cover counts
each share class separately — sits the market-cap question out, as does any
company listed twice in the index (GOOG and GOOGL). Berkshire, Alphabet, Meta,
Visa and Nike are all out for that reason: one price times their total shares
is not their value.

Four things about the SEC worth knowing before touching that script:

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
- **Older EPS is not always restated for splits.** A 10-K presents three years,
  so a year that dropped out of the filings before a split is never restated,
  and NVIDIA's 2020 EPS still sits at its pre-split level. The diluted share
  count for those same years carries the same unadjusted basis, so the EPS
  history stops at the first year the share count jumps by more than 1.6x —
  a split, or a merger a CAGR should not span either.

A figure a company never reported is carried as `NaN`, never 0, because 0 is a
claim. JSON has no `NaN` and writes `null`, so `stockData.ts` converts it back on
load: as `null` it would not stay contagious through arithmetic —
`null / revenue * 100` is 0 in JavaScript, and a bank would quietly acquire a 0%
operating margin.

### The prices

Prices come from Yahoo's `v8/finance/chart` endpoint, which needs no key. One
call per ticker returns five years of daily bars, so the company name, the
longer-horizon closes and the dividends paid all cost no extra requests. The
whole index takes about 30 seconds.

Dividends are the trailing twelve months of payments actually made, rather than
an SEC figure: barely a quarter of the index files
`CommonStockDividendsPerShareDeclared`. A company that pays none sums to zero,
which is a fact about it rather than a missing value. The window is the last
365 days exactly — summing every payment in a one-year range used to catch a
fifth quarterly payment at its edge, and JPMorgan read $7.65 instead of $6.15.

Two things about that endpoint are worth knowing before changing the script:

- **`meta.chartPreviousClose` is the close before the requested range, not
  yesterday's.** Over `range=1y` it holds the close from a year ago; over
  `range=5d` it is five sessions back, which quietly made the day-move question
  a six-session move. Every close is now read off the bar series by date.
- **`close` is split-adjusted; `adjclose` adds dividends on top.** NVIDIA's
  2021 bars read about $33, not the $330 printed that day, so a five-year
  close compares with today's price directly. As a guard, any split Yahoo
  reports inside a three- or five-year span must not show as a jump of more
  than 30% between the closes either side of it, or that horizon is dropped.

The stored closes are `close`, not `adjclose`, so every move is a **price**
move and not a total return: it excludes dividends. That is what the questions
ask — the percentage between two prices on the screen — and the price CAGR
question says so.

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
prints a price — including the ones asking about earnings. A company whose
history is missing keeps its place and loses only the questions that need it.

Questions name the company as well as the ticker — "Union Pacific Corporation
(UNP) trades at…" — because a ticker alone is how a desk talks but not always
enough to know who you are looking at. One `subject()` helper renders that, so
the name reaches every question template from one place.

## Question types

| Type | Given | Asked for |
| --- | --- | --- |
| Percentage Change | yesterday's close, price | % move over the session |
| 1-Month Change | the close a month ago, price | % move over the month |
| 1-Year Change | the close a year ago, price | % move over the year |
| Price From a Move | the close a month or a year ago, the stock's real % move since | today's price |
| Recovery Gain | a stock's year-ago close and today's lower price | % gain to get back |
| Price CAGR | the close three or five years ago, price | annual price return |
| Dividend Yield | price, dividend | yield |
| Dividend Per Share | price, yield | cash dividend |
| Payout Ratio | EPS, dividend | % of earnings paid out |
| P/E Ratio | price, EPS | multiple |
| Earnings Yield | price, EPS | EPS as % of price |
| Market Cap | two of price, shares outstanding, market cap | the third |
| Operating Margin | revenue, operating profit | margin |
| Revenue Growth | two filed years of revenue | growth rate |
| EPS Growth | two filed years of EPS | growth rate |
| EPS From Growth | last year's EPS, the company's real EPS growth | this year's EPS |
| Revenue CAGR | revenue filed three or five years apart | compound annual rate |
| EPS CAGR | EPS filed three or five years apart | compound annual rate |

**Every number is real.** Each question is about a named company, and every
figure in it is a price the stock closed at or a number the company filed —
never a round percentage invented for the drill, and never a rate projected
forward. The types that used to work that way have gone: Price Increase and
Decrease applied a made-up 5–25% move, Recovery Gain asked about a made-up
round fall, and Doubling Time projected last year's growth forward. Their
replacements ask the same arithmetic about what actually happened, so each
answer is also a fact about the company: Newmont's revenue really did
compound at 14.6% a year from 2020 to 2025.
Negative answers are kept — a business that shrank is a real answer.

Types come up equally often, except Percentage Change: a single session's move
is usually a fraction of a percent, which makes a dull question, so it carries a
weight of 0.3 in `QUESTION_META` and turns up about a third as often. Each pass
through the selected types is still shuffled, so a run cycles rather than
repeating one type (`runOrder` in `questionGenerator.ts`).

Where a question rounds a figure for display, the answer follows from the
figure as printed, so working from what is on screen is exactly right rather
than nearly right. A move printed as 12.7% is applied as 12.7%; a revenue
CAGR is worked from the $bn figures shown; a market cap printed to $0.1bn is
the one the share count is backed out of.

## How answers are judged

Answers are judged on **magnitude**: 4.2 and -4.2 both answer a fall of 4.2%.
Both prices are on screen, so the direction is never the hard part, and a
phone's numeric keypad usually has no minus key. The question card says so
under every percentage answer.

Tolerance is **absolute and in the answer's own units**, computed when the
question is built. The bands are set for estimating in your head: an answer
right to two significant figures, or the first decimal of a percentage, should
score. Three rules drive them:

1. A price tolerance stays well below the smallest move asked about. If the
   margin were wider than the move, the price printed in the question would sit
   inside it and you could score by retyping a number off the screen.
2. Percentage-point answers get a flat tolerance rather than a fraction of the
   answer. A percentage change is often near zero and is negative about half the
   time; scaling by the answer collapses the tolerance or turns it negative, and
   a negative tolerance makes a question impossible to get right.
3. The exception is the month and year moves, which run to tens of points and
   occasionally past a hundred — a flat 0.1pp on a 509% answer would be asking
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
qualify — which today leaves every type a pool of at least 300, except Recovery
Gain, which only asks about the hundred-odd stocks that really are down 10% or
more on the year. A handful sit outside the price band at either end, because a
$3 or a $1,800 share price makes a poor mental-arithmetic drill.

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
