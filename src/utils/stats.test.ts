// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  accuracyOf,
  averageMsOf,
  emptyStats,
  loadStats,
  median,
  mergeSession,
  saveStats,
  weakestType,
  type SessionResult,
  type Stats,
} from "./stats";

const session = (overrides: Partial<SessionResult> = {}): SessionResult => ({
  score: 100,
  bestStreak: 3,
  difficulty: "easy",
  answers: [
    { type: "peRatio", correct: true, ms: 4000 },
    { type: "peRatio", correct: false, ms: 6000 },
    { type: "doublingTime", correct: true, ms: 2000 },
  ],
  ...overrides,
});

describe("loadStats", () => {
  beforeEach(() => window.localStorage.clear());

  it("drops a question type that no longer exists", () => {
    // Rule of 72 was replaced by Doubling Time, which asks the same arithmetic
    // about a rate a company actually grew at. Anyone who drilled the old one
    // still has it saved, and handing it back would point them at a question
    // with no pool and no label.
    const saved = {
      ...emptyStats(),
      byType: {
        peRatio: { attempts: 5, correct: 2, totalMs: 10000 },
        ruleOf72: { attempts: 9, correct: 1, totalMs: 9000 },
      },
    } as unknown as Stats;
    saveStats(saved);

    const loaded = loadStats();
    expect(Object.keys(loaded.byType)).toEqual(["peRatio"]);
    // Worst accuracy was the retired type; the answer has to be a live one.
    expect(weakestType(loaded)).toBe("peRatio");
  });

  it("keeps the run history whole", () => {
    // A summary records no type, and those runs did happen.
    const saved: Stats = {
      ...emptyStats(),
      runs: 2,
      recent: [
        { at: 1, score: 10, answered: 5, correct: 3, bestStreak: 2, medianMs: 900, difficulty: "easy" },
        { at: 2, score: 20, answered: 5, correct: 4, bestStreak: 3, medianMs: 800, difficulty: "hard" },
      ],
    };
    saveStats(saved);

    expect(loadStats().recent).toHaveLength(2);
  });
});

describe("median", () => {
  it("returns zero for an empty list", () => {
    expect(median([])).toBe(0);
  });

  it("handles odd and even lengths", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("mergeSession", () => {
  it("accumulates totals across runs", () => {
    const first = mergeSession(emptyStats(), session());
    expect(first.runs).toBe(1);
    expect(first.answered).toBe(3);
    expect(first.correct).toBe(2);

    const second = mergeSession(first, session());
    expect(second.runs).toBe(2);
    expect(second.answered).toBe(6);
    expect(second.correct).toBe(4);
  });

  it("tracks per-type attempts, correctness and time", () => {
    const stats = mergeSession(emptyStats(), session());
    expect(stats.byType.peRatio).toEqual({ attempts: 2, correct: 1, totalMs: 10000 });
    expect(stats.byType.doublingTime).toEqual({ attempts: 1, correct: 1, totalMs: 2000 });
  });

  it("keeps the high-water marks", () => {
    const first = mergeSession(emptyStats(), session({ score: 250, bestStreak: 9 }));
    const second = mergeSession(first, session({ score: 40, bestStreak: 2 }));

    expect(second.bestScore).toBe(250);
    expect(second.bestStreak).toBe(9);
  });

  it("records a summary of each run, newest first, capped at ten", () => {
    let stats = emptyStats();
    for (let i = 0; i < 13; i++) {
      stats = mergeSession(stats, session({ score: i }));
    }

    expect(stats.recent).toHaveLength(10);
    expect(stats.recent[0].score).toBe(12);
    expect(stats.recent[0].answered).toBe(3);
    expect(stats.recent[0].correct).toBe(2);
    expect(stats.recent[0].medianMs).toBe(4000);
  });

  it("does not mutate the stats handed to it", () => {
    const before = emptyStats();
    mergeSession(before, session());
    expect(before.runs).toBe(0);
    expect(before.byType).toEqual({});
  });

  it("handles a run where nothing was answered", () => {
    const stats = mergeSession(emptyStats(), session({ answers: [], score: 0, bestStreak: 0 }));
    expect(stats.runs).toBe(1);
    expect(stats.answered).toBe(0);
    expect(stats.recent[0].medianMs).toBe(0);
  });
});

describe("weakestType", () => {
  it("returns nothing until a type has enough attempts", () => {
    const stats = mergeSession(emptyStats(), session());
    expect(weakestType(stats, 4)).toBeNull();
  });

  it("picks the lowest accuracy among types attempted enough", () => {
    let stats = emptyStats();
    for (let i = 0; i < 3; i++) stats = mergeSession(stats, session());

    // peRatio: 3 of 6 correct. doublingTime: 3 of 3.
    expect(weakestType(stats, 3)).toBe("peRatio");
  });
});

describe("per-type helpers", () => {
  it("reports accuracy and average time, and zero when unattempted", () => {
    const stat = { attempts: 4, correct: 3, totalMs: 8000 };
    expect(accuracyOf(stat)).toBe(75);
    expect(averageMsOf(stat)).toBe(2000);
    expect(accuracyOf(undefined)).toBe(0);
    expect(averageMsOf(undefined)).toBe(0);
    expect(accuracyOf({ attempts: 0, correct: 0, totalMs: 0 })).toBe(0);
  });
});
