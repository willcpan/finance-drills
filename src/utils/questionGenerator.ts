import {
  type StockData,
  type FiledYear,
  type PastClose,
  stocks,
  randomInt,
  pickFrom,
  roundTo2,
  SENSIBLE,
  within,
  priceMoveOf,
  usablePast,
  revenueGrowthOf,
  epsGrowthOf,
  peRatioOf,
  earningsYieldOf,
  operatingMarginOf,
  payoutRatioOf,
  cagrOf,
  marketCapOf,
} from "./stockData";
import {
  money,
  percent,
  ratio,
  shortDate,
  fiscalLabel,
  bigMoney,
  bigMoneyShown,
  billions,
  millionShares,
} from "./format";

export type QuestionType =
  | "percentageChange"
  | "monthChange"
  | "yearChange"
  | "priceFromMove"
  | "recoveryGain"
  | "priceCagr"
  | "dividendYield"
  | "dividendPerShare"
  | "payoutRatio"
  | "peRatio"
  | "earningsYield"
  | "marketCap"
  | "operatingMargin"
  | "revenueGrowth"
  | "epsGrowth"
  | "epsFromGrowth"
  | "revenueCagr"
  | "epsCagr";

export type QuestionCategory =
  | "priceMoves"
  | "dividends"
  | "valuation"
  | "profitability"
  | "growth";

export type DifficultyLevel = "easy" | "medium" | "hard";

// What unit the answer is in. Drives tolerance, the input affordances and how
// the answer is rendered back to the player.
export type AnswerUnit = "currency" | "percentagePoints" | "ratio" | "billions" | "millionShares";

export interface Question {
  id: string;
  type: QuestionType;
  category: QuestionCategory;
  difficulty: DifficultyLevel;
  text: string;
  stockData: StockData | null;
  correctAnswer: number;
  answerUnit: AnswerUnit;
  // Absolute tolerance, in the same units as correctAnswer.
  tolerance: number;
  // The shortcut, worked through with this question's real numbers. Shown after
  // answering - a drill that never explains the method is only a test.
  method: string[];
}

// Every question is built from something that actually happened: a price the
// stock closed at, a figure the company filed. Nothing is a round number
// invented for the drill, so each answer is also a fact worth knowing.
//
// `weight` is how often a type comes up relative to the rest (default 1).
export const QUESTION_META: Record<
  QuestionType,
  { label: string; category: QuestionCategory; blurb: string; weight?: number }
> = {
  percentageChange: {
    label: "Percentage Change",
    category: "priceMoves",
    blurb: "Turn yesterday's close and today's price into a move",
    // A single session's move is usually a fraction of a percent, which makes
    // for a dull question asked often. It still turns up, just less.
    weight: 0.3,
  },
  monthChange: {
    label: "1-Month Change",
    category: "priceMoves",
    blurb: "A month of price movement as a percentage",
  },
  yearChange: {
    label: "1-Year Change",
    category: "priceMoves",
    blurb: "A year of price movement as a percentage",
  },
  priceFromMove: {
    label: "Price From a Move",
    category: "priceMoves",
    blurb: "Apply a stock's real move to the price it started from",
  },
  recoveryGain: {
    label: "Recovery Gain",
    category: "priceMoves",
    blurb: "The gain a stock that fell needs to get back",
  },
  priceCagr: {
    label: "Price CAGR",
    category: "priceMoves",
    blurb: "Three or five years of share price as an annual rate",
  },
  dividendYield: {
    label: "Dividend Yield",
    category: "dividends",
    blurb: "Dividend per share over price",
  },
  dividendPerShare: {
    label: "Dividend Per Share",
    category: "dividends",
    blurb: "Back out the cash dividend from a yield",
  },
  payoutRatio: {
    label: "Payout Ratio",
    category: "dividends",
    blurb: "What share of earnings goes out as dividend",
  },
  peRatio: {
    label: "P/E Ratio",
    category: "valuation",
    blurb: "Price over earnings per share",
  },
  earningsYield: {
    label: "Earnings Yield",
    category: "valuation",
    blurb: "The P/E flipped over",
  },
  marketCap: {
    label: "Market Cap",
    category: "valuation",
    blurb: "Price, shares outstanding, market cap: given two, find the third",
  },
  operatingMargin: {
    label: "Operating Margin",
    category: "profitability",
    blurb: "Operating profit as a share of revenue",
  },
  revenueGrowth: {
    label: "Revenue Growth",
    category: "growth",
    blurb: "Two years of revenue into a growth rate",
  },
  epsGrowth: {
    label: "EPS Growth",
    category: "growth",
    blurb: "Two years of earnings per share into a growth rate",
  },
  epsFromGrowth: {
    label: "EPS From Growth",
    category: "growth",
    blurb: "Apply a company's real EPS growth to the year before",
  },
  revenueCagr: {
    label: "Revenue CAGR",
    category: "growth",
    blurb: "Three or five filed years of revenue as an annual rate",
  },
  epsCagr: {
    label: "EPS CAGR",
    category: "growth",
    blurb: "Three or five filed years of EPS as an annual rate",
  },
};

