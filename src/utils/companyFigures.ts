import {
  type StockData,
  cagrOf,
  enterpriseValueOf,
  evToNopatOf,
  marketCapOf,
  nopatOf,
  taxRateOf,
  SENSIBLE,
  within,
  priceMoveOf,
  revenueGrowthOf,
} from "./stockData";
import { bigMoney, billions, fiscalLabel, money, percent, ratio, shortDate } from "./format";

// The company panel's numbers. Always the same rows in the same order, so one
// company can be read against the last; where a figure does not exist the row
// says why rather than disappearing. A figure worked out a second-best way is
// marked "≈" and its note says how.
export interface Figure {
  label: string;
  value: string;
  note?: string;
}

export const FIGURE_LABELS = [
  "Market cap",
  "P/E",
  "EV/NOPAT",
  "Dividend yield",
  "1-year return",
  "5-year return",
  "Operating margin",
  "Revenue growth, 1 yr",
  "Revenue growth, 5 yr",
] as const;

const NA = "n/a";

const signed = (value: number, decimals = 1): string =>
  `${value > 0 ? "+" : ""}${percent(value, decimals)}`;

// A market cap this far from revenue means the share count is on some other
// basis - Berkshire's diluted count is in Class A equivalents, about 1/1500th
// of the B shares a price is quoted for.
const PRICE_TO_SALES = { min: 0.02, max: 200 };

const marketCap = (s: StockData): Figure => {
  const label = "Market cap";
  if (s.shares) return { label, value: billions((s.currentPrice * s.shares.millions) / 1000) };

  if (Number.isFinite(s.dilutedShares) && s.dilutedShares > 0) {
    const cap = (s.currentPrice * s.dilutedShares) / 1000;
    const sales = s.revenue > 0 ? (cap * 1000) / s.revenue : NaN;
    if (!Number.isFinite(sales) || (sales >= PRICE_TO_SALES.min && sales <= PRICE_TO_SALES.max)) {
      return { label, value: `≈ ${billions(cap)}`, note: "from diluted shares; several share classes" };
    }
  }
  return {
    label,
    value: NA,
    note: s.revenue > 0 ? "share count filed per class only" : "no annual report yet",
  };
};

// Amortization this large a share of net income is the usual reason a GAAP
// P/E sits far above the one a company quotes on its "adjusted" EPS, which
// adds it back. A quarter is where it starts to move the multiple noticeably.
export const AMORTIZATION_SHARE = 0.25;

const amortizationNote = (s: StockData): string | null =>
  s.intangibleAmortization > 0 && s.netIncome > 0 && s.intangibleAmortization / s.netIncome >= AMORTIZATION_SHARE
    ? `after ${bigMoney(s.intangibleAmortization)} of intangibles amortization in ${fiscalLabel(s.fiscalYear)}, which "adjusted" EPS adds back`
    : null;

const peRatio = (s: StockData): Figure => {
  const label = "P/E";
  // Trailing and GAAP, and the note says whose twelve months.
  const trailing = s.trailingEps;
  if (trailing) {
    const period = trailing.end ? `GAAP, TTM to ${shortDate(trailing.end)}` : "GAAP, last annual report";
    if (trailing.value <= 0) {
      return { label, value: "n/m", note: `loss of ${money(Math.abs(trailing.value))} a share, ${period}` };
    }
    const amortization = amortizationNote(s);
    return {
      label,
      value: ratio(s.currentPrice / trailing.value),
      note: `${period}, ${money(trailing.value)} EPS${amortization ? `; ${amortization}` : ""}`,
    };
  }
  if (s.eps > 0) return { label, value: ratio(s.currentPrice / s.eps), note: "last annual report" };
  if (s.eps <= 0) return { label, value: "n/m", note: `loss of ${money(Math.abs(s.eps))} a share` };

  // No EPS for the whole company (Airbnb files it per share class).
  if (Number.isFinite(s.netIncome) && s.dilutedShares > 0) {
    const eps = s.netIncome / s.dilutedShares;
    return eps > 0
      ? { label, value: `≈ ${ratio(s.currentPrice / eps)}`, note: "net income ÷ diluted shares" }
      : { label, value: "n/m", note: "loss-making" };
  }
  return {
    label,
    value: NA,
    note: s.revenue > 0 ? "EPS filed per share class only" : "no annual report yet",
  };
};

