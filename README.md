# Finance Drills

Mental arithmetic practice on real company figures — the sort of estimation an
equity research or trading interview expects you to do without a calculator.

Live: https://willcpan.github.io/finance-drills/

Every question is generated from `Stockdata.csv` (266 companies: price, EPS,
revenue, operating profit, annual dividend). Answer, and the app shows you the
shortcut worked through with that question's numbers — the point is to get
faster, not just to be graded.

## Running it

```bash
npm install
npm run dev      # dev server
npm test         # vitest
npm run lint     # eslint
npm run build    # production build into dist/
```

Deploys to GitHub Pages automatically on every push to `main`.

## Question types

| Type | Given | Asked for |
| --- | --- | --- |
| Price Increase / Decrease | price, % move | new price |
| Percentage Change | prior close, price | % move |
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
question is built. Two rules drive it:

1. A price tolerance stays well below the smallest move asked about. If the
   margin were wider than the move, the price printed in the question would sit
   inside it and you could score by retyping a number off the screen.
2. Percentage-point answers get a flat tolerance rather than a fraction of the
   answer. A percentage change is often near zero and is negative about half the
   time; scaling by the answer collapses the tolerance or turns it negative, and
   a negative tolerance makes a question impossible to get right.

Both of those were real bugs before — see `src/utils/questionGenerator.test.ts`,
which pins each of them.

## Question quality

Real market data contains values that are arithmetically valid but useless to
drill. One company here earns about a cent a share, giving a P/E of 12,150 and a
payout ratio of 30,000%. `SENSIBLE` in `src/utils/stockData.ts` declares the band
each derived figure has to land in, and question types only draw from rows that
qualify. Four rows have unparseable cells and are dropped at build time.

## Layout

```
src/
  utils/
    stockData.ts         injected CSV data, eligibility bands
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
