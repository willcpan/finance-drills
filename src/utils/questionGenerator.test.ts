import { describe, it, expect } from "vitest";
import {
  ALL_QUESTION_TYPES,
  QUESTION_META,
  availableTypes,
  checkAnswer,
  eligibleCount,
  generateQuestion,
  generateQuestions,
  type AnswerUnit,
  type DifficultyLevel,
  type QuestionType,
} from "./questionGenerator";
import { SENSIBLE, priceMoveOf, pricesAsOf, stocks, within } from "./stockData";
import { money, shortDate } from "./format";

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];

// The stock data is injected by the build - Stockdata.csv for fundamentals,
// data/prices.json for prices - so these run against the real companies and
// the real market prices rather than a fixture. The merge itself is tested in
// buildStockData.test.ts.
describe("stock data", () => {
  it("loads rows from the CSV", () => {
    // 186 unique tickers in the CSV, minus those with no live quote.
    expect(stocks.length).toBeGreaterThan(150);
  });

  it("drops rows that did not parse", () => {
    for (const stock of stocks) {
      expect(Number.isFinite(stock.currentPrice)).toBe(true);
      expect(Number.isFinite(stock.eps)).toBe(true);
      expect(Number.isFinite(stock.revenue)).toBe(true);
      expect(Number.isFinite(stock.operatingProfit)).toBe(true);
      expect(Number.isFinite(stock.dividendPerShare)).toBe(true);
      expect(stock.ticker.length).toBeGreaterThan(0);
    }
  });

  it("carries a real prior close for every row", () => {
    // The prior close used to be invented from a hash of the ticker, within a
    // fixed +/-2% of the price, so Percentage Change drilled a made-up move.
    // It is now the close Yahoo reported, and every row must have one.
    expect(stocks.filter(s => s.previousClose > 0).length).toBe(stocks.length);
  });

  it("holds prices that moved by a plausible amount", () => {
    // Real moves are whatever the market did, so there is no tight band to
    // assert - but a 50% day means a split or a bad parse, not a trading day.
    for (const stock of stocks) {
      const move = Math.abs(stock.currentPrice - stock.previousClose) / stock.previousClose;
      expect(move).toBeLessThan(0.5);
    }
  });

  it("dates the prices it was built with", () => {
    expect(pricesAsOf).not.toBeNull();
    expect(Number.isNaN(Date.parse(pricesAsOf as string))).toBe(false);
  });
});