export const CATEGORY_META: Record<QuestionCategory, { label: string }> = {
  priceMoves: { label: "Price moves" },
  dividends: { label: "Dividends" },
  valuation: { label: "Valuation" },
  profitability: { label: "Profitability" },
  growth: { label: "Growth" },
};

export const ALL_QUESTION_TYPES = Object.keys(QUESTION_META) as QuestionType[];

// ---------------------------------------------------------------------------
// Tolerance
//
// Tolerances are absolute and expressed in the answer's own units. Two rules
// shape them:
//
// 1. A price tolerance stays well under the smallest move we ask about, so the
//    figure already printed in the question never falls inside it. Otherwise
//    the player scores by retyping a number off the screen.
// 2. Percentage-point answers get a flat tolerance rather than a fraction of
//    the answer. Percentage changes sit near zero and are often negative;
//    scaling by the answer collapses the tolerance or turns it negative.
//
// The bands are meant for estimating in your head, not for long division: an
// answer that is right to the first decimal or two significant figures should
// score.
// ---------------------------------------------------------------------------

const PRICE_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.015,
  medium: 0.0075,
  hard: 0.004,
};

const POINT_TOLERANCE: Record<DifficultyLevel, number> = {
  easy: 0.35,
  medium: 0.2,
  hard: 0.1,
};

// Margins and payout ratios run to tens of points, so a flat quarter-point is
// unreasonably strict. These scale, with a floor.
const WIDE_POINT_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.06,
  medium: 0.04,
  hard: 0.025,
};

const DIVIDEND_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.07,
  medium: 0.05,
  hard: 0.03,
};

const RATIO_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.1,
  medium: 0.07,
  hard: 0.05,
};

// Market cap is a multiplication or division of two awkward numbers, done by
// rounding them. These allow for that rounding and no more.
const PRODUCT_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.05,
  medium: 0.03,
  hard: 0.02,
};

// A CAGR is found by bracketing - 9% a year for five years is 1.54x, 10% is
// 1.61x - so the band is about a point wide on easy, scaling up for the large
// rates where a single point is a fine distinction.
const CAGR_TOLERANCE: Record<DifficultyLevel, number> = {
  easy: 0.75,
  medium: 0.5,
  hard: 0.3,
};

const CAGR_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.06,
  medium: 0.04,
  hard: 0.025,
};

const scaled = (
  answer: number,
  table: Record<DifficultyLevel, number>,
  difficulty: DifficultyLevel,
  floor: number
): number => Math.max(floor, Math.abs(answer) * table[difficulty]);

// ---------------------------------------------------------------------------
// Real spans and moves a question can be built on
// ---------------------------------------------------------------------------

// The questions that apply a real move to a starting figure ask for a price
// or an EPS. The move has to be comfortably wider than the easy tolerance, or
// retyping the starting figure would score (rule 1 above).
const MIN_APPLIED_MOVE = 5;

// A stock has to have fallen at least this far for "what gets it back" to be a
// question worth asking.
const MIN_RECOVERY_FALL = 10;

const CAGR_SPANS = [3, 5] as const;

interface Horizon {
  label: string;
  past: PastClose;
}

const horizonsOf = (s: StockData): Horizon[] => {
  const horizons: Horizon[] = [];
  if (usablePast(s.monthAgo)) horizons.push({ label: "a month ago", past: s.monthAgo });
  if (usablePast(s.yearAgo)) horizons.push({ label: "a year ago", past: s.yearAgo });
  return horizons;
};

const appliedMoveHorizons = (s: StockData): Horizon[] =>
  horizonsOf(s).filter(h => Math.abs(priceMoveOf(h.past.price, s.currentPrice)) >= MIN_APPLIED_MOVE);

interface Span {
  years: number;
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
}

// Spans across a filed history (newest first): the latest year against the
// one three or five years before it.
const filedSpans = (history: FiledYear[]): Span[] =>
  CAGR_SPANS.filter(years => history.length > years)
    .map(years => ({
      years,
      from: history[years].value,
      to: history[0].value,
      fromLabel: fiscalLabel(history[years].period),
      toLabel: fiscalLabel(history[0].period),
    }))
    .filter(span => within(cagrOf(span.from, span.to, span.years), SENSIBLE.cagr));

