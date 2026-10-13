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
import type { CompanyProfile, FiledYear, MonthlyCloses, PastClose, StockData } from "./stockData";
import { reconcileShares, type ShareCounts, type Split } from "./shareBasis";

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
  // The year before, measured under the same XBRL concept, so growth is
  // growth rather than a change of accounting tag.
  prior?: {
    revenue: number | null; // millions
    eps: number | null;
    revenueFiscalYear: string | null;
    epsFiscalYear: string | null;
  };
  // Every consecutive year back from the latest, newest first, for the CAGR
  // questions. The EPS run also stops at any split the SEC left unrestated.
  history?: {
    revenue: FiledYear[]; // millions
    eps: FiledYear[];
  };
  // The cover page's count and the diluted weighted average, reconciled here
  // against splits (see shareBasis.ts).
  shareCounts?: ShareCounts;
  // For the company panel: net income for an EPS where none was filed for the
  // whole company, pre-tax income for a margin where there is no operating
  // line. Millions.
  netIncome?: number | null;
  pretaxIncome?: number | null;
  profile?: Partial<CompanyProfile>;
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
  threeYearsAgo?: PastClose | null;
  fiveYearsAgo?: PastClose | null;
  monthly?: MonthlyCloses | null;
  splits?: Split[] | null;
  listed?: string | null;
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

// A history is only as long as its run of well-formed years: one bad entry
// ends it, because every year after it would be counted from the wrong end.
const filedYears = (history: FiledYear[] | undefined): FiledYear[] => {
  const run: FiledYear[] = [];
  for (const entry of history ?? []) {
    if (!entry || typeof entry.period !== "string" || !isNumber(entry.value)) break;
    run.push({ period: entry.period, value: entry.value });
  }
  return run;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const companyProfile = (profile: Partial<CompanyProfile> | undefined): CompanyProfile => ({
  exchange: text(profile?.exchange),
  wikiTitle: text(profile?.wikiTitle),
  subIndustry: text(profile?.subIndustry),
  headquarters: text(profile?.headquarters),
  founded: text(profile?.founded),
  description: text(profile?.description),
});

// A chart needs a run of real prices; one bad entry and it is not drawn.
const monthlyCloses = (monthly: MonthlyCloses | null | undefined): MonthlyCloses | null =>
  monthly &&
  typeof monthly.start === "string" &&
  /^\d{4}-\d{2}$/.test(monthly.start) &&
  Array.isArray(monthly.closes) &&
  monthly.closes.length >= 2 &&
  monthly.closes.every(close => isNumber(close) && close > 0)
    ? { start: monthly.start, closes: monthly.closes }
    : null;

const splitList = (splits: Split[] | null | undefined): Split[] =>
  (splits ?? []).filter(s => s && typeof s.date === "string" && isNumber(s.ratio) && s.ratio > 0);

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

    // Per-share figures onto the basis today's price is quoted on.
    const basis = reconcileShares(
      company.shareCounts,
      splitList(quote.splits),
      reported(company.netIncome),
      reported(company.eps),
      company.fiscalYear ?? null
    );
    // EPS is reported in cents, so an adjusted figure is rounded back to them:
    // a question prints it to the cent and works its answer from what it prints.
    const onBasis = (value: number): number =>
      basis.epsDivisor === 1 ? value : round2(value / basis.epsDivisor);
    const perShare = (value: number | null | undefined): number => onBasis(reported(value));

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
      threeYearsAgo: pastClose(quote.threeYearsAgo),
      fiveYearsAgo: pastClose(quote.fiveYearsAgo),
      eps: perShare(company.eps),
      revenue: reported(company.revenue),
      operatingProfit: reported(company.operatingProfit),
      fiscalYear: company.fiscalYear ?? null,
      priorRevenue: reported(company.prior?.revenue),
      priorEps: perShare(company.prior?.eps),
      priorRevenueFiscalYear: company.prior?.revenueFiscalYear ?? null,
      priorEpsFiscalYear: company.prior?.epsFiscalYear ?? null,
      revenueHistory: filedYears(company.history?.revenue),
      epsHistory: filedYears(company.history?.eps).map(year => ({
        period: year.period,
        value: onBasis(year.value),
      })),
      shares: basis.shares,
      dilutedShares: basis.dilutedMillions,
      netIncome: reported(company.netIncome),
      pretaxIncome: reported(company.pretaxIncome),
      listed: typeof quote.listed === "string" ? quote.listed : null,
      profile: companyProfile(company.profile),
      monthly: monthlyCloses(quote.monthly),
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
