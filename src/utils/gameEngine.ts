import {
  ALL_QUESTION_TYPES,
  checkAnswer,
  type DifficultyLevel,
  type Question,
  type QuestionType,
} from "./questionGenerator";

export type Phase = "setup" | "asking" | "revealed" | "finished";

export type DifficultySetting = DifficultyLevel | "adaptive";

export interface GameConfig {
  difficulty: DifficultySetting;
  questionCount: number;
  secondsPerQuestion: number;
  types: QuestionType[];
  // Practice mode drops the clock so you can work a method through slowly.
  timed: boolean;
}

export interface AnswerRecord {
  question: Question;
  userAnswer: number | null; // null means the clock ran out
  correct: boolean;
  ms: number;
  points: number;
}

export interface GameState {
  phase: Phase;
  config: GameConfig;
  current: Question | null;
  index: number;
  answers: AnswerRecord[];
  score: number;
  streak: number;
  bestStreak: number;
  askedAt: number;
  // Difficulty the next question should use; only moves in adaptive mode.
  activeDifficulty: DifficultyLevel;
}

export const DEFAULT_CONFIG: GameConfig = {
  difficulty: "easy",
  questionCount: 10,
  secondsPerQuestion: 30,
  types: ALL_QUESTION_TYPES,
  timed: true,
};

export const BASE_POINTS: Record<DifficultyLevel, number> = {
  easy: 10,
  medium: 20,
  hard: 30,
};

const DIFFICULTY_ORDER: DifficultyLevel[] = ["easy", "medium", "hard"];

export const initialState = (config: GameConfig = DEFAULT_CONFIG): GameState => ({
  phase: "setup",
  config,
  current: null,
  index: 0,
  answers: [],
  score: 0,
  streak: 0,
  bestStreak: 0,
  askedAt: 0,
  activeDifficulty: config.difficulty === "adaptive" ? "easy" : config.difficulty,
});

// Points for a correct answer: the difficulty base, up to half as much again
// for speed, and a small bonus that grows with the streak. Speed matters in
// mental arithmetic, so being right slowly should not score the same as being
// right fast.
export const scoreAnswer = (
  difficulty: DifficultyLevel,
  ms: number,
  limitMs: number,
  streakAfter: number
): number => {
  const base = BASE_POINTS[difficulty];
  const fractionLeft = limitMs > 0 ? Math.max(0, Math.min(1, 1 - ms / limitMs)) : 0;
  const speedBonus = Math.round(base * 0.5 * fractionLeft);
  const streakBonus = Math.min(streakAfter, 5) * 2;
  return base + speedBonus + streakBonus;
};

// Adaptive difficulty looks at the last three answers: sweep them and step up,
// miss two or more and step down. Deliberately slow to react, so one unlucky
// question does not swing the run.
export const nextDifficulty = (
  current: DifficultyLevel,
  recent: AnswerRecord[]
): DifficultyLevel => {
  if (recent.length < 3) return current;

  const lastThree = recent.slice(-3);
  const correct = lastThree.filter(a => a.correct).length;
  const position = DIFFICULTY_ORDER.indexOf(current);

  if (correct === 3 && position < DIFFICULTY_ORDER.length - 1) {
    return DIFFICULTY_ORDER[position + 1];
  }
  if (correct <= 1 && position > 0) {
    return DIFFICULTY_ORDER[position - 1];
  }
  return current;
};

export type GameAction =
  | { type: "CONFIGURE"; patch: Partial<GameConfig> }
  | { type: "START"; question: Question; now: number }
  | { type: "SUBMIT"; answer: number; now: number }
  | { type: "TIMEOUT"; now: number }
  | { type: "NEXT"; question: Question; now: number }
  | { type: "RESET" };

const limitMsOf = (state: GameState): number =>
  state.config.timed ? state.config.secondsPerQuestion * 1000 : 0;

const recordAnswer = (
  state: GameState,
  userAnswer: number | null,
  now: number
): GameState => {
  if (state.phase !== "asking" || !state.current) return state;

  const ms = Math.max(0, now - state.askedAt);
  const correct = userAnswer !== null && checkAnswer(state.current, userAnswer);
  const streak = correct ? state.streak + 1 : 0;
  const points = correct
    ? scoreAnswer(state.current.difficulty, ms, limitMsOf(state), streak)
    : 0;

  const record: AnswerRecord = {
    question: state.current,
    userAnswer,
    correct,
    ms,
    points,
  };

  const answers = [...state.answers, record];

  return {
    ...state,
    phase: "revealed",
    answers,
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    activeDifficulty:
      state.config.difficulty === "adaptive"
        ? nextDifficulty(state.activeDifficulty, answers)
        : state.activeDifficulty,
  };
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case "CONFIGURE": {
      if (state.phase !== "setup") return state;
      const config = { ...state.config, ...action.patch };
      return {
        ...state,
        config,
        activeDifficulty: config.difficulty === "adaptive" ? "easy" : config.difficulty,
      };
    }

    case "START":
      return {
        ...initialState(state.config),
        phase: "asking",
        current: action.question,
        askedAt: action.now,
      };

    case "SUBMIT":
      return recordAnswer(state, action.answer, action.now);

    case "TIMEOUT":
      return recordAnswer(state, null, action.now);

    case "NEXT": {
      if (state.phase !== "revealed") return state;

      const nextIndex = state.index + 1;
      if (nextIndex >= state.config.questionCount) {
        return { ...state, phase: "finished", current: null };
      }

      return {
        ...state,
        phase: "asking",
        index: nextIndex,
        current: action.question,
        askedAt: action.now,
      };
    }

    case "RESET":
      return initialState(state.config);

    default:
      return state;
  }
};

// --- derived helpers ------------------------------------------------------

export const accuracy = (answers: AnswerRecord[]): number =>
  answers.length === 0 ? 0 : (answers.filter(a => a.correct).length / answers.length) * 100;

export const totalPoints = (answers: AnswerRecord[]): number =>
  answers.reduce((sum, a) => sum + a.points, 0);

// Per-type breakdown for the end-of-run review.
export const breakdownByType = (
  answers: AnswerRecord[]
): { type: QuestionType; attempts: number; correct: number; avgMs: number }[] => {
  const map = new Map<QuestionType, { attempts: number; correct: number; totalMs: number }>();

  for (const answer of answers) {
    const key = answer.question.type;
    const entry = map.get(key) ?? { attempts: 0, correct: 0, totalMs: 0 };
    entry.attempts += 1;
    entry.correct += answer.correct ? 1 : 0;
    entry.totalMs += answer.ms;
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([type, entry]) => ({
      type,
      attempts: entry.attempts,
      correct: entry.correct,
      avgMs: entry.totalMs / entry.attempts,
    }))
    .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts);
};