const priceSpans = (s: StockData): Span[] => {
  const spans: Span[] = [];
  for (const [years, past] of [
    [3, s.threeYearsAgo],
    [5, s.fiveYearsAgo],
  ] as [number, PastClose | null][]) {
    if (!usablePast(past)) continue;
    spans.push({
      years,
      from: past.price,
      to: s.currentPrice,
      fromLabel: shortDate(past.date),
      toLabel: "today",
    });
  }
  return spans.filter(span => within(cagrOf(span.from, span.to, span.years), SENSIBLE.cagr));
};

// ---------------------------------------------------------------------------
// Eligible stocks per question type
//
// Built once at module load. A question type only draws from rows where its
// answer lands inside a band worth drilling - see SENSIBLE in stockData.ts.
// ---------------------------------------------------------------------------

const hasUsablePrice = (s: StockData) => within(s.currentPrice, SENSIBLE.price);

const hasEpsPair = (s: StockData) =>
  s.priorEps > 0 && s.eps > 0 && within(epsGrowthOf(s), SENSIBLE.epsGrowth);

const ELIGIBLE: Record<QuestionType, StockData[]> = {
  percentageChange: stocks.filter(s => hasUsablePrice(s) && s.previousClose > 0),
  // Both prices a longer-horizon question prints have to be workable numbers,
  // so the past close passes the same band as the current price. The move
  // itself is left alone: a stock that tripled in a year is the interesting
  // case, not a broken one.
  monthChange: stocks.filter(s => hasUsablePrice(s) && usablePast(s.monthAgo)),
  yearChange: stocks.filter(s => hasUsablePrice(s) && usablePast(s.yearAgo)),
  priceFromMove: stocks.filter(s => hasUsablePrice(s) && appliedMoveHorizons(s).length > 0),
  recoveryGain: stocks.filter(
    s =>
      hasUsablePrice(s) &&
      usablePast(s.yearAgo) &&
      -priceMoveOf(s.yearAgo.price, s.currentPrice) >= MIN_RECOVERY_FALL
  ),
  priceCagr: stocks.filter(s => hasUsablePrice(s) && priceSpans(s).length > 0),
  dividendYield: stocks.filter(
    s =>
      hasUsablePrice(s) &&
      s.dividendPerShare > 0 &&
      within((s.dividendPerShare / s.currentPrice) * 100, SENSIBLE.dividendYield)
  ),
  dividendPerShare: stocks.filter(
    s =>
      hasUsablePrice(s) &&
      within(s.dividendPerShare, SENSIBLE.dividendPerShare) &&
      within((s.dividendPerShare / s.currentPrice) * 100, SENSIBLE.dividendYield)
  ),
  payoutRatio: stocks.filter(
    s => s.eps > 0 && s.dividendPerShare > 0 && within(payoutRatioOf(s), SENSIBLE.payoutRatio)
  ),
  peRatio: stocks.filter(s => s.eps > 0 && hasUsablePrice(s) && within(peRatioOf(s), SENSIBLE.peRatio)),
  earningsYield: stocks.filter(
    s => s.eps > 0 && hasUsablePrice(s) && within(earningsYieldOf(s), SENSIBLE.earningsYield)
  ),
  marketCap: stocks.filter(s => hasUsablePrice(s) && within(marketCapOf(s), SENSIBLE.marketCap)),
  operatingMargin: stocks.filter(
    s => s.revenue > 0 && within(operatingMarginOf(s), SENSIBLE.operatingMargin)
  ),
  // Growth needs both ends, measured the same way. EPS growth additionally
  // needs both ends positive: a swing out of a loss is a percentage of a
  // negative number, which means nothing.
  revenueGrowth: stocks.filter(
    s => s.priorRevenue > 0 && s.revenue > 0 && within(revenueGrowthOf(s), SENSIBLE.revenueGrowth)
  ),
  epsGrowth: stocks.filter(hasEpsPair),
  epsFromGrowth: stocks.filter(s => hasEpsPair(s) && Math.abs(epsGrowthOf(s)) >= MIN_APPLIED_MOVE),
  revenueCagr: stocks.filter(s => filedSpans(s.revenueHistory).length > 0),
  epsCagr: stocks.filter(s => filedSpans(s.epsHistory).length > 0),
};

// On easy, prefer prices that are kinder to work with.
const preferSimple = (pool: StockData[], difficulty: DifficultyLevel): StockData[] => {
  if (difficulty !== "easy") return pool;
  const simple = pool.filter(s => s.currentPrice <= 300);
  return simple.length >= 20 ? simple : pool;
};

export const eligibleCount = (type: QuestionType): number => ELIGIBLE[type].length;

export const availableTypes = (): QuestionType[] =>
  ALL_QUESTION_TYPES.filter(type => ELIGIBLE[type].length > 0);

const newId = (): string => Math.random().toString(36).substring(2, 9);

