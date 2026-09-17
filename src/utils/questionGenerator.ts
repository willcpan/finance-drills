import {
  type StockData,
  stocks,
  randomInt,
  pickFrom,
  roundTo2,
  SENSIBLE,
  within,
  priceMoveOf,
  usablePast,
  type PastClose,
  peRatioOf,
  earningsYieldOf,
  operatingMarginOf,
  payoutRatioOf,
} from "./stockData";
import { money, percent, ratio, shortDate, years as formatYears, bigMoney } from "./format";

export type QuestionType =
  | "priceIncrease"
  | "priceDecrease"
  | "percentageChange"
  | "monthChange"
  | "yearChange"
  | "recoveryGain"
  | "dividendYield"
  | "dividendPerShare"
  | "payoutRatio"
  | "peRatio"
  | "earningsYield"
  | "operatingMargin"
  | "ruleOf72";

export type QuestionCategory =
  | "priceMoves"
  | "dividends"
  | "valuation"
  | "profitability"
  | "growth";

export type DifficultyLevel = "easy" | "medium" | "hard";

// What unit the answer is in. Drives tolerance, the input affordances and how
// the answer is rendered back to the player.
export type AnswerUnit = "currency" | "percentagePoints" | "ratio" | "years";

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

export const QUESTION_META: Record<
  QuestionType,
  { label: string; category: QuestionCategory; blurb: string }
> = {
  priceIncrease: {
    label: "Price Increase",
    category: "priceMoves",
    blurb: "Apply a percentage gain to a share price",
  },
  priceDecrease: {
    label: "Price Decrease",
    category: "priceMoves",
    blurb: "Apply a percentage fall to a share price",
  },
  percentageChange: {
    label: "Percentage Change",
    category: "priceMoves",
    blurb: "Turn yesterday's close and today's price into a move",
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
  recoveryGain: {
    label: "Recovery Gain",
    category: "priceMoves",
    blurb: "What gain undoes a given fall",
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
  operatingMargin: {
    label: "Operating Margin",
    category: "profitability",
    blurb: "Operating profit as a share of revenue",
  },
  ruleOf72: {
    label: "Rule of 72",
    category: "growth",
    blurb: "How long a compounding figure takes to double",
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
// ---------------------------------------------------------------------------

const PRICE_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.01,
  medium: 0.005,
  hard: 0.0025,
};

const POINT_TOLERANCE: Record<DifficultyLevel, number> = {
  easy: 0.25,
  medium: 0.15,
  hard: 0.05,
};

// Margins and payout ratios run to tens of points, so a flat quarter-point is
// unreasonably strict. These scale, with a floor.
const WIDE_POINT_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.04,
  medium: 0.025,
  hard: 0.015,
};

const DIVIDEND_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.05,
  medium: 0.03,
  hard: 0.015,
};

const RATIO_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.08,
  medium: 0.05,
  hard: 0.03,
};

const YEARS_TOLERANCE: Record<DifficultyLevel, number> = {
  easy: 0.6,
  medium: 0.35,
  hard: 0.2,
};

const scaled = (
  answer: number,
  table: Record<DifficultyLevel, number>,
  difficulty: DifficultyLevel,
  floor: number
): number => Math.max(floor, Math.abs(answer) * table[difficulty]);

// ---------------------------------------------------------------------------
// Eligible stocks per question type
//
// Built once at module load. A question type only draws from rows where its
// answer lands inside a band worth drilling - see SENSIBLE in stockData.ts.
// ---------------------------------------------------------------------------

const hasUsablePrice = (s: StockData) => within(s.currentPrice, SENSIBLE.price);

const ELIGIBLE: Record<QuestionType, StockData[]> = {
  priceIncrease: stocks.filter(hasUsablePrice),
  priceDecrease: stocks.filter(hasUsablePrice),
  percentageChange: stocks.filter(s => hasUsablePrice(s) && s.previousClose > 0),
  // Both prices a longer-horizon question prints have to be workable numbers,
  // so the past close passes the same band as the current price. The move
  // itself is left alone: a stock that tripled in a year is the interesting
  // case, not a broken one.
  monthChange: stocks.filter(s => hasUsablePrice(s) && usablePast(s.monthAgo)),
  yearChange: stocks.filter(s => hasUsablePrice(s) && usablePast(s.yearAgo)),
  recoveryGain: stocks.filter(hasUsablePrice),
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
  operatingMargin: stocks.filter(
    s => s.revenue > 0 && within(operatingMarginOf(s), SENSIBLE.operatingMargin)
  ),
  // Purely arithmetic - no company needed.
  ruleOf72: stocks,
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

const movePercent = (difficulty: DifficultyLevel): number => {
  switch (difficulty) {
    case "easy":
      return randomInt(5, 10);
    case "medium":
      return randomInt(12, 25);
    case "hard":
      return randomInt(9, 37) / 2; // half-point moves
    default:
      return 10;
  }
};

const priceIncrease = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const pct = movePercent(difficulty);
  const onePercent = stock.currentPrice / 100;
  const rise = stock.currentPrice * (pct / 100);
  const answer = roundTo2(stock.currentPrice + rise);

  return {
    ...base("priceIncrease", difficulty, stock),
    text: `${subject(stock)} trades at ${money(stock.currentPrice)}. If it rises ${pct}%, what is the new price?`,
    correctAnswer: answer,
    answerUnit: "currency",
    tolerance: scaled(stock.currentPrice, PRICE_TOLERANCE_FRACTION, difficulty, 0.02),
    method: [
      `1% of ${money(stock.currentPrice)} is ${money(onePercent)}.`,
      `${pct}% is ${money(onePercent)} x ${pct} = ${money(rise)}.`,
      `${money(stock.currentPrice)} + ${money(rise)} = ${money(answer)}.`,
    ],
  };
};

