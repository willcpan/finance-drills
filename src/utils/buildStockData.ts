// Build-time only. Imported by vite.config.ts (and its test) to turn
// Stockdata.csv plus data/prices.json into the array the build injects as
// __GAME_STOCK_DATA__. Nothing in the app imports this, so papaparse stays out
// of the client bundle.
//
// Fundamentals come from the CSV, prices from the refreshed quote file. The
// split matches how the two actually age: revenue and EPS move once a quarter,
// prices move every day.
import Papa from "papaparse";
import type { PastClose, StockData } from "./stockData";

export interface Quote {
  price: number;
  previousClose: number;
  // Optional: a quote predating these fields, or one whose history was too
  // short, still gives a usable day-move question.
  name?: string | null;
  monthAgo?: PastClose | null;
  yearAgo?: PastClose | null;
}

export interface PriceFile {
  asOf: string;
  source?: string;
  quotes: Record<string, Quote>;
}

export interface BuildResult {
  stocks: StockData[];
  // When the prices were taken, or null if the build fell back to CSV prices.
  asOf: string | null;
  // Tickers in the CSV that had no usable quote, so were left out.
  withoutQuote: string[];
}

interface StockRow {
  Ticker?: string;
  Revenue?: string | number;
  "Stock Price"?: string | number;
  EPS?: string | number;
  "Operating Profit"?: string | number;
  "Annual Dividend"?: string | number;
}

// Excel and friends write a byte-order mark ahead of the header, which would
// otherwise land in the first column name and lose every Ticker.
const stripBom = (text: string): string =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toNumber = (value: string | number | undefined): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Deterministic 0..1 from the ticker (FNV-1a). Only used by the no-quote
// fallback below; a Math.random() prior close moved on every build, so the
// same company drilled a different number each time.
const seededUnitFloat = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
};

// Stand-in prior close within +/-2% of price, for a build with no quote file.
export const derivePreviousClose = (ticker: string, price: number): number =>
  round2(Math.max(0.01, price * (1 + (seededUnitFloat(ticker) * 0.04 - 0.02))));

const isUsableQuote = (quote: Quote | undefined): quote is Quote =>
  !!quote &&
  Number.isFinite(quote.price) &&
  quote.price > 0 &&
  Number.isFinite(quote.previousClose) &&
  quote.previousClose > 0;

// A past close is only usable if both halves survived the fetch. A malformed
// one costs the company its longer-horizon questions, not its whole row.
const pastClose = (past: PastClose | null | undefined): PastClose | null =>
  past && Number.isFinite(past.price) && past.price > 0 && typeof past.date === "string"
    ? { price: round2(past.price), date: past.date }
    : null;

export function buildStockData(csvText: string, prices: PriceFile | null): BuildResult {
  const parsed = Papa.parse<StockRow>(stripBom(csvText), {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`Stockdata.csv did not parse: ${parsed.errors[0].message}`);
  }

  // A quote file with no quotes is as good as none: fall back rather than
  // build an empty drill.
  const quotes = prices?.quotes && Object.keys(prices.quotes).length > 0 ? prices.quotes : null;

  const stocks: StockData[] = [];
  const withoutQuote: string[] = [];
  const seen = new Set<string>();

  for (const row of parsed.data) {
    const ticker = (row.Ticker ?? "").trim();
    const csvPrice = toNumber(row["Stock Price"]);
    const eps = toNumber(row.EPS);
    const revenue = toNumber(row.Revenue);
    const operatingProfit = toNumber(row["Operating Profit"]);
    const dividendPerShare = toNumber(row["Annual Dividend"]);

    // A few rows have blank cells. Drop anything that did not parse rather
    // than letting NaN reach the question generator.
    if (
      !ticker ||
      !(csvPrice > 0) ||
      !Number.isFinite(eps) ||
      !Number.isFinite(revenue) ||
      !Number.isFinite(operatingProfit) ||
      !Number.isFinite(dividendPerShare)
    ) {
      continue;
    }

    // The CSV has carried exact duplicate rows before, which does not corrupt
    // any answer but makes the repeated company that many times more likely to
    // come up. First row wins.
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    let price: number;
    let previousClose: number;
    let name = ticker;
    let monthAgo: PastClose | null = null;
    let yearAgo: PastClose | null = null;

    if (quotes) {
      const quote = quotes[ticker];
      if (!isUsableQuote(quote)) {
        // Acquired, taken private, renamed, or listed only in another
        // currency. Its price can never be refreshed again, and pairing a
        // frozen price with an invented prior close is exactly what the quote
        // file exists to stop - so it sits the drill out.
        withoutQuote.push(ticker);
        continue;
      }
      price = round2(quote.price);
      previousClose = round2(quote.previousClose);
      // The ticker is the fallback name: every screen that shows a name can
      // then render it without a null check.
      name = quote.name?.trim() || ticker;
      monthAgo = pastClose(quote.monthAgo);
      yearAgo = pastClose(quote.yearAgo);
    } else {
      price = round2(csvPrice);
      previousClose = derivePreviousClose(ticker, csvPrice);
      // The CSV holds no names and no history, so a fallback build drills the
      // day move only.
    }

    stocks.push({
      ticker,
      name,
      currentPrice: price,
      previousClose,
      monthAgo,
      yearAgo,
      eps,
      revenue,
      operatingProfit,
      dividendPerShare: round2(dividendPerShare),
      // Against the live price, not the CSV's.
      dividendYield: round2((dividendPerShare / price) * 100),
    });
  }

  return {
    stocks,
    asOf: quotes ? (prices as PriceFile).asOf : null,
    withoutQuote,
  };
}