const base = (
  type: QuestionType,
  difficulty: DifficultyLevel,
  stock: StockData | null
) => ({
  id: newId(),
  type,
  category: QUESTION_META[type].category,
  difficulty,
  stockData: stock,
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// How a question names the company: the name a player might recognise, with
// the ticker they will see on a screen. Falls back to the bare ticker when the
// two are the same, which is what a build with no quote file has.
const subject = (stock: StockData): string =>
  stock.name === stock.ticker ? stock.ticker : `${stock.name} (${stock.ticker})`;

// The three percentage-move questions differ only in where they start from, so
// they share the arithmetic and the worked method.
const moveMethod = (from: number, to: number, answer: number): string[] => {
  const diff = to - from;
  const onePercent = from / 100;

  return [
    `The move is ${money(to)} - ${money(from)} = ${money(diff)}.`,
    `1% of the ${money(from)} starting point is ${money(onePercent)}.`,
    `${money(Math.abs(diff))} / ${money(onePercent)} = ${percent(answer)}.`,
  ];
};

const percentageChange = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2(priceMoveOf(stock.previousClose, stock.currentPrice));

  return {
    ...base("percentageChange", difficulty, stock),
    text: `${subject(stock)} closed at ${money(stock.previousClose)} and now trades at ${money(stock.currentPrice)}. What is the percentage change?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: POINT_TOLERANCE[difficulty],
    method: moveMethod(stock.previousClose, stock.currentPrice, answer),
  };
};

// A month or a year of movement runs to tens of points and sometimes past a
// hundred, where the flat day-move tolerance would be punishing - a hard
// 0.1pp on a 509% answer asks for four significant figures. These scale with
// the answer instead, and never tighten past the flat one.
const horizonTolerance = (answer: number, difficulty: DifficultyLevel): number =>
  scaled(answer, WIDE_POINT_TOLERANCE_FRACTION, difficulty, POINT_TOLERANCE[difficulty]);

const horizonChange = (
  type: "monthChange" | "yearChange",
  horizon: string,
  past: PastClose,
  stock: StockData,
  difficulty: DifficultyLevel
): Question => {
  const answer = roundTo2(priceMoveOf(past.price, stock.currentPrice));

  return {
    ...base(type, difficulty, stock),
    text:
      `${subject(stock)} closed at ${money(past.price)} ${horizon} (${shortDate(past.date)}). ` +
      `It now trades at ${money(stock.currentPrice)}. What is the percentage change?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: horizonTolerance(answer, difficulty),
    method: moveMethod(past.price, stock.currentPrice, answer),
  };
};

const monthChange = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const past = stock.monthAgo;
  // ELIGIBLE.monthChange only holds rows carrying a usable month-ago close, so
  // this cannot fire by way of generateQuestion.
  if (!usablePast(past)) throw new Error(`${stock.ticker} has no month-ago close`);
  return horizonChange("monthChange", "a month ago", past, stock, difficulty);
};

const yearChange = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const past = stock.yearAgo;
  if (!usablePast(past)) throw new Error(`${stock.ticker} has no year-ago close`);
  return horizonChange("yearChange", "a year ago", past, stock, difficulty);
};

// The move is printed to one decimal and the answer follows from the printed
// figure, so working from what is on screen is exactly right. It lands within
// a few cents of where the stock actually trades.
const priceFromMove = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const horizon = pickFrom(appliedMoveHorizons(stock));
  const start = horizon.past.price;
  const move = Number(priceMoveOf(start, stock.currentPrice).toFixed(1));
  const onePercent = start / 100;
  const change = start * (move / 100);
  const answer = roundTo2(start + change);

  return {
    ...base("priceFromMove", difficulty, stock),
    text:
      `${subject(stock)} closed at ${money(start)} ${horizon.label} (${shortDate(horizon.past.date)}) ` +
      `and has ${move >= 0 ? "risen" : "fallen"} ${percent(Math.abs(move), 1)} since. ` +
      `What does it trade at now?`,
    correctAnswer: answer,
    answerUnit: "currency",
    tolerance: scaled(answer, PRICE_TOLERANCE_FRACTION, difficulty, 0.02),
    method: [
      `1% of ${money(start)} is ${money(onePercent)}.`,
      `${percent(Math.abs(move), 1)} is ${money(onePercent)} x ${Math.abs(move)} = ${money(Math.abs(change))}.`,
      `${money(start)} ${move >= 0 ? "+" : "-"} ${money(Math.abs(change))} = ${money(answer)}. It last traded at ${money(stock.currentPrice)}.`,
    ],
  };
};

