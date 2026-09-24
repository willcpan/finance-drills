// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuestionCard from "./QuestionCard";
import type { Question } from "@/utils/questionGenerator";
import type { StockData } from "@/utils/stockData";

afterEach(cleanup);

const stock = (overrides: Partial<StockData> = {}): StockData => ({
  ticker: "AAA",
  name: "Alpha Industries Inc.",
  sector: "Industrials",
  currentPrice: 100,
  previousClose: 98,
  monthAgo: { price: 90, date: "2026-08-18" },
  yearAgo: { price: 50, date: "2025-09-17" },
  eps: 5,
  revenue: 1000,
  operatingProfit: 200,
  fiscalYear: "CY2025",
  priorRevenue: 900,
  priorEps: 4,
  priorRevenueFiscalYear: "CY2024",
  priorEpsFiscalYear: "CY2024",
  dividendPerShare: 2,
  dividendYield: 2,
  ...overrides,
});

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "test",
  type: "peRatio",
  category: "valuation",
  difficulty: "easy",
  text: "Alpha Industries Inc. (AAA) trades at $100.00 and earns $5.00 a share. What is its P/E ratio?",
  stockData: stock(),
  correctAnswer: 20,
  answerUnit: "ratio",
  tolerance: 1,
  method: ["P/E is price over earnings per share."],
  ...overrides,
});

const show = (overrides: Partial<Question> = {}, props: { revealed?: boolean } = {}) => {
  const onAnswer = vi.fn();
  const onNext = vi.fn();
  render(
    <QuestionCard
      question={question(overrides)}
      revealed={props.revealed ?? false}
      wasCorrect={false}
      userAnswer={null}
      elapsedMs={0}
      onAnswer={onAnswer}
      onNext={onNext}
      isLast={false}
    />
  );
  return { onAnswer, onNext };
};

describe("QuestionCard", () => {
  it("submits on space as well as enter", async () => {
    // Every answer is a number, so a space can never be part of one. On a
    // drill scored by speed, the nearer key wins.
    const user = userEvent.setup();
    const { onAnswer } = show();

    await user.type(screen.getByLabelText(/your answer/i), "19.4");
    await user.keyboard(" ");

    expect(onAnswer).toHaveBeenCalledWith(19.4);
  });

  it("does not swallow a space into the answer", async () => {
    const user = userEvent.setup();
    show();

    const input = screen.getByLabelText(/your answer/i) as HTMLInputElement;
    await user.type(input, "19.4");
    await user.keyboard(" ");

    expect(input.value).toBe("19.4");
  });

  it("ignores space before anything has been typed", async () => {
    // Otherwise a stray keystroke burns the question.
    const user = userEvent.setup();
    const { onAnswer } = show();

    screen.getByLabelText(/your answer/i).focus();
    await user.keyboard(" ");

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("does not submit again once the answer is showing", async () => {
    const user = userEvent.setup();
    const { onAnswer } = show({}, { revealed: true });

    await user.keyboard(" ");

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("carries the same key on to the next question", async () => {
    // Revealing moves focus to Continue, and space activates a focused button,
    // so one key plays the whole drill.
    const user = userEvent.setup();
    const { onNext } = show({}, { revealed: true });

    await user.keyboard(" ");

    expect(onNext).toHaveBeenCalled();
  });

  it("names the company as well as the ticker", () => {
    // A ticker alone is how a desk talks, but not always enough to know who
    // you are looking at.
    show();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Alpha Industries Inc. (AAA)"
    );
  });
});
