// Build-time only. Imported by vite.config.ts (and its test) to join
// data/universe.json with data/prices.json into the array the build injects as
// __GAME_STOCK_DATA__.
//
// The two files split along how fast their contents age, and along who
// publishes them:
//
//   universe.json  who is in the S&P 500, and what they reported - the index
//                  from Wikipedia, revenue, operating profit and EPS from SEC
//                  filings. Changes when a company files or the index is
//                  reconstituted.
//   prices.json    price, the closes behind it, and the dividends paid.
//                  Changes every trading day.
import type { PastClose, StockData } from "./stockData";

export interface Company {
  ticker: string;
  name: string;
  sector: string;
  cik: number;
  // Any of these may be null. Financials and REITs mostly do not report
  // operating income at all, and a company too newly listed to have filed an
  // annual report has none of them.
  revenue: number | null; // millions
  operatingProfit: number | null; // millions
  eps: number | null;
  fiscalYear: string | null;
}

export interface Universe {
  asOf: string;
  index: string;
  companies: Company[];
}

export interface Quote {
  price: number;
  previousClose: number;
  name?: string | null;
  monthAgo?: PastClose | null;
  yearAgo?: PastClose | null;
  // Trailing twelve months of payments. Zero for a company that pays none,
  // which is a fact about it rather than a missing value.
  dividend?: number | null;
}

export interface PriceFile {
  asOf: string;
  source?: string;
  quotes: Record<string, Quote>;
}

export interface BuildResult {
  stocks: StockData[];
  // When the prices were taken.
  asOf: string | null;
  // Index members with no usable quote, so left out.
  withoutQuote: string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isUsableQuote = (quote: Quote | undefined): quote is Quote =>
  !!quote && isNumber(quote.price) && quote.price > 0 && isNumber(quote.previousClose) && quote.previousClose > 0;

// A past close is only usable if both halves survived the fetch. A malformed
// one costs the company its longer-horizon questions, not its whole row.
const pastClose = (past: PastClose | null | undefined): PastClose | null =>
  past && isNumber(past.price) && past.price > 0 && typeof past.date === "string"
    ? { price: round2(past.price), date: past.date }
    : null;

// A figure the company never reported becomes NaN rather than 0, because 0 is
// a claim. The eligibility bands in questionGenerator reject NaN, so the
// company simply sits out the questions that need it - a bank with no
// operating income keeps its P/E question and loses its margin question.
const reported = (value: number | null | undefined): number =>
  isNumber(value) ? value : Number.NaN;

export function buildStockData(universe: Universe | null, prices: PriceFile | null): BuildResult {
  const companies = universe?.companies ?? [];
  const quotes = prices?.quotes ?? {};

  const stocks: StockData[] = [];
  const withoutQuote: string[] = [];
  const seen = new Set<string>();

  for (const company of companies) {
    const ticker = (company.ticker ?? "").trim();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);

    const quote = quotes[ticker];
    if (!isUsableQuote(quote)) {
      // No price means no question: every type prints one, even the ones that
      // ask about earnings.
      withoutQuote.push(ticker);
      continue;
    }

    const price = round2(quote.price);
    const dividendPerShare = isNumber(quote.dividend) ? round2(quote.dividend) : 0;

    stocks.push({
      ticker,
      // The index table's name is the plain one ("Apple Inc." over "Apple Inc.
      // Common Stock"); the quote's is the fallback.
      name: company.name?.trim() || quote.name?.trim() || ticker,
      sector: company.sector?.trim() || null,
      currentPrice: price,
      previousClose: round2(quote.previousClose),
      monthAgo: pastClose(quote.monthAgo),
      yearAgo: pastClose(quote.yearAgo),
      eps: reported(company.eps),
      revenue: reported(company.revenue),
      operatingProfit: reported(company.operatingProfit),
      fiscalYear: company.fiscalYear ?? null,
      dividendPerShare,
      dividendYield: price > 0 ? round2((dividendPerShare / price) * 100) : 0,
    });
  }

  return {
    stocks,
    asOf: prices?.asOf ?? null,
    withoutQuote,
  };
}