// Asked about a stock that really did fall, from the close it fell from.
const recoveryGain = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const past = stock.yearAgo;
  if (!usablePast(past)) throw new Error(`${stock.ticker} has no year-ago close`);

  const from = past.price;
  const now = stock.currentPrice;
  const fall = -priceMoveOf(from, now);
  const gap = from - now;
  const answer = roundTo2(priceMoveOf(now, from));

  return {
    ...base("recoveryGain", difficulty, stock),
    text:
      `${subject(stock)} closed at ${money(from)} a year ago (${shortDate(past.date)}) and now trades at ` +
      `${money(now)}, down ${percent(fall, 1)}. What gain from here would take it back to ${money(from)}?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: scaled(answer, WIDE_POINT_TOLERANCE_FRACTION, difficulty, POINT_TOLERANCE[difficulty]),
    method: [
      `The ${money(gap)} it lost has to be made back on today's smaller ${money(now)} base.`,
      `1% of ${money(now)} is ${money(now / 100)}.`,
      `${money(gap)} / ${money(now / 100)} = ${percent(answer)} - more than the ${percent(fall, 1)} it fell.`,
    ],
  };
};

// ---------------------------------------------------------------------------
// CAGR
// ---------------------------------------------------------------------------

const multipleOf = (rate: number, years: number): number => Math.pow(1 + rate / 100, years);

// Bracketing is how a CAGR is done without a calculator: compound two whole
// rates either side for the span and see where the real multiple falls.
const cagrMethod = (span: Span, answer: number, fmt: (value: number) => string): string[] => {
  const multiple = span.to / span.from;
  const simple = ((multiple - 1) * 100) / span.years;
  const low = Math.floor(answer);
  const high = low + 1;

  return [
    `Total change: ${fmt(span.to)} / ${fmt(span.from)} = ${multiple.toFixed(2)}x over ${span.years} years.`,
    `First guess: the ${percent((multiple - 1) * 100, 0)} total spread evenly is ${percent(simple, 1)} a year. ` +
      `Compounding always lands below that.`,
    `Bracket it: ${low}% a year for ${span.years} years is ${multipleOf(low, span.years).toFixed(2)}x, ` +
      `${high}% is ${multipleOf(high, span.years).toFixed(2)}x.`,
    `${multiple.toFixed(2)}x sits between them: ${percent(answer)} a year.`,
  ];
};

const cagrTolerance = (answer: number, difficulty: DifficultyLevel): number =>
  scaled(answer, CAGR_TOLERANCE_FRACTION, difficulty, CAGR_TOLERANCE[difficulty]);

const pickSpan = (spans: Span[], difficulty: DifficultyLevel): Span => {
  // A three-year span is the gentler root to take; easy prefers it.
  if (difficulty === "easy") {
    const short = spans.filter(s => s.years === 3);
    if (short.length > 0) return pickFrom(short);
  }
  return pickFrom(spans);
};

const revenueCagr = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const filed = pickSpan(filedSpans(stock.revenueHistory), difficulty);
  // Revenue prints to $0.1bn, which over three years can move the rate by a
  // fifth of a point. The rate is worked from the printed figures instead.
  const span = { ...filed, from: bigMoneyShown(filed.from), to: bigMoneyShown(filed.to) };
  const answer = roundTo2(cagrOf(span.from, span.to, span.years));

  return {
    ...base("revenueCagr", difficulty, stock),
    text:
      `${subject(stock)} reported revenue of ${bigMoney(span.from)} in ${span.fromLabel} and ` +
      `${bigMoney(span.to)} in ${span.toLabel}. What was its compound annual growth rate over those ${span.years} years?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: cagrTolerance(answer, difficulty),
    method: cagrMethod(span, answer, bigMoney),
  };
};

const epsCagr = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const span = pickSpan(filedSpans(stock.epsHistory), difficulty);
  const answer = roundTo2(cagrOf(span.from, span.to, span.years));

  return {
    ...base("epsCagr", difficulty, stock),
    text:
      `${subject(stock)} earned ${money(span.from)} a share in ${span.fromLabel} and ` +
      `${money(span.to)} in ${span.toLabel}. What was the compound annual growth rate of its EPS over those ${span.years} years?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: cagrTolerance(answer, difficulty),
    method: cagrMethod(span, answer, money),
  };
};

const priceCagr = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const span = pickSpan(priceSpans(stock), difficulty);
  const answer = roundTo2(cagrOf(span.from, span.to, span.years));

  return {
    ...base("priceCagr", difficulty, stock),
    text:
      `${subject(stock)} closed at ${money(span.from)} on ${span.fromLabel} and trades at ` +
      `${money(span.to)} today. What is its compound annual price return over those ${span.years} years ` +
      `(excluding dividends)?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: cagrTolerance(answer, difficulty),
    method: cagrMethod(span, answer, money),
  };
};

// ---------------------------------------------------------------------------
// Dividends, valuation, profitability, growth
// ---------------------------------------------------------------------------

const dividendYield = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2((stock.dividendPerShare / stock.currentPrice) * 100);
  const onePercent = stock.currentPrice / 100;

  return {
    ...base("dividendYield", difficulty, stock),
    text: `${subject(stock)} trades at ${money(stock.currentPrice)} and pays ${money(stock.dividendPerShare)} a year in dividends. What is the dividend yield?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: POINT_TOLERANCE[difficulty],
    method: [
      `1% of the ${money(stock.currentPrice)} price is ${money(onePercent)}.`,
      `How many of those fit in ${money(stock.dividendPerShare)}?`,
      `${money(stock.dividendPerShare)} / ${money(onePercent)} = ${percent(answer)}.`,
    ],
  };
};

