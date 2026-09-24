// Shape of each row after the build joins data/universe.json (the index and
// its reported figures) with data/prices.json (see src/utils/buildStockData.ts).
// Kept in sync by hand; the build injects the array as __GAME_STOCK_DATA__.
// A close from further back, with the session it came from. The date is kept
// so a question can say when "a month ago" actually was.
export interface PastClose {
  price: number;
  date: string; // YYYY-MM-DD
}

export interface StockData {
  ticker: string;
  // The company's own name, falling back to the ticker when neither source
  // carried one - so this is always safe to render.
  name: string;
  // GICS sector from the index table, or null if it was not published.
  sector: string | null;
  currentPrice: number;
  previousClose: number;
  // Null when the history was too short, or when a split sits between that
  // session and now so its printed close no longer compares with today's.
  monthAgo: PastClose | null;
  yearAgo: PastClose | null;
  // NaN where the company never reported the figure - financials and REITs
  // largely do not report operating income. The eligibility bands reject NaN,
  // so such a company sits out only the questions that need it.
  eps: number;
  revenue: number; // millions
  operatingProfit: number; // millions
  // The fiscal year the reported figures came from, e.g. "CY2025" or "FY2026".
  fiscalYear: string | null;
  // The year before, for the growth questions. NaN where the company has only
  // one year on file.
  priorRevenue: number; // millions
  priorEps: number;
  priorRevenueFiscalYear: string | null;
  priorEpsFiscalYear: string | null;
  // Trailing twelve months of dividends actually paid; 0 for a company that
  // pays none.
  dividendPerShare: number;
  dividendYield: number;
}

// A figure the company never reported is NaN in the build, but the build
// injects the array through JSON - which has no NaN and writes null instead.
type InjectedStock = Omit<
  StockData,
  "eps" | "revenue" | "operatingProfit" | "priorRevenue" | "priorEps"
> & {
  eps: number | null;
  revenue: number | null;
  operatingProfit: number | null;
  priorRevenue: number | null;
  priorEps: number | null;
};

declare const __GAME_STOCK_DATA__: InjectedStock[];
declare const __PRICES_AS_OF__: string | null;
declare const __UNIVERSE_INDEX__: string | null;

// Null back to NaN, so "never reported" stays contagious through arithmetic.
// As null it would not be: `null / revenue * 100` is 0 in JavaScript, and a
// company with no operating income would quietly acquire a 0% margin, kept out
// of the drill only by where the sensible band happens to start.
const reported = (value: number | null): number => (value === null ? Number.NaN : value);

// The define is missing outside a Vite build (a bare `tsc`, say), so fall back
// to an empty list rather than throwing at module load.
export const stocks: StockData[] = (
  typeof __GAME_STOCK_DATA__ !== "undefined" ? __GAME_STOCK_DATA__ : []
).map(stock => ({
  ...stock,
  eps: reported(stock.eps),
  revenue: reported(stock.revenue),
  operatingProfit: reported(stock.operatingProfit),
  priorRevenue: reported(stock.priorRevenue),
  priorEps: reported(stock.priorEps),
}));

// ISO timestamp the prices were taken. The UI dates the data from this so a
// player can see how fresh the numbers they are drilling actually are.
export const pricesAsOf: string | null =
  typeof __PRICES_AS_OF__ !== "undefined" ? __PRICES_AS_OF__ : null;

// The index the companies were drawn from, for the screen that says so.
export const universeIndex: string | null =
  typeof __UNIVERSE_INDEX__ !== "undefined" ? __UNIVERSE_INDEX__ : null;

export const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const pickFrom = <T,>(items: readonly T[]): T => items[randomInt(0, items.length - 1)];

export const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

// Real market data contains values that are arithmetically valid but worthless
// as a drill. One company in this dataset earns about a cent a share, which
// yields a P/E of 12,150 and a payout ratio of 30,000%. Asking someone to work
// those out in their head teaches nothing, so each derived figure declares the
// band it has to land in to be worth asking about.
export const SENSIBLE = {
  price: { min: 5, max: 1000 },
  peRatio: { min: 5, max: 60 },
  earningsYield: { min: 1, max: 20 },
  dividendYield: { min: 0.2, max: 12 },
  dividendPerShare: { min: 0.1, max: 20 },
  operatingMargin: { min: 2, max: 70 },
  payoutRatio: { min: 5, max: 120 },
  // Growth, in percentage points on the year. The caps keep out the jumps that
  // are an acquisition rather than a business growing, and the floors keep out
  // collapses that teach nothing.
  revenueGrowth: { min: -40, max: 80 },
  epsGrowth: { min: -60, max: 120 },
  // The rate a doubling-time question is asked about. Below this the answer
  // runs to decades, above it to months, and neither is worth the arithmetic.
  growthRate: { min: 3, max: 40 },
} as const;

export const within = (value: number, band: { min: number; max: number }): boolean =>
  Number.isFinite(value) && value >= band.min && value <= band.max;

// A percentage move between two prices. Both prices are printed in the
// question, so the answer is exact arithmetic on what the player can see.
export const priceMoveOf = (from: number, to: number): number => ((to - from) / from) * 100;

// A longer-horizon question is worth asking only when both prices it prints are
// workable numbers - the same rule the current price already has to pass.
export const usablePast = (past: PastClose | null): past is PastClose =>
  !!past && within(past.price, SENSIBLE.price);

// Year-on-year growth in what the company reported. NaN propagates when either
// end is missing, so the eligibility bands reject it.
export const revenueGrowthOf = (s: StockData): number => priceMoveOf(s.priorRevenue, s.revenue);
export const epsGrowthOf = (s: StockData): number => priceMoveOf(s.priorEps, s.eps);

export const peRatioOf = (s: StockData): number => s.currentPrice / s.eps;
export const earningsYieldOf = (s: StockData): number => (s.eps / s.currentPrice) * 100;
export const operatingMarginOf = (s: StockData): number =>
  (s.operatingProfit / s.revenue) * 100;
export const payoutRatioOf = (s: StockData): number => (s.dividendPerShare / s.eps) * 100;
