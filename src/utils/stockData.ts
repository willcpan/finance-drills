// Shape of each row after the build merges Stockdata.csv with the refreshed
// quotes in data/prices.json (see src/utils/buildStockData.ts). Kept in sync by
// hand; the build injects the array as __GAME_STOCK_DATA__.
// A close from further back, with the session it came from. The date is kept
// so a question can say when "a month ago" actually was.
export interface PastClose {
  price: number;
  date: string; // YYYY-MM-DD
}

export interface StockData {
  ticker: string;
  // The company's own name, falling back to the ticker when the quote carried
  // none - so this is always safe to render.
  name: string;
  currentPrice: number;
  previousClose: number;
  // Null when the history was too short, or when a split sits between that
  // session and now so its printed close no longer compares with today's.
  monthAgo: PastClose | null;
  yearAgo: PastClose | null;
  eps: number;
  revenue: number; // millions
  operatingProfit: number; // millions
  dividendPerShare: number;
  dividendYield: number;
}

declare const __GAME_STOCK_DATA__: StockData[];
declare const __PRICES_AS_OF__: string | null;

// The define is missing outside a Vite build (a bare `tsc`, say), so fall back
// to an empty list rather than throwing at module load.
export const stocks: StockData[] =
  typeof __GAME_STOCK_DATA__ !== "undefined" ? __GAME_STOCK_DATA__ : [];

// ISO timestamp the prices were taken, or null when the build fell back to the
// prices baked into the CSV. The UI dates the data from this so a player can
// see how fresh the numbers they are drilling actually are.
export const pricesAsOf: string | null =
  typeof __PRICES_AS_OF__ !== "undefined" ? __PRICES_AS_OF__ : null;

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

export const peRatioOf = (s: StockData): number => s.currentPrice / s.eps;
export const earningsYieldOf = (s: StockData): number => (s.eps / s.currentPrice) * 100;
export const operatingMarginOf = (s: StockData): number =>
  (s.operatingProfit / s.revenue) * 100;
export const payoutRatioOf = (s: StockData): number => (s.dividendPerShare / s.eps) * 100;