const dividendPerShare = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const yieldPct = roundTo2((stock.dividendPerShare / stock.currentPrice) * 100);
  const onePercent = stock.currentPrice / 100;
  const answer = roundTo2((yieldPct / 100) * stock.currentPrice);

  return {
    ...base("dividendPerShare", difficulty, stock),
    text: `${subject(stock)} trades at ${money(stock.currentPrice)} and yields ${percent(yieldPct)}. What is the annual dividend per share?`,
    correctAnswer: answer,
    answerUnit: "currency",
    tolerance: scaled(answer, DIVIDEND_TOLERANCE_FRACTION, difficulty, 0.01),
    method: [
      `1% of ${money(stock.currentPrice)} is ${money(onePercent)}.`,
      `${percent(yieldPct)} is ${money(onePercent)} x ${yieldPct}.`,
      `That comes to ${money(answer)} a share.`,
    ],
  };
};

const payoutRatio = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2((stock.dividendPerShare / stock.eps) * 100);

  return {
    ...base("payoutRatio", difficulty, stock),
    text: `${subject(stock)} earns ${money(stock.eps)} a share and pays ${money(stock.dividendPerShare)} of it out. What is the payout ratio?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: scaled(answer, WIDE_POINT_TOLERANCE_FRACTION, difficulty, 0.5),
    method: [
      `Payout ratio is dividend / earnings per share.`,
      `${money(stock.dividendPerShare)} / ${money(stock.eps)}.`,
      `= ${percent(answer)} of earnings handed to shareholders.`,
    ],
  };
};

const peRatio = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2(stock.currentPrice / stock.eps);

  return {
    ...base("peRatio", difficulty, stock),
    text: `${subject(stock)} trades at ${money(stock.currentPrice)} and earns ${money(stock.eps)} a share. What is its P/E ratio?`,
    correctAnswer: answer,
    answerUnit: "ratio",
    tolerance: scaled(answer, RATIO_TOLERANCE_FRACTION, difficulty, 0.2),
    method: [
      `P/E is price / earnings per share.`,
      `Bracket it: ${money(stock.eps)} x 10 = ${money(stock.eps * 10)}, x 20 = ${money(stock.eps * 20)}.`,
      `${money(stock.currentPrice)} lands at about ${ratio(answer)}.`,
    ],
  };
};

const earningsYield = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const pe = stock.currentPrice / stock.eps;
  const answer = roundTo2((stock.eps / stock.currentPrice) * 100);

  return {
    ...base("earningsYield", difficulty, stock),
    text: `${subject(stock)} trades at ${money(stock.currentPrice)} and earns ${money(stock.eps)} a share. What is its earnings yield?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: POINT_TOLERANCE[difficulty],
    method: [
      `Earnings yield is just the P/E turned upside down.`,
      `The P/E here is about ${ratio(pe)}.`,
      `100 / ${pe.toFixed(1)} = ${percent(answer)}.`,
    ],
  };
};