describe("question generation", () => {
  it("has a usable pool for every question type", () => {
    for (const type of ALL_QUESTION_TYPES) {
      expect(eligibleCount(type)).toBeGreaterThan(0);
    }
    expect(availableTypes().length).toBe(ALL_QUESTION_TYPES.length);
  });

  it("produces a well-formed question for every type and difficulty", () => {
    for (const type of ALL_QUESTION_TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const q = generateQuestion(type, difficulty);
        expect(q.type).toBe(type);
        expect(q.difficulty).toBe(difficulty);
        expect(q.category).toBe(QUESTION_META[type].category);
        expect(Number.isFinite(q.correctAnswer)).toBe(true);
        expect(q.tolerance).toBeGreaterThan(0);
        expect(q.text.length).toBeGreaterThan(10);
        expect(q.method.length).toBeGreaterThan(0);
      }
    }
  });

  it("tags each question with the unit its answer is in", () => {
    const expected: Record<QuestionType, AnswerUnit> = {
      priceIncrease: "currency",
      priceDecrease: "currency",
      percentageChange: "percentagePoints",
      monthChange: "percentagePoints",
      yearChange: "percentagePoints",
      recoveryGain: "percentagePoints",
      dividendYield: "percentagePoints",
      dividendPerShare: "currency",
      payoutRatio: "percentagePoints",
      peRatio: "ratio",
      earningsYield: "percentagePoints",
      operatingMargin: "percentagePoints",
      ruleOf72: "years",
    };

    for (const type of ALL_QUESTION_TYPES) {
      expect(generateQuestion(type, "easy").answerUnit).toBe(expected[type]);
    }
  });

  it("asks for the thing its type is named after", () => {
    expect(generateQuestion("dividendYield", "easy").text).toMatch(/dividend yield/i);
    expect(generateQuestion("dividendPerShare", "easy").text).toMatch(/dividend per share/i);
    expect(generateQuestion("peRatio", "easy").text).toMatch(/P\/E/);
    expect(generateQuestion("earningsYield", "easy").text).toMatch(/earnings yield/i);
    expect(generateQuestion("operatingMargin", "easy").text).toMatch(/operating margin/i);
    expect(generateQuestion("payoutRatio", "easy").text).toMatch(/payout ratio/i);
  });

  it("prints both prices and the session the older one came from", () => {
    for (const type of ["monthChange", "yearChange"] as QuestionType[]) {
      for (let i = 0; i < 50; i++) {
        const q = generateQuestion(type, "medium");
        const past = type === "monthChange" ? q.stockData?.monthAgo : q.stockData?.yearAgo;

        expect(past).toBeTruthy();
        // Both numbers the player needs are on screen, and the answer is the
        // exact move between them.
        expect(q.text).toContain(money(past?.price as number));
        expect(q.text).toContain(money(q.stockData?.currentPrice as number));
        expect(q.text).toContain(shortDate(past?.date as string));
        expect(q.correctAnswer).toBeCloseTo(
          priceMoveOf(past?.price as number, q.stockData?.currentPrice as number),
          1
        );
      }
    }
  });

  it("scales the tolerance on a long horizon but never below the flat one", () => {
    // A year can move a stock by several hundred points, where the flat
    // day-move tolerance would demand four significant figures.
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion("yearChange", "hard");
      expect(q.tolerance).toBeGreaterThanOrEqual(0.05);
      expect(q.tolerance).toBeLessThanOrEqual(Math.max(0.05, Math.abs(q.correctAnswer) * 0.015));
    }
  });

  it("drills the day move against yesterday's close, not a week ago", () => {
    // meta.chartPreviousClose holds the close before the *requested range*, so
    // reading it off a 5-day fetch quietly made this a 6-session move.
    for (let i = 0; i < 50; i++) {
      const q = generateQuestion("percentageChange", "medium");
      const stock = q.stockData as NonNullable<typeof q.stockData>;
      expect(q.correctAnswer).toBeCloseTo(priceMoveOf(stock.previousClose, stock.currentPrice), 1);
      // A single session rarely moves a large listing more than a fifth.
      expect(Math.abs(q.correctAnswer)).toBeLessThan(25);
    }
  });

  it("names the company and the ticker in every question about a company", () => {
    for (const type of ALL_QUESTION_TYPES) {
      // Rule of 72 is pure arithmetic. It still carries a stock row - the
      // generator takes one and ignores it - so it has to be skipped by type.
      if (type === "ruleOf72") continue;

      const q = generateQuestion(type, "easy");
      const stock = q.stockData;
      expect(stock).toBeTruthy();
      if (!stock) continue;

      expect(stock.name.length).toBeGreaterThan(0);
      expect(q.text).toContain(stock.ticker);
      expect(q.text).toContain(stock.name);
    }

    // Names come from the quotes, so nearly every row should have a real one
    // rather than falling back to its ticker.
    const named = stocks.filter(s => s.name !== s.ticker);
    expect(named.length).toBeGreaterThan(stocks.length * 0.9);
  });

  it("never asks a question whose answer is absurd", () => {
    // One company in the dataset earns about a cent a share, giving a P/E of
    // 12,150 and a payout ratio of 30,000%. Arithmetically valid, useless to
    // drill, and it must never be selected.
    for (let i = 0; i < 150; i++) {
      expect(within(generateQuestion("peRatio", "medium").correctAnswer, SENSIBLE.peRatio)).toBe(true);
      expect(
        within(generateQuestion("payoutRatio", "medium").correctAnswer, SENSIBLE.payoutRatio)
      ).toBe(true);
      expect(
        within(generateQuestion("dividendYield", "medium").correctAnswer, SENSIBLE.dividendYield)
      ).toBe(true);
      expect(
        within(
          generateQuestion("operatingMargin", "medium").correctAnswer,
          SENSIBLE.operatingMargin
        )
      ).toBe(true);
      expect(
        within(generateQuestion("earningsYield", "medium").correctAnswer, SENSIBLE.earningsYield)
      ).toBe(true);
    }
  });

  it("only asks dividend questions about companies that pay one", () => {
    for (let i = 0; i < 200; i++) {
      for (const type of ["dividendYield", "dividendPerShare", "payoutRatio"] as QuestionType[]) {
        const stock = generateQuestion(type, "easy").stockData;
        expect(stock?.dividendPerShare).toBeGreaterThan(0);
      }
    }
  });

  it("only asks valuation questions about companies that earn money", () => {
    for (let i = 0; i < 200; i++) {
      for (const type of ["peRatio", "earningsYield"] as QuestionType[]) {
        expect(generateQuestion(type, "easy").stockData?.eps).toBeGreaterThan(0);
      }
    }
  });

  it("restricts a generated set to the requested types", () => {
    const wanted: QuestionType[] = ["peRatio", "ruleOf72"];
    const questions = generateQuestions(12, "medium", wanted);
    expect(questions).toHaveLength(12);
    for (const q of questions) {
      expect(wanted).toContain(q.type);
    }
  });

  it("spreads difficulty across a set when none is given", () => {
    const questions = generateQuestions(9);
    expect(new Set(questions.map(q => q.difficulty)).size).toBeGreaterThan(1);
  });
});

