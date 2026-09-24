import { describe, it, expect } from "vitest";
import {
  BASE_POINTS,
  DEFAULT_CONFIG,
  accuracy,
  breakdownByType,
  gameReducer,
  initialState,
  nextDifficulty,
  scoreAnswer,
  type AnswerRecord,
  type GameState,
} from "./gameEngine";
import { generateQuestion, type DifficultyLevel } from "./questionGenerator";

const startedGame = (overrides: Partial<GameState> = {}): GameState => {
  const base = initialState({ ...DEFAULT_CONFIG, questionCount: 3, secondsPerQuestion: 30 });
  return gameReducer(
    { ...base, ...overrides },
    { type: "START", question: generateQuestion("priceIncrease", "easy"), now: 1000 }
  );
};

describe("scoreAnswer", () => {
  it("awards the difficulty base at minimum", () => {
    for (const difficulty of ["easy", "medium", "hard"] as DifficultyLevel[]) {
      const slow = scoreAnswer(difficulty, 30_000, 30_000, 1);
      expect(slow).toBeGreaterThanOrEqual(BASE_POINTS[difficulty]);
    }
  });

  it("pays more for a faster answer", () => {
    const fast = scoreAnswer("easy", 2_000, 30_000, 1);
    const slow = scoreAnswer("easy", 28_000, 30_000, 1);
    expect(fast).toBeGreaterThan(slow);
  });

  it("pays more for a longer streak, up to a cap", () => {
    const short = scoreAnswer("easy", 5_000, 30_000, 1);
    const long = scoreAnswer("easy", 5_000, 30_000, 5);
    const longer = scoreAnswer("easy", 5_000, 30_000, 50);
    expect(long).toBeGreaterThan(short);
    expect(longer).toBe(long);
  });

  it("does not pay a speed bonus when untimed", () => {
    // limitMs of 0 means practice mode.
    expect(scoreAnswer("easy", 1_000, 0, 1)).toBe(BASE_POINTS.easy + 2);
  });
});

describe("nextDifficulty", () => {
  const record = (correct: boolean): AnswerRecord => ({
    question: generateQuestion("priceIncrease", "easy"),
    userAnswer: 1,
    correct,
    ms: 1000,
    points: 0,
  });

  it("holds until there are three answers to look at", () => {
    expect(nextDifficulty("easy", [record(true), record(true)])).toBe("easy");
  });

  it("steps up after three in a row", () => {
    expect(nextDifficulty("easy", [record(true), record(true), record(true)])).toBe("medium");
    expect(nextDifficulty("medium", [record(true), record(true), record(true)])).toBe("hard");
  });

  it("does not climb past hard", () => {
    expect(nextDifficulty("hard", [record(true), record(true), record(true)])).toBe("hard");
  });

  it("steps down after two or more misses", () => {
    expect(nextDifficulty("hard", [record(false), record(false), record(true)])).toBe("medium");
  });

  it("does not drop below easy", () => {
    expect(nextDifficulty("easy", [record(false), record(false), record(false)])).toBe("easy");
  });

  it("holds steady on a mixed but passing three", () => {
    expect(nextDifficulty("medium", [record(true), record(true), record(false)])).toBe("medium");
  });
});