const priceDecrease = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const pct = movePercent(difficulty);
  const onePercent = stock.currentPrice / 100;
  const fall = stock.currentPrice * (pct / 100);
  const answer = roundTo2(stock.currentPrice - fall);

  return {
    ...base("priceDecrease", difficulty, stock),
    text: `${subject(stock)} trades at ${money(stock.currentPrice)}. If it falls ${pct}%, what is the new price?`,
    correctAnswer: answer,
    answerUnit: "currency",
    tolerance: scaled(stock.currentPrice, PRICE_TOLERANCE_FRACTION, difficulty, 0.02),
    method: [
      `1% of ${money(stock.currentPrice)} is ${money(onePercent)}.`,
      `${pct}% is ${money(onePercent)} x ${pct} = ${money(fall)}.`,
      `${money(stock.currentPrice)} - ${money(fall)} = ${money(answer)}.`,
    ],
  };
};

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
// 0.05pp on a 509% answer asks for four significant figures. These scale with
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

const recoveryGain = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const drop = difficulty === "easy" ? randomInt(1, 5) * 10 : randomInt(5, 60);
  const remaining = 100 - drop;
  const answer = roundTo2((drop / remaining) * 100);

  return {
    ...base("recoveryGain", difficulty, stock),
    text: `${subject(stock)} falls ${drop}%. What percentage gain would take it back to where it started?`,
    correctAnswer: answer,
    answerUnit: "percentagePoints",
    tolerance: scaled(answer, WIDE_POINT_TOLERANCE_FRACTION, difficulty, 0.3),
    method: [
      `A ${drop}% fall leaves ${remaining} of every 100.`,
      `Getting ${remaining} back to 100 means adding ${drop}.`,
      `${drop} / ${remaining} = ${percent(answer)} - always more than the fall.`,
    ],
  };
};

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

const RULE_OF_72_RATES: Record<DifficultyLevel, number[]> = {
  easy: [6, 8, 9, 12],
  medium: [4, 5, 10, 15, 18],
  hard: [7, 11, 13, 14, 16],
};

const ruleOf72 = (stock: StockData | null, difficulty: DifficultyLevel): Question => {
  const rate = pickFrom(RULE_OF_72_RATES[difficulty]);
  const answer = roundTo2(72 / rate);

  return {
    ...base("ruleOf72", difficulty, stock),
    text: `A holding compounds at ${rate}% a year. Roughly how long until it doubles?`,
    correctAnswer: answer,
    answerUnit: "years",
    tolerance: YEARS_TOLERANCE[difficulty],
    method: [
      `Rule of 72: divide 72 by the growth rate.`,
      `72 / ${rate}.`,
      `About ${formatYears(answer)}.`,
    ],
  };
};

const GENERATORS: Record<
  QuestionType,
  (stock: StockData, difficulty: DifficultyLevel) => Question
> = {
  priceIncrease,
  priceDecrease,
  percentageChange,
  monthChange,
  yearChange,
  recoveryGain,
  dividendYield,
  dividendPerShare,
  payoutRatio,
  peRatio,
  earningsYield,
  operatingMargin,
  ruleOf72: (stock, difficulty) => ruleOf72(stock, difficulty),
};

const noDataQuestion = (difficulty: DifficultyLevel): Question => ({
  ...base("priceIncrease", difficulty, null),
  text: "Stock data could not be loaded.",
  correctAnswer: 0,
  answerUnit: "currency",
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
// already in the answer's units, so this stays a straight comparison.
export const checkAnswer = (question: Question, userAnswer: number): boolean =>
  Math.abs(userAnswer - question.correctAnswer) <= question.tolerance;

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
