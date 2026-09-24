import { ALL_QUESTION_TYPES, type DifficultyLevel, type QuestionType } from "./questionGenerator";

const STORAGE_KEY = "finance-drills:stats:v1";

export interface TypeStat {
  attempts: number;
  correct: number;
  totalMs: number;
}

export interface SessionSummary {
  at: number;
  score: number;
  answered: number;
  correct: number;
  bestStreak: number;
  medianMs: number;
  difficulty: DifficultyLevel | "adaptive";
}

export interface Stats {
  version: 1;
  runs: number;
  answered: number;
  correct: number;
  bestScore: number;
  bestStreak: number;
  byType: Partial<Record<QuestionType, TypeStat>>;
  recent: SessionSummary[];
}

export const emptyStats = (): Stats => ({
  version: 1,
  runs: 0,
  answered: 0,
  correct: 0,
  bestScore: 0,
  bestStreak: 0,
  byType: {},
  recent: [],
});

const MAX_RECENT = 10;

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export interface RecordedAnswer {
  type: QuestionType;
  correct: boolean;
  ms: number;
}

export interface SessionResult {
  score: number;
  bestStreak: number;
  difficulty: DifficultyLevel | "adaptive";
  answers: RecordedAnswer[];
}

// Pure: takes the stats you had and the run you just finished, returns the new
// stats. Keeping the merge separate from storage makes it straightforward to
// test and means a failed write can never corrupt in-memory state.
export const mergeSession = (previous: Stats, session: SessionResult): Stats => {
  const byType: Partial<Record<QuestionType, TypeStat>> = { ...previous.byType };

  for (const answer of session.answers) {
    const existing = byType[answer.type] ?? { attempts: 0, correct: 0, totalMs: 0 };
    byType[answer.type] = {
      attempts: existing.attempts + 1,
      correct: existing.correct + (answer.correct ? 1 : 0),
      totalMs: existing.totalMs + answer.ms,
    };
  }

  const correctCount = session.answers.filter(a => a.correct).length;
  const summary: SessionSummary = {
    at: Date.now(),
    score: session.score,
    answered: session.answers.length,
    correct: correctCount,
    bestStreak: session.bestStreak,
    medianMs: median(session.answers.map(a => a.ms)),
    difficulty: session.difficulty,
  };

  return {
    version: 1,
    runs: previous.runs + 1,
    answered: previous.answered + session.answers.length,
    correct: previous.correct + correctCount,
    bestScore: Math.max(previous.bestScore, session.score),
    bestStreak: Math.max(previous.bestStreak, session.bestStreak),
    byType,
    recent: [summary, ...previous.recent].slice(0, MAX_RECENT),
  };
};

// Weakest type by accuracy, ignoring anything barely attempted. Used to point
// the player at what to practise next.
export const weakestType = (stats: Stats, minAttempts = 4): QuestionType | null => {
  let worst: QuestionType | null = null;
  let worstRate = Infinity;

  for (const [type, stat] of Object.entries(stats.byType) as [QuestionType, TypeStat][]) {
    if (stat.attempts < minAttempts) continue;
    const rate = stat.correct / stat.attempts;
    if (rate < worstRate) {
      worstRate = rate;
      worst = type;
    }
  }

  return worst;
};

export const accuracyOf = (stat: TypeStat | undefined): number =>
  stat && stat.attempts > 0 ? (stat.correct / stat.attempts) * 100 : 0;

export const averageMsOf = (stat: TypeStat | undefined): number =>
  stat && stat.attempts > 0 ? stat.totalMs / stat.attempts : 0;

// --- storage -------------------------------------------------------------
// Every access is guarded: localStorage throws in private windows and with
// site data blocked, and the stored value can be anything if a user edits it.

const isStats = (value: unknown): value is Stats => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Stats>;
  return (
    candidate.version === 1 &&
    typeof candidate.runs === "number" &&
    typeof candidate.answered === "number" &&
    typeof candidate.byType === "object" &&
    Array.isArray(candidate.recent)
  );
};

// Saved stats outlive the question types they were recorded against: a player
// who drilled Rule of 72 before it was replaced still has it in localStorage.
// A retired type reaching the app is not harmless - weakestType would hand it
// back as the thing to practise next, and nothing downstream has a pool or a
// label for it - so it is dropped on the way in. The run history is kept
// whole: those runs did happen, and a summary records no type.
const forgetRetiredTypes = (stats: Stats): Stats => {
  const known = new Set<string>(ALL_QUESTION_TYPES);

  return {
    ...stats,
    byType: Object.fromEntries(
      Object.entries(stats.byType).filter(([type]) => known.has(type))
    ) as Stats["byType"],
  };
};

export const loadStats = (): Stats => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStats();
    const parsed: unknown = JSON.parse(raw);
    return isStats(parsed) ? forgetRetiredTypes(parsed) : emptyStats();
  } catch {
    return emptyStats();
  }
};

export const saveStats = (stats: Stats): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Nothing to do - the run still counts for this session, it just will not
    // survive a reload.
  }
};

export const clearStats = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
