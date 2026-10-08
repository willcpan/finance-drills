import { describe, it, expect } from "vitest";
import {
  ALL_QUESTION_TYPES,
  QUESTION_META,
  runOrder,
  availableTypes,
  checkAnswer,
  eligibleCount,
  generateQuestion,
  generateQuestions,
  type AnswerUnit,
  type DifficultyLevel,
  type QuestionType,
} from "./questionGenerator";
import { SENSIBLE, cagrOf, priceMoveOf, pricesAsOf, stocks, within } from "./stockData";
import { money, shortDate } from "./format";

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];

// The stock data is injected by the build - data/universe.json for the index
// and its reported figures, data/prices.json for prices - so these run against
// the real S&P 500 and real market prices rather than a fixture. The join
// itself is tested in buildStockData.test.ts.
describe("stock data", () => {
  it("loads the index", () => {
    // Around 500 members, minus any the quote endpoint could not price.
    expect(stocks.length).toBeGreaterThan(450);
  });

  it("gives every company the things a question always prints", () => {
    for (const stock of stocks) {
      expect(stock.ticker.length).toBeGreaterThan(0);
      expect(stock.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(stock.currentPrice)).toBe(true);
      expect(stock.currentPrice).toBeGreaterThan(0);
      expect(Number.isFinite(stock.previousClose)).toBe(true);
      // Zero for a company that pays none, never NaN.
      expect(Number.isFinite(stock.dividendPerShare)).toBe(true);
    }
  });

  it("leaves a figure the company never reported as NaN", () => {
    // Financials and REITs largely do not report operating income, so this is
    // an accounting fact rather than a parse failure. Zero would be a claim,
    // and would put a 0% margin question into the drill.
    const finite = (pick: (s: (typeof stocks)[number]) => number) =>
      stocks.filter(s => Number.isFinite(pick(s))).length;

    // Most of the index reports revenue and EPS; operating income is patchier.
    expect(finite(s => s.eps)).toBeGreaterThan(stocks.length * 0.9);
    expect(finite(s => s.revenue)).toBeGreaterThan(stocks.length * 0.9);
    expect(finite(s => s.operatingProfit)).toBeGreaterThan(stocks.length * 0.7);

    // Whatever is missing must be NaN rather than a number standing in for it.
    for (const stock of stocks) {
      for (const value of [stock.eps, stock.revenue, stock.operatingProfit]) {
        expect(Number.isFinite(value) || Number.isNaN(value)).toBe(true);
      }
    }
  });

  it("says which fiscal year the reported figures came from", () => {
    const dated = stocks.filter(s => Number.isFinite(s.eps) && s.fiscalYear);
    const withEps = stocks.filter(s => Number.isFinite(s.eps));
    expect(dated.length).toBe(withEps.length);
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
    // Market cap asks for whichever of its three figures is missing, so its
    // unit depends on the variant drawn.
    const expected: Record<Exclude<QuestionType, "marketCap">, AnswerUnit> = {
      percentageChange: "percentagePoints",
      monthChange: "percentagePoints",
      yearChange: "percentagePoints",
      priceFromMove: "currency",
      recoveryGain: "percentagePoints",
      priceCagr: "percentagePoints",
      dividendYield: "percentagePoints",
      dividendPerShare: "currency",
      payoutRatio: "percentagePoints",
      peRatio: "ratio",
      earningsYield: "percentagePoints",
      operatingMargin: "percentagePoints",
      revenueGrowth: "percentagePoints",
      epsGrowth: "percentagePoints",
      epsFromGrowth: "currency",
      revenueCagr: "percentagePoints",
      epsCagr: "percentagePoints",
    };

    for (const type of ALL_QUESTION_TYPES) {
      if (type === "marketCap") continue;
      expect(generateQuestion(type, "easy").answerUnit).toBe(expected[type]);
    }

    const capUnits = new Set(
      Array.from({ length: 60 }, () => generateQuestion("marketCap", "easy").answerUnit)
    );
    expect([...capUnits].sort()).toEqual(["billions", "currency", "millionShares"]);
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
      expect(q.tolerance).toBeGreaterThanOrEqual(0.1);
      expect(q.tolerance).toBeLessThanOrEqual(Math.max(0.1, Math.abs(q.correctAnswer) * 0.025));
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
    // Every type now names a company, including the growth ones: there is no
    // longer a question about an anonymous "holding".
    for (const type of ALL_QUESTION_TYPES) {
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
    const wanted: QuestionType[] = ["peRatio", "revenueCagr"];
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
    // Judged on magnitude, so "outside" is measured away from zero.
    for (const type of ALL_QUESTION_TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const q = generateQuestion(type, difficulty);
        const size = Math.abs(q.correctAnswer);
        expect(checkAnswer(q, size + q.tolerance * 0.99)).toBe(true);
        expect(checkAnswer(q, size - q.tolerance * 0.99)).toBe(true);
        expect(checkAnswer(q, size + q.tolerance * 1.01 + 1e-9)).toBe(false);
      }
    }
  });

  it("ignores the sign, so a phone keypad with no minus key can answer a fall", () => {
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 50; i++) {
      const q = generateQuestion("yearChange", "medium");
      if (q.correctAnswer < -1) {
        expect(checkAnswer(q, Math.abs(q.correctAnswer))).toBe(true);
        expect(checkAnswer(q, q.correctAnswer)).toBe(true);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("does not accept the starting figure in a question that applies a move", () => {
    // The old margin was 10% of the answer while the move itself was only
    // 5-10%, so retyping the number on screen scored every time. A real move
    // can be tiny, so these only draw moves of 5% or more.
    for (let i = 0; i < 200; i++) {
      for (const difficulty of DIFFICULTIES) {
        const move = generateQuestion("priceFromMove", difficulty);
        const start = Number(/closed at \$([\d,]+\.\d{2})/.exec(move.text)?.[1].replace(/,/g, ""));
        expect(Number.isFinite(start)).toBe(true);
        expect(checkAnswer(move, start)).toBe(false);

        const eps = generateQuestion("epsFromGrowth", difficulty);
        expect(checkAnswer(eps, eps.stockData?.priorEps as number)).toBe(false);
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

  it("asks the recovery question about a stock that really fell", () => {
    // It used to be a round-number fall applied to nobody in particular. Now
    // the fall is the stock's own over the year, from the close it fell from.
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion("recoveryGain", "medium");
      const stock = q.stockData as NonNullable<typeof q.stockData>;
      const from = stock.yearAgo?.price as number;

      expect(stock.currentPrice).toBeLessThan(from * 0.9);
      expect(q.text).toContain(money(from));
      expect(q.text).toContain(money(stock.currentPrice));
      expect(q.correctAnswer).toBeCloseTo(priceMoveOf(stock.currentPrice, from), 1);
      // Recovering always costs more than the fall.
      expect(q.correctAnswer).toBeGreaterThan(-priceMoveOf(from, stock.currentPrice));
    }
  });

  it("applies a real move and lands where the stock actually trades", () => {
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion("priceFromMove", "medium");
      const stock = q.stockData as NonNullable<typeof q.stockData>;
      // The move is printed to a tenth of a point, so the answer can sit a
      // hair off the real price - never by more than that rounding, which is
      // half a tenth of a percent of the price it started from.
      const start = Number(/closed at \$([\d,]+\.\d{2})/.exec(q.text)?.[1].replace(/,/g, ""));
      expect(Math.abs(q.correctAnswer - stock.currentPrice)).toBeLessThanOrEqual(start * 0.0005 + 0.01);
      expect(q.text).toMatch(/(risen|fallen) \d+\.\d%/);
    }
  });

  it("applies real EPS growth and lands on what the company reported", () => {
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion("epsFromGrowth", "medium");
      const stock = q.stockData as NonNullable<typeof q.stockData>;
      expect(Math.abs(q.correctAnswer - stock.eps)).toBeLessThanOrEqual(stock.priorEps * 0.0005 + 0.01);
      expect(q.text).toContain(money(stock.priorEps));
    }
  });

  it("builds market-cap questions that agree with price x shares", () => {
    for (let i = 0; i < 300; i++) {
      const q = generateQuestion("marketCap", "medium");
      const stock = q.stockData as NonNullable<typeof q.stockData>;
      const shares = stock.shares as NonNullable<typeof stock.shares>;
      const cap = (stock.currentPrice * shares.millions) / 1000;

      // Every variant's answer is the real figure, up to the rounding of what
      // the question prints.
      const truth =
        q.answerUnit === "billions" ? cap : q.answerUnit === "millionShares" ? shares.millions : stock.currentPrice;
      // A $7bn cap printed to $0.1bn is up to 0.7% off, and the share count
      // worked back from it with it.
      expect(Math.abs(q.correctAnswer / truth - 1)).toBeLessThan(0.01);
      // Within the bounds of a real index member.
      expect(within(cap, SENSIBLE.marketCap)).toBe(true);
      if (q.answerUnit !== "billions") {
        const printed = Number(/\$([\d,]+\.\d)bn/.exec(q.text)?.[1].replace(/,/g, ""));
        expect(Math.abs(printed - cap)).toBeLessThan(Math.max(0.1, cap * 0.001));
      }
    }
  });

  it("builds CAGR questions on three or five years that actually happened", () => {
    let negative = 0;
    for (let i = 0; i < 300; i++) {
      for (const type of ["revenueCagr", "epsCagr", "priceCagr"] as QuestionType[]) {
        const q = generateQuestion(type, "medium");
        const years = Number(/over those (\d) years/.exec(q.text)?.[1]);
        expect([3, 5]).toContain(years);

        // The two figures printed are the two ends, and the answer is the
        // compound rate between them.
        const shown =
          type === "revenueCagr"
            ? [...q.text.matchAll(/\$([\d,]+\.\d)bn|\$([\d,]+)m/g)].map(m =>
                m[1] ? Number(m[1].replace(/,/g, "")) * 1000 : Number(m[2].replace(/,/g, ""))
              )
            : [...q.text.matchAll(/\$([\d,]+\.\d{2})/g)].map(m => Number(m[1].replace(/,/g, "")));
        expect(shown).toHaveLength(2);
        // Worked from what is on screen, the arithmetic is exactly right.
        expect(cagrOf(shown[0], shown[1], years)).toBeCloseTo(q.correctAnswer, 1);

        expect(within(q.correctAnswer, SENSIBLE.cagr)).toBe(true);
        if (q.correctAnswer < 0) negative++;

        // The method brackets the answer between two whole rates.
        expect(q.method.join(" ")).toContain(`${Math.floor(q.correctAnswer)}% a year for ${years} years`);
      }
    }
    // A business that shrank is a real answer too.
    expect(negative).toBeGreaterThan(0);
  });

  it("dates a price CAGR from a close that existed", () => {
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion("priceCagr", "hard");
      const stock = q.stockData as NonNullable<typeof q.stockData>;
      const pasts = [stock.threeYearsAgo, stock.fiveYearsAgo].filter(Boolean) as { price: number; date: string }[];
      expect(pasts.some(p => q.text.includes(money(p.price)) && q.text.includes(shortDate(p.date)))).toBe(true);
    }
  });

  it("builds growth questions from two years the company actually reported", () => {
    for (const [type, prior, current] of [
      ["revenueGrowth", "priorRevenue", "revenue"],
      ["epsGrowth", "priorEps", "eps"],
    ] as const) {
      for (let i = 0; i < 50; i++) {
        const q = generateQuestion(type, "medium");
        const stock = q.stockData as NonNullable<typeof q.stockData>;

        expect(Number.isFinite(stock[prior])).toBe(true);
        expect(stock[prior]).toBeGreaterThan(0);
        expect(q.correctAnswer).toBeCloseTo(priceMoveOf(stock[prior], stock[current]), 1);
        // Both ends are on screen, and the question dates them.
        expect(q.text).toMatch(/\b(19|20)\d{2}\b/);
      }
    }
  });
});

describe("runOrder", () => {
  it("asks the day move about a third as often as the rest", () => {
    // A single session's move is usually a fraction of a percent - a dull
    // question, so it is weighted down rather than dropped.
    const counts = new Map<QuestionType, number>();
    for (let run = 0; run < 400; run++) {
      for (const type of runOrder(ALL_QUESTION_TYPES, ALL_QUESTION_TYPES.length)) {
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
    }
    const day = counts.get("percentageChange") ?? 0;
    const others = ALL_QUESTION_TYPES.filter(t => t !== "percentageChange").map(t => counts.get(t) ?? 0);
    const typical = others.reduce((a, b) => a + b, 0) / others.length;

    expect(day / typical).toBeGreaterThan(0.15);
    expect(day / typical).toBeLessThan(0.5);
  });

  it("fills the run and keeps to the requested types", () => {
    const wanted: QuestionType[] = ["peRatio", "revenueCagr", "percentageChange"];
    const order = runOrder(wanted, 25);
    expect(order).toHaveLength(25);
    for (const type of order) expect(wanted).toContain(type);
  });

  it("still asks a down-weighted type the player chose on its own", () => {
    expect(runOrder(["percentageChange"], 10)).toEqual(Array(10).fill("percentageChange"));
  });

  it("does not repeat a type back to back within a pass", () => {
    // Each pass is a shuffle of distinct types, so with every weight at 1 a
    // run of that length holds each type once.
    const order = runOrder(["peRatio", "revenueCagr", "marketCap"], 3);
    expect(new Set(order).size).toBe(3);
  });
});
