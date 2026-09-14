// Shape of each row after vite.config.ts parses Stockdata.csv. Kept in sync by
// hand; the build injects the array as __GAME_STOCK_DATA__.
export interface StockData {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  eps: number;
  revenue: number; // millions
  operatingProfit: number; // millions
  dividendPerShare: number;
  dividendYield: number;
}

declare const __GAME_STOCK_DATA__: StockData[];

// The define is missing outside a Vite build (a bare `tsc`, say), so fall back
// to an empty list rather than throwing at module load.
export const stocks: StockData[] =
  typeof __GAME_STOCK_DATA__ !== "undefined" ? __GAME_STOCK_DATA__ : [];

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

export const peRatioOf = (s: StockData): number => s.currentPrice / s.eps;
export const earningsYieldOf = (s: StockData): number => (s.eps / s.currentPrice) * 100;
export const operatingMarginOf = (s: StockData): number =>
  (s.operatingProfit / s.revenue) * 100;
export const payoutRatioOf = (s: StockData): number => (s.dividendPerShare / s.eps) * 100;