// Price, shares outstanding and market cap: two are given and the third is
// asked for. The share count is the one the company printed on the cover of
// its latest filing; the market cap is today's price times it. Each answer is
// worked from the figures as printed, so rounding them for the question never
// marks correct arithmetic wrong.
const marketCap = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const shares = stock.shares;
  if (!shares) throw new Error(`${stock.ticker} has no share count`);

  const price = stock.currentPrice;
  // As printed: shares to the nearest million (a tenth below a billion), the
  // cap to the nearest $0.1bn.
  const sharesShown =
    shares.millions >= 1000 ? Math.round(shares.millions) : Math.round(shares.millions * 10) / 10;
  const sharesText = millionShares(sharesShown);
  const capShown = Math.round(((price * sharesShown) / 1000) * 10) / 10;
  const asOf = `as of ${shortDate(shares.date)}`;
  // Working in millions reads the same for a $7bn company as a $4tn one.
  const capMillions = (capShown * 1000).toLocaleString("en-US", { maximumFractionDigits: 0 });

  switch (randomInt(0, 2)) {
    case 0: {
      const answer = roundTo2((price * sharesShown) / 1000);
      return {
        ...base("marketCap", difficulty, stock),
        text:
          `${subject(stock)} trades at ${money(price)} and has ${sharesText} outstanding (${asOf}). ` +
          `What is its market cap, in $bn?`,
        correctAnswer: answer,
        answerUnit: "billions",
        tolerance: scaled(answer, PRODUCT_TOLERANCE_FRACTION, difficulty, 0.1),
        method: [
          `Market cap is price x shares outstanding.`,
          `${money(price)} x ${sharesText} = $${(answer * 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}m.`,
          `Divide by 1,000 for billions: ${billions(answer)}.`,
        ],
      };
    }
    case 1: {
      const answer = roundTo2((capShown * 1000) / price);
      return {
        ...base("marketCap", difficulty, stock),
        text:
          `${subject(stock)} trades at ${money(price)} and has a market cap of ${billions(capShown)}. ` +
          `How many shares does it have outstanding, in millions?`,
        correctAnswer: answer,
        answerUnit: "millionShares",
        tolerance: scaled(answer, PRODUCT_TOLERANCE_FRACTION, difficulty, 0.1),
        method: [
          `Shares outstanding is market cap / price.`,
          `Work in millions: ${billions(capShown)} is $${capMillions}m.`,
          `$${capMillions}m / ${money(price)} = ${millionShares(answer)}. The filing (${asOf}) says ${sharesText}.`,
        ],
      };
    }
    default: {
      const answer = roundTo2((capShown * 1000) / sharesShown);
      return {
        ...base("marketCap", difficulty, stock),
        text:
          `${subject(stock)} has a market cap of ${billions(capShown)} and ${sharesText} outstanding (${asOf}). ` +
          `What is the share price?`,
        correctAnswer: answer,
        answerUnit: "currency",
        tolerance: scaled(answer, PRODUCT_TOLERANCE_FRACTION, difficulty, 0.02),
        method: [
          `Price is market cap / shares outstanding.`,
          `Work in millions: ${billions(capShown)} is $${capMillions}m.`,
          `$${capMillions}m / ${sharesText} = ${money(answer)} a share. It last traded at ${money(price)}.`,
        ],
      };
    }
  }
};

const operatingMargin = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2((stock.operatingProfit / stock.revenue) * 100);
  const tenPercent = stock.revenue / 10;

  return {
    ...base("operatingMargin", difficulty, stock),
    text: `${subject(stock)} made ${bigMoney(stock.operatingProfit)} of operating profit on ${bigMoney(stock.revenue)} of revenue. What is the operating margin?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: scaled(answer, WIDE_POINT_TOLERANCE_FRACTION, difficulty, 0.3),
    method: [
      `Margin is operating profit / revenue.`,
      `10% of ${bigMoney(stock.revenue)} is ${bigMoney(tenPercent)}.`,
      `${bigMoney(stock.operatingProfit)} is about ${percent(answer)} of revenue.`,
    ],
  };
};

const revenueGrowth = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2(revenueGrowthOf(stock));
  const growth = stock.revenue - stock.priorRevenue;
  const onePercent = stock.priorRevenue / 100;

  return {
    ...base("revenueGrowth", difficulty, stock),
    text:
      `${subject(stock)} reported revenue of ${bigMoney(stock.priorRevenue)} in ` +
      `${fiscalLabel(stock.priorRevenueFiscalYear)} and ${bigMoney(stock.revenue)} in ` +
      `${fiscalLabel(stock.fiscalYear)}. What was the growth rate?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: horizonTolerance(answer, difficulty),
    method: [
      `Revenue moved by ${bigMoney(stock.revenue)} - ${bigMoney(stock.priorRevenue)} = ${bigMoney(growth)}.`,
      `1% of the ${bigMoney(stock.priorRevenue)} base is ${bigMoney(onePercent)}.`,
      `${bigMoney(Math.abs(growth))} / ${bigMoney(onePercent)} = ${percent(answer)}.`,
    ],
  };
};

