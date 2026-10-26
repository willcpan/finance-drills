// Shape of each row after the build joins data/universe.json (the index and
// its reported figures) with data/prices.json (see src/utils/buildStockData.ts).
// Kept in sync by hand; the build injects the array as __GAME_STOCK_DATA__.
// A close from further back, with the session it came from. The date is kept
// so a question can say when "a month ago" actually was.
export interface PastClose {
  price: number;
  date: string; // YYYY-MM-DD
}

// One fiscal year of a reported figure, e.g. { period: "CY2021", value: 4.18 }.
export interface FiledYear {
  period: string;
  value: number;
}

// Shares outstanding from a filing's cover page, in millions, and the date
// they were counted.
export interface ShareCount {
  millions: number;
  date: string; // YYYY-MM-DD
}

// What a player can look up after answering: where the company trades, what
// it is, and where to read more. Any field may be null.
export interface CompanyProfile {
  // The exchange as Google Finance writes it ("NASDAQ", "NYSE").
  exchange: string | null;
  wikiTitle: string | null;
  subIndustry: string | null;
  headquarters: string | null;
  founded: string | null;
  // The opening of its Wikipedia article, two sentences at most.
  description: string | null;
}

// Month-end closes, oldest first, starting with the month `start` (YYYY-MM).
// The last one is the current month, ending on the latest close.
export interface MonthlyCloses {
  start: string;
  closes: number[];
}

// The EPS a P/E divides by: the last twelve months the company has reported,
// as filed (GAAP), on today's share basis.
export interface TrailingEps {
  value: number;
  // Last day of the twelve months, YYYY-MM-DD. Null only where the universe
  // file predates trailing figures and the last fiscal year stands in.
  end: string | null;
  // Whether the figure is the diluted one; a few companies file basic only.
  // Null where not known.
  diluted: boolean | null;
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
  // For the price CAGR questions. Yahoo's closes are split-adjusted, so these
  // compare with today's price; null where the listing is younger.
  threeYearsAgo: PastClose | null;
  fiveYearsAgo: PastClose | null;
  // NaN where the company never reported the figure - financials and REITs
  // largely do not report operating income. The eligibility bands reject NaN,
  // so such a company sits out only the questions that need it.
  eps: number;
  // What the P/E, earnings yield and payout ratio use. Null where nothing
  // recent was filed.
  trailingEps: TrailingEps | null;
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
  // Consecutive filed years, newest first, for the CAGR questions. Empty where
  // there is nothing to span.
  revenueHistory: FiledYear[]; // millions
  epsHistory: FiledYear[];
  // Null for a multi-class company or one whose count failed its cross-check.
  shares: ShareCount | null;
  // Diluted weighted-average shares behind the latest EPS, in millions, on
  // today's share basis. The company panel's market cap falls back to this
  // where there is no cross-checked cover count (multi-class companies).
  dilutedShares: number;
  // Millions; NaN where not reported. Panel fallbacks: net income for an EPS
  // where none was filed for the whole company (Airbnb files it per class),
  // pre-tax income for a margin where there is no operating line (banks).
  netIncome: number;
  // Amortization of intangibles in the same fiscal year as `eps`, millions;
  // NaN where not filed. The panel's P/E note says when it is a large share of
  // earnings, since it is why GAAP EPS can be far below an "adjusted" one.
  intangibleAmortization: number;
  pretaxIncome: number;
  // First day of trading (YYYY-MM-DD), for a listing too young to have a
  // one- or five-year return.
  listed: string | null;
  profile: CompanyProfile;
  // About five years of them, for the chart in the company panel.
  monthly: MonthlyCloses | null;
  // Trailing twelve months of dividends actually paid; 0 for a company that
  // pays none.
  dividendPerShare: number;
  dividendYield: number;
}

// A figure the company never reported is NaN in the build, but the build
// injects the array through JSON - which has no NaN and writes null instead.
type NumericField =
  | "eps"
  | "revenue"
  | "operatingProfit"
  | "priorRevenue"
  | "priorEps"
  | "dilutedShares"
  | "netIncome"
  | "intangibleAmortization"
  | "pretaxIncome";
type InjectedStock = Omit<StockData, NumericField> & Record<NumericField, number | null>;

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
  dilutedShares: reported(stock.dilutedShares),
  netIncome: reported(stock.netIncome),
  intangibleAmortization: reported(stock.intangibleAmortization),
  pretaxIncome: reported(stock.pretaxIncome),
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
  // A compound annual rate over three or five years. Negative is fine - a
  // business that shrank is a real answer - but past these the span is
  // dominated by a merger or a collapse rather than compounding.
  cagr: { min: -30, max: 60 },
  // Market cap in $bn. The floor keeps out a share count that has gone wrong
  // somewhere; the index itself starts around $5bn.
  marketCap: { min: 3, max: 10000 },
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

// NaN without a trailing figure, so the eligibility bands reject it.
export const trailingEpsOf = (s: StockData): number => s.trailingEps?.value ?? Number.NaN;
export const peRatioOf = (s: StockData): number => s.currentPrice / trailingEpsOf(s);
export const earningsYieldOf = (s: StockData): number => (trailingEpsOf(s) / s.currentPrice) * 100;
export const operatingMarginOf = (s: StockData): number =>
  (s.operatingProfit / s.revenue) * 100;
// Dividends are the trailing twelve months paid, so they set against the
// trailing twelve months earned.
export const payoutRatioOf = (s: StockData): number => (s.dividendPerShare / trailingEpsOf(s)) * 100;

// Compound annual growth between two values a number of years apart, in
// percent. NaN unless both ends are positive: a CAGR into or out of a loss is
// not a rate of anything.
export const cagrOf = (from: number, to: number, years: number): number =>
  from > 0 && to > 0 && years > 0 ? (Math.pow(to / from, 1 / years) - 1) * 100 : Number.NaN;

// Market cap in $bn: price times shares outstanding (held in millions).
export const marketCapOf = (s: StockData): number =>
  s.shares ? (s.currentPrice * s.shares.millions) / 1000 : Number.NaN;