// EV/NOPAT: the valuation of the whole enterprise rather than the equity.
// Needs a market cap stated as fact, both sides of net debt, an operating
// line, and an ordinary tax year; the note says which is missing.
const evToNopat = (s: StockData): Figure => {
  const label = "EV/NOPAT";
  if (!(s.operatingProfit > 0)) {
    return {
      label,
      value: NA,
      note: Number.isFinite(s.operatingProfit) ? "operating loss" : "no operating line filed",
    };
  }
  if (!s.shares) return { label, value: NA, note: s.revenue > 0 ? "share count filed per class only" : "no annual report yet" };
  if (!s.debt || !s.cash) return { label, value: NA, note: "debt or cash not filed under a known tag" };
  const rate = taxRateOf(s);
  if (!within(rate, SENSIBLE.taxRate)) {
    return {
      label,
      value: NA,
      note: Number.isFinite(rate) ? `tax rate of ${percent(rate, 1)} in ${fiscalLabel(s.fiscalYear)}` : "no tax figure filed",
    };
  }
  const multiple = evToNopatOf(s);
  if (!Number.isFinite(multiple) || multiple <= 0) return { label, value: NA, note: "enterprise value at or below zero" };
  const net = s.debt.millions - s.cash.millions;
  return {
    label,
    value: ratio(multiple),
    note:
      `EV ${billions(enterpriseValueOf(s))} = cap ${billions(marketCapOf(s))} ${net >= 0 ? "+" : "-"} ` +
      `${bigMoney(Math.abs(net))} net ${net >= 0 ? "debt" : "cash"}; NOPAT ${bigMoney(nopatOf(s))} at ${percent(rate, 1)} tax`,
  };
};

const dividendYield = (s: StockData): Figure =>
  s.dividendPerShare > 0
    ? { label: "Dividend yield", value: percent(s.dividendYield), note: `${money(s.dividendPerShare)} a year` }
    : { label: "Dividend yield", value: "None", note: "pays no dividend" };

const tooYoung = (s: StockData): string => (s.listed ? `listed ${shortDate(s.listed)}` : "no price that far back");

const oneYear = (s: StockData): Figure =>
  s.yearAgo
    ? { label: "1-year return", value: signed(priceMoveOf(s.yearAgo.price, s.currentPrice)), note: "price only" }
    : { label: "1-year return", value: NA, note: tooYoung(s) };

const fiveYear = (s: StockData): Figure => {
  const label = "5-year return";
  if (!s.fiveYearsAgo) return { label, value: NA, note: tooYoung(s) };
  const total = priceMoveOf(s.fiveYearsAgo.price, s.currentPrice);
  const annual = cagrOf(s.fiveYearsAgo.price, s.currentPrice, 5);
  return { label, value: signed(total, 0), note: `${signed(annual)} a year, price only` };
};

const margin = (s: StockData): Figure => {
  const label = "Operating margin";
  if (s.revenue > 0 && Number.isFinite(s.operatingProfit)) {
    return { label, value: percent((s.operatingProfit / s.revenue) * 100, 1) };
  }
  if (s.revenue > 0 && Number.isFinite(s.pretaxIncome)) {
    return {
      label,
      value: `≈ ${percent((s.pretaxIncome / s.revenue) * 100, 1)}`,
      note: "pre-tax; no operating line filed",
    };
  }
  return { label, value: NA, note: "not filed" };
};

const growthOneYear = (s: StockData): Figure => {
  const label = "Revenue growth, 1 yr";
  const history = s.revenueHistory;
  const growth = Number.isFinite(revenueGrowthOf(s))
    ? revenueGrowthOf(s)
    : history.length > 1
      ? priceMoveOf(history[1].value, history[0].value)
      : NaN;
  if (!Number.isFinite(growth)) return { label, value: NA, note: "no comparable prior year filed" };
  return { label, value: signed(growth), note: `${bigMoney(s.revenue)} in ${fiscalLabel(s.fiscalYear)}` };
};

const growthFiveYear = (s: StockData): Figure => {
  const label = "Revenue growth, 5 yr";
  const history = s.revenueHistory;
  if (history.length > 5) {
    const rate = cagrOf(history[5].value, history[0].value, 5);
    if (Number.isFinite(rate)) return { label, value: `${signed(rate)} a yr`, note: `compound, since ${fiscalLabel(history[5].period)}` };
  }
  // The longest span filed on a comparable basis, labelled as such.
  if (history.length > 2) {
    const years = history.length - 1;
    const rate = cagrOf(history[years].value, history[0].value, years);
    if (Number.isFinite(rate)) {
      return { label, value: `${signed(rate)} a yr`, note: `over ${years} years; only ${history.length} comparable years filed` };
    }
  }
  return { label, value: NA, note: "fewer than three comparable years filed" };
};

export const companyFigures = (s: StockData): Figure[] => [
  marketCap(s),
  peRatio(s),
  evToNopat(s),
  dividendYield(s),
  oneYear(s),
  fiveYear(s),
  margin(s),
  growthOneYear(s),
  growthFiveYear(s),
];
