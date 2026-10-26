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
| `data/universe.json` | index membership, GICS sector, revenue, operating profit, EPS, trailing-twelve-month EPS, up to seven years of revenue and EPS history, shares outstanding, a company profile (exchange, sub-industry, headquarters, founded, a two-sentence description) | Wikipedia + SEC XBRL | `scripts/refresh-universe.mjs`, `scripts/trailing-eps.mjs` |
| `data/prices.json` | price, the closes yesterday / a month / a year / three / five years back, five years of month-end closes, dividends paid | Yahoo `v8/finance/chart` | `scripts/refresh-prices.mjs` |

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

The table is read a row at a time. It used to be read with one pattern across
the whole table that expected each name to be a wiki link; Insulet's is plain
text, so the pattern ran on into the next row and PODD was drilled with
Intel's name-link, CIK and SEC figures while Intel itself was missing. A row
that does not parse cleanly is now skipped with a warning rather than
borrowing from its neighbour.

The rest of each row feeds the company panel: the exchange (from the
`{{NyseSymbol}}` template), sub-industry, headquarters and founding year. The
description is the opening two sentences of the company's Wikipedia article,
from the REST summary endpoint. Those are fetched once per article and carried
over from the previous file on every later run, so a daily refresh only asks
Wikipedia about companies new to the index.

Fixes found by insisting every company show the same figures:

- **Banks' and utilities' revenue tags.** Banks file `RevenuesNetOfInterestExpense`
  and utilities `RegulatedAndUnregulatedOperatingRevenue`; without them Goldman
  had no revenue and DTE none either.
- **Stale figures passed off as current.** The latest figure is whichever recent
  year a company filed under *any* of the concepts, so a company that stopped
  using a tag reported its last year under it as this year's: Wells Fargo's
  "revenue" was its 2019 `Revenues`, and 36 operating margins divided an old
  year's operating income by this year's revenue (Devon's 2020 loss among
  them). The latest figure must now be from the last year or two, and a margin
  only divides figures from the same year.
- **A change of revenue tag cut the history short.** Where a company filed the
  same year at the same value under both its old and new tag (AMETEK in 2022
  and 2023), the history carries on under the old one.
- **A new holding company.** Exxon moved under ExxonMobil Holdings Corp in 2026,
  whose CIK has no 10-K yet; `PREDECESSOR_CIK` reads it from the old one, and
  the run logs any company with no figures at all so the next case shows up.
- **Splits after the last 10-K.** The annual EPS and diluted count stay on the
  old share basis until a later 10-K restates them, while the cover page and
  the price move straight away: Booking's 25-for-1 split would have given it a
  P/E of 1. `src/utils/shareBasis.ts` puts both on today's basis, using
  Yahoo's split list as the clue and the share counts as the proof - Yahoo's
  list also carries spin-off price adjustments, which change no share count.

### Trailing EPS

The P/E, earnings yield and payout ratio divide by **trailing-twelve-month
diluted GAAP EPS**: the twelve months to the end of the latest 10-Q, as filed.
They used to divide by the last 10-K's EPS, which by October is ten months
old for a calendar-year company. Worse, the calendar-year frames had left
Microsoft on FY2025 (to June 2025) after its FY2026 10-K was out. And no
question said which year it meant.

`scripts/trailing-eps.mjs` builds the figure from one company's
`companyconcept` facts:

    TTM = last fiscal year + year to date - the same months a year earlier

Both year-to-date figures come from the same 10-Q, which presents last
year's months beside this year's, so they are measured the same way and on
the same share basis. No quarter has to be backed out of an annual total.
Until a 10-Q follows the 10-K, the trailing figure is the fiscal year itself.
A company with nothing filed in the last 400 days has none and sits the
three questions out. The frames cannot supply this, because they never hold
six- or nine-month figures. So it costs one request per company, about 500,
which adds a couple of minutes to the refresh.

Every question that uses it says what it is: "earned $7.50 a share (diluted
EPS, GAAP) in the 12 months to 30 Jun 2026". The panel's P/E row notes the
same ("TTM to 30 Jun 2026"). GAAP means one-off charges stay in: on its
2025 10-K, AbbVie's acquired R&D put its P/E at 121. Adjusted and forward EPS come from
press releases and analysts rather than filings, so the drill does not use
them.

The gap is largest for serial acquirers. Gallagher's GAAP EPS is roughly
half the "adjusted" figure it headlines, which adds back amortization of
the intangibles it bought. That amortization is filed
(`AmortizationOfIntangibleAssets`), so where it comes to a quarter or more of
net income, the panel's P/E note says so: "GAAP, TTM to 30 Jun 2026, $6.03 EPS;
after $1.1bn of intangibles amortization in 2025, which "adjusted" EPS adds
back".

The 10-K and the 10-Q can sit either side of a split. Each part is divided
by the splits after its own filing date, so all three land on today's basis
(`trailingOnBasis` in `src/utils/shareBasis.ts`). The growth and CAGR
questions keep the fiscal years, since they compare one year with another.

The per-company files also showed why Visa, Hershey and Constellation had no
EPS at all. The frames API spells the per-share unit `USD-per-shares`, but
`companyconcept` keys it `USD/shares`. The fallback asked for it under the
frames spelling and got nothing back every time.

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
longer-horizon closes, the month-end closes for the panel's chart and the
dividends paid all cost no extra requests. The whole index takes about 30
seconds.

The request asks for an explicit start date three weeks past five years, not
`range=5y`: that range begins a day or two short of five calendar years, so
no bar sat on or before the five-year date and every five-year close went
missing for a week before a test was added to catch it.

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
| Payout Ratio | trailing EPS, dividend | % of earnings paid out |
| P/E Ratio | price, trailing EPS | multiple |
| Earnings Yield | price, trailing EPS | EPS as % of price |
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

## After answering

Once an answer is showing, the card carries a link to the company's chart on
Google Finance and to its Wikipedia article, and an **About** panel with what
the company does, where and when it started, a five-year chart of month-end
closes, and the same eight figures for every company, in the same order:
market cap, P/E, dividend yield, 1-year and 5-year return, operating margin,
and revenue growth over one and five years (`src/utils/companyFigures.ts`).

A figure that cannot be had says why instead of disappearing ("listed 15 Jun
2026", "EPS filed per share class only"). One worked out a second-best way is
marked ≈ with a note saying how:

| Figure | Normally | Fallback |
| --- | --- | --- |
| Market cap | price × cross-checked cover-page shares | price × diluted shares (multi-class companies such as Alphabet and Meta) |
| P/E | price ÷ trailing-twelve-month EPS, dated; "n/m" for a loss | price ÷ (net income ÷ diluted shares), for a company that files EPS only per class (Airbnb) or stopped tagging it (Monster) |
| Operating margin | operating income ÷ revenue, same year | pre-tax income ÷ revenue, for banks and insurers, which file no operating line |
| Revenue growth, 5 yr | compound rate over five filed years | the longest comparable span, labelled with its length |

The panel remembers whether it was left open. Tapping inside it never moves on to the
next question. The results screen links each question's company to Google
Finance too.

Google Finance needs the exchange in the URL — `/quote/AAPL` on its own opens
the Google Finance home page — and writes class shares with a dot (`BRK.B`).
The chart is a single inline SVG path, so the page still loads nothing from
anywhere else.

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
  trailing-eps.mjs       trailing-twelve-month EPS from a 10-K and 10-Q
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