const epsGrowth = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const answer = roundTo2(epsGrowthOf(stock));
  const growth = stock.eps - stock.priorEps;
  const onePercent = stock.priorEps / 100;

  return {
    ...base("epsGrowth", difficulty, stock),
    text:
      `${subject(stock)} earned ${money(stock.priorEps)} a share in ` +
      `${fiscalLabel(stock.priorEpsFiscalYear)} and ${money(stock.eps)} in ` +
      `${fiscalLabel(stock.fiscalYear)}. How much did earnings per share grow?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: horizonTolerance(answer, difficulty),
    method: [
      `EPS moved by ${money(stock.eps)} - ${money(stock.priorEps)} = ${money(growth)}.`,
      `1% of the ${money(stock.priorEps)} base is ${money(onePercent)}.`,
      `${money(Math.abs(growth))} / ${money(onePercent)} = ${percent(answer)}.`,
    ],
  };
};

// EPS growth run forwards: the company's real growth rate, applied to the year
// before. As with priceFromMove, the answer follows from the rate as printed.
const epsFromGrowth = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const growth = Number(epsGrowthOf(stock).toFixed(1));
  const onePercent = stock.priorEps / 100;
  const change = stock.priorEps * (growth / 100);
  const answer = roundTo2(stock.priorEps + change);
  const year = fiscalLabel(stock.fiscalYear);

  return {
    ...base("epsFromGrowth", difficulty, stock),
    text:
      `${subject(stock)} earned ${money(stock.priorEps)} a share in ${fiscalLabel(stock.priorEpsFiscalYear)}. ` +
      `In ${year} its EPS ${growth >= 0 ? "grew" : "fell"} ${percent(Math.abs(growth), 1)}. ` +
      `What did it earn per share in ${year}?`,
    correctAnswer: answer,
    answerUnit: "currency",
    tolerance: scaled(answer, PRICE_TOLERANCE_FRACTION, difficulty, 0.01),
    method: [
      `1% of ${money(stock.priorEps)} is ${money(onePercent)}.`,
      `${percent(Math.abs(growth), 1)} is ${money(onePercent)} x ${Math.abs(growth)} = ${money(Math.abs(change))}.`,
      `${money(stock.priorEps)} ${growth >= 0 ? "+" : "-"} ${money(Math.abs(change))} = ${money(answer)}. It reported ${money(stock.eps)}.`,
    ],
  };
};

const GENERATORS: Record<
  QuestionType,
  (stock: StockData, difficulty: DifficultyLevel) => Question
> = {
  percentageChange,
  monthChange,
  yearChange,
  priceFromMove,
  recoveryGain,
  priceCagr,
  dividendYield,
  dividendPerShare,
  payoutRatio,
  peRatio,
  earningsYield,
  marketCap,
  operatingMargin,
  revenueGrowth,
  epsGrowth,
  epsFromGrowth,
  revenueCagr,
  epsCagr,
};

const noDataQuestion = (difficulty: DifficultyLevel): Question => ({
  ...base("peRatio", difficulty, null),
  text: "Stock data could not be loaded.",
  correctAnswer: 0,
  answerUnit: "ratio",
  tolerance: 1,
  method: ["Run `npm run refresh:universe` and `npm run refresh:prices`, then rebuild."],
});

export const generateQuestion = (
  type?: QuestionType,
  difficulty: DifficultyLevel = "easy"
): Question => {
  const usable = availableTypes();
  if (usable.length === 0) return noDataQuestion(difficulty);

  // Fall back to a type that actually has stock behind it.
  const chosen = type && ELIGIBLE[type].length > 0 ? type : pickFrom(usable);
  const pool = preferSimple(ELIGIBLE[chosen], difficulty);

  return GENERATORS[chosen](pickFrom(pool), difficulty);
};

// Check whether the answer is close enough. The tolerance is absolute and
// already in the answer's units.
//
// The sign is not marked: 4.2 and -4.2 both answer a move of -4.2%. Both
// prices are on screen, so which way it went is never the hard part, and a
// phone's numeric keypad often has no minus key at all.
export const checkAnswer = (question: Question, userAnswer: number): boolean =>
  Math.abs(Math.abs(userAnswer) - Math.abs(question.correctAnswer)) <= question.tolerance;

// The order a run asks its types in. Each pass through the requested types is
// shuffled, so a run cycles rather than repeating one type, and each type
// joins a pass with probability equal to its weight - so a type weighted 0.3
// turns up about a third as often as the rest. A pass that draws nothing (only
// down-weighted types were requested) takes them all, since the player asked
// for them.
export const runOrder = (
  types: readonly QuestionType[],
  count: number,
  random: () => number = Math.random
): QuestionType[] => {
  const order: QuestionType[] = [];
  if (types.length === 0) return order;

  while (order.length < count) {
    const drawn = types.filter(type => random() < (QUESTION_META[type].weight ?? 1));
    const pass = drawn.length > 0 ? [...drawn] : [...types];
    for (let i = pass.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pass[i], pass[j]] = [pass[j], pass[i]];
    }
    order.push(...pass);
  }

  return order.slice(0, count);
};

// Build a set, cycling through the requested types so a run stays varied.
export const generateQuestions = (
  count: number,
  difficulty?: DifficultyLevel,
  types: QuestionType[] = ALL_QUESTION_TYPES
): Question[] => {
  const usable = types.filter(t => ELIGIBLE[t].length > 0);
  const pool = usable.length > 0 ? usable : availableTypes();
  const questions: Question[] = [];

  for (let i = 0; i < count; i++) {
    const type = pool[i % pool.length];
    const level: DifficultyLevel =
      difficulty ?? (i < count / 3 ? "easy" : i < (2 * count) / 3 ? "medium" : "hard");
    questions.push(generateQuestion(type, level));
  }

  return questions;
};