describe("checkAnswer", () => {
  it("accepts the exact answer for every type and difficulty", () => {
    // The original tolerance scaled by the answer, so it went negative whenever
    // the answer did and no answer at all could satisfy it.
    for (let i = 0; i < 80; i++) {
      for (const type of ALL_QUESTION_TYPES) {
        for (const difficulty of DIFFICULTIES) {
          const q = generateQuestion(type, difficulty);
          expect(checkAnswer(q, q.correctAnswer)).toBe(true);
        }
      }
    }
  });

  it("accepts exact answers that are negative", () => {
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 50; i++) {
      const q = generateQuestion("percentageChange", "easy");
      if (q.correctAnswer < 0) {
        expect(checkAnswer(q, q.correctAnswer)).toBe(true);
        seen++;
      }
    }
    // Guard against passing vacuously because no negative answer came up.
    expect(seen).toBeGreaterThan(0);
  });

  it("accepts just inside the tolerance and rejects just outside", () => {
    for (const type of ALL_QUESTION_TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const q = generateQuestion(type, difficulty);
        expect(checkAnswer(q, q.correctAnswer + q.tolerance * 0.99)).toBe(true);
        expect(checkAnswer(q, q.correctAnswer - q.tolerance * 0.99)).toBe(true);
        expect(checkAnswer(q, q.correctAnswer + q.tolerance * 1.01 + 1e-9)).toBe(false);
      }
    }
  });

  it("does not accept the price already shown in a price-move question", () => {
    // The old margin was 10% of the answer while the move itself was only
    // 5-10%, so retyping the number on screen scored every time.
    for (let i = 0; i < 200; i++) {
      for (const type of ["priceIncrease", "priceDecrease"] as QuestionType[]) {
        for (const difficulty of DIFFICULTIES) {
          const q = generateQuestion(type, difficulty);
          const shown = q.stockData?.currentPrice ?? 0;
          expect(checkAnswer(q, shown)).toBe(false);
        }
      }
    }
  });

  it("tightens tolerance as difficulty rises", () => {
    // Compared as medians over many draws, not one question against another:
    // each difficulty draws its own stock (and for some types its own
    // percentage), and tolerances have an absolute floor so a small answer
    // reads as proportionally generous. A single unlucky pair proves nothing.
    const medianRelativeTolerance = (type: QuestionType, difficulty: DifficultyLevel): number => {
      const values = Array.from({ length: 60 }, () => {
        const q = generateQuestion(type, difficulty);
        return q.tolerance / Math.max(Math.abs(q.correctAnswer), 1);
      }).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    };

    for (const type of ALL_QUESTION_TYPES) {
      expect(medianRelativeTolerance(type, "hard")).toBeLessThan(
        medianRelativeTolerance(type, "easy")
      );
    }
  });

  it("gets the recovery-gain arithmetic right", () => {
    // A 50% fall always needs a 100% gain to undo. Worth pinning exactly.
    for (let i = 0; i < 300; i++) {
      const q = generateQuestion("recoveryGain", "medium");
      const drop = Number(/falls (\d+(?:\.\d+)?)%/.exec(q.text)?.[1]);
      expect(Number.isFinite(drop)).toBe(true);
      expect(q.correctAnswer).toBeCloseTo((drop / (100 - drop)) * 100, 1);
      // Recovering always costs more than the fall.
      expect(q.correctAnswer).toBeGreaterThan(drop);
    }
  });

  it("gets the rule-of-72 arithmetic right", () => {
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion("ruleOf72", "easy");
      const rate = Number(/at (\d+(?:\.\d+)?)% a year/.exec(q.text)?.[1]);
      expect(q.correctAnswer).toBeCloseTo(72 / rate, 2);
    }
  });
});
