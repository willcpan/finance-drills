import { describe, it, expect } from "vitest";
import {
  generateQuestion,
  generateQuestions,
  checkAnswer,
  type DifficultyLevel,
  type QuestionType
} from "./questionGenerator";

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];
const TYPES: QuestionType[] = [
  "priceIncrease",
  "percentageChange",
  "dividendYield",
  "dividendPerShare"
];

// The stock data is injected by vite.config.ts from Stockdata.csv, so these run
// against the real 260-odd companies rather than a fixture.
describe("question generation", () => {
  it("produces questions for every type and difficulty", () => {
    for (const type of TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const question = generateQuestion(type, difficulty);
        expect(question.type).toBe(type);
        expect(question.difficulty).toBe(difficulty);
        expect(Number.isFinite(question.correctAnswer)).toBe(true);
        expect(question.tolerance).toBeGreaterThan(0);
      }
    }
  });

  it("labels each question with the unit its answer is in", () => {
    const units: Record<QuestionType, string> = {
      priceIncrease: "currency",
      percentageChange: "percentagePoints",
      dividendYield: "percentagePoints",
      dividendPerShare: "currency"
    };

    for (const type of TYPES) {
      expect(generateQuestion(type, "easy").answerUnit).toBe(units[type]);
    }
  });

  it("asks for the thing its type is named after", () => {
    // These two were previously swapped: the type called dividendYield asked for
    // the per-share amount, and vice versa.
    const yieldQuestion = generateQuestion("dividendYield", "easy");
    expect(yieldQuestion.text).toMatch(/what is the approximate dividend yield/);

    const perShareQuestion = generateQuestion("dividendPerShare", "easy");
    expect(perShareQuestion.text).toMatch(/what is the approximate annual dividend per share/);
  });

  it("only asks dividend questions about stocks that pay one", () => {
    for (let i = 0; i < 200; i++) {
      for (const type of ["dividendYield", "dividendPerShare"] as QuestionType[]) {
        expect(generateQuestion(type, "easy").stockData.dividendPerShare).toBeGreaterThan(0);
      }
    }
  });

  it("spreads difficulty across a generated set when none is given", () => {
    const questions = generateQuestions(9);
    expect(questions).toHaveLength(9);
    expect(new Set(questions.map(q => q.difficulty)).size).toBeGreaterThan(1);
  });
});

describe("checkAnswer", () => {
  it("accepts the exact answer for every type and difficulty", () => {
    // The old relative tolerance went negative whenever the answer did, which
    // made roughly half of all percentage-change questions unsatisfiable even
    // with a perfect answer.
    for (let i = 0; i < 500; i++) {
      for (const type of TYPES) {
        for (const difficulty of DIFFICULTIES) {
          const question = generateQuestion(type, difficulty);
          expect(checkAnswer(question, question.correctAnswer)).toBe(true);
        }
      }
    }
  });

  it("accepts exact answers that are negative", () => {
    let checked = 0;
    for (let i = 0; i < 2000 && checked < 50; i++) {
      const question = generateQuestion("percentageChange", "easy");
      if (question.correctAnswer < 0) {
        expect(checkAnswer(question, question.correctAnswer)).toBe(true);
        checked++;
      }
    }
    // Guard against the test silently passing because no negative answer showed up.
    expect(checked).toBeGreaterThan(0);
  });

  it("rejects an answer just outside the tolerance", () => {
    for (const type of TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const question = generateQuestion(type, difficulty);
        const outside = question.correctAnswer + question.tolerance * 1.01 + 1e-9;
        expect(checkAnswer(question, outside)).toBe(false);
      }
    }
  });

  it("accepts an answer just inside the tolerance", () => {
    for (const type of TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const question = generateQuestion(type, difficulty);
        expect(checkAnswer(question, question.correctAnswer + question.tolerance * 0.99)).toBe(true);
        expect(checkAnswer(question, question.correctAnswer - question.tolerance * 0.99)).toBe(true);
      }
    }
  });

  it("does not accept the price already shown in a price-increase question", () => {
    // The tolerance used to be 10% of the answer while the increase itself was
    // only 5-10%, so retyping the price on screen scored as correct every time.
    for (let i = 0; i < 1000; i++) {
      for (const difficulty of DIFFICULTIES) {
        const question = generateQuestion("priceIncrease", difficulty);
        expect(checkAnswer(question, question.stockData.currentPrice)).toBe(false);
      }
    }
  });

  it("keeps tolerances tighter as difficulty rises", () => {
    for (const type of TYPES) {
      const easy = generateQuestion(type, "easy");
      const hard = generateQuestion(type, "hard");
      // Compare in relative terms so differing stock prices don't skew it.
      const easyRelative = easy.tolerance / Math.max(Math.abs(easy.correctAnswer), 1);
      const hardRelative = hard.tolerance / Math.max(Math.abs(hard.correctAnswer), 1);
      expect(hardRelative).toBeLessThan(easyRelative);
    }
  });
});