describe("gameReducer", () => {
  it("starts in setup and only configures there", () => {
    const setup = initialState();
    expect(setup.phase).toBe("setup");

    const configured = gameReducer(setup, { type: "CONFIGURE", patch: { questionCount: 20 } });
    expect(configured.config.questionCount).toBe(20);

    const playing = startedGame();
    const ignored = gameReducer(playing, { type: "CONFIGURE", patch: { questionCount: 5 } });
    expect(ignored.config.questionCount).toBe(3);
  });

  it("records a correct answer with points and a streak", () => {
    const game = startedGame();
    const answered = gameReducer(game, {
      type: "SUBMIT",
      answer: game.current!.correctAnswer,
      now: 3000,
    });

    expect(answered.phase).toBe("revealed");
    expect(answered.answers).toHaveLength(1);
    expect(answered.answers[0].correct).toBe(true);
    expect(answered.answers[0].ms).toBe(2000);
    expect(answered.score).toBeGreaterThan(0);
    expect(answered.streak).toBe(1);
    expect(answered.bestStreak).toBe(1);
  });

  it("records a wrong answer, scores nothing and breaks the streak", () => {
    const game = startedGame();
    const wrong = gameReducer(game, {
      type: "SUBMIT",
      answer: game.current!.correctAnswer + game.current!.tolerance * 100 + 1,
      now: 3000,
    });

    expect(wrong.answers[0].correct).toBe(false);
    expect(wrong.answers[0].points).toBe(0);
    expect(wrong.score).toBe(0);
    expect(wrong.streak).toBe(0);
  });

  it("treats a timeout as a wrong answer with no submitted value", () => {
    const game = startedGame();
    const timedOut = gameReducer(game, { type: "TIMEOUT", now: 31_000 });

    expect(timedOut.phase).toBe("revealed");
    expect(timedOut.answers[0].userAnswer).toBeNull();
    expect(timedOut.answers[0].correct).toBe(false);
    expect(timedOut.streak).toBe(0);
  });

  it("keeps the best streak after it breaks", () => {
    let game = startedGame();
    for (let i = 0; i < 2; i++) {
      game = gameReducer(game, { type: "SUBMIT", answer: game.current!.correctAnswer, now: 2000 });
      game = gameReducer(game, {
        type: "NEXT",
        question: generateQuestion("priceIncrease", "easy"),
        now: 3000,
      });
    }
    expect(game.bestStreak).toBe(2);

    game = gameReducer(game, { type: "SUBMIT", answer: Number.MAX_SAFE_INTEGER, now: 4000 });
    expect(game.streak).toBe(0);
    expect(game.bestStreak).toBe(2);
  });

  it("ignores a submit that arrives after the answer is already revealed", () => {
    const game = startedGame();
    const once = gameReducer(game, {
      type: "SUBMIT",
      answer: game.current!.correctAnswer,
      now: 2000,
    });
    const twice = gameReducer(once, {
      type: "SUBMIT",
      answer: once.current!.correctAnswer,
      now: 2500,
    });

    expect(twice.answers).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("finishes after the configured number of questions", () => {
    let game = startedGame(); // questionCount is 3

    for (let i = 0; i < 3; i++) {
      game = gameReducer(game, { type: "SUBMIT", answer: game.current!.correctAnswer, now: 2000 });
      game = gameReducer(game, {
        type: "NEXT",
        question: generateQuestion("priceIncrease", "easy"),
        now: 3000,
      });
    }

    expect(game.phase).toBe("finished");
    expect(game.answers).toHaveLength(3);
    expect(game.current).toBeNull();
  });

  it("resets back to setup while keeping the configuration", () => {
    const game = startedGame();
    const reset = gameReducer(game, { type: "RESET" });
    expect(reset.phase).toBe("setup");
    expect(reset.config.questionCount).toBe(3);
    expect(reset.answers).toHaveLength(0);
    expect(reset.score).toBe(0);
  });

  it("moves difficulty only in adaptive mode", () => {
    const fixed = initialState({ ...DEFAULT_CONFIG, difficulty: "easy", questionCount: 10 });
    const adaptive = initialState({ ...DEFAULT_CONFIG, difficulty: "adaptive", questionCount: 10 });

    const runThree = (start: GameState): GameState => {
      let game = gameReducer(start, {
        type: "START",
        question: generateQuestion("priceIncrease", "easy"),
        now: 0,
      });
      for (let i = 0; i < 3; i++) {
        game = gameReducer(game, { type: "SUBMIT", answer: game.current!.correctAnswer, now: 1000 });
        if (i < 2) {
          game = gameReducer(game, {
            type: "NEXT",
            question: generateQuestion("priceIncrease", "easy"),
            now: 1500,
          });
        }
      }
      return game;
    };

    expect(runThree(fixed).activeDifficulty).toBe("easy");
    expect(runThree(adaptive).activeDifficulty).toBe("medium");
  });
});

describe("derived helpers", () => {
  const record = (correct: boolean, type: "peRatio" | "doublingTime", ms: number): AnswerRecord => ({
    question: generateQuestion(type, "easy"),
    userAnswer: 1,
    correct,
    ms,
    points: correct ? 10 : 0,
  });

  it("computes accuracy, and treats an empty run as zero", () => {
    expect(accuracy([])).toBe(0);
    expect(accuracy([record(true, "peRatio", 1000), record(false, "peRatio", 1000)])).toBe(50);
  });

  it("breaks results down by type, weakest first", () => {
    const rows = breakdownByType([
      record(true, "doublingTime", 1000),
      record(true, "doublingTime", 3000),
      record(false, "peRatio", 2000),
      record(false, "peRatio", 4000),
    ]);

    expect(rows[0].type).toBe("peRatio");
    expect(rows[0].correct).toBe(0);
    expect(rows[0].avgMs).toBe(3000);
    expect(rows[1].type).toBe("doublingTime");
    expect(rows[1].avgMs).toBe(2000);
  });
});
