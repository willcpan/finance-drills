import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  DEFAULT_CONFIG,
  gameReducer,
  initialState,
  type GameConfig,
  type GameState,
} from "@/utils/gameEngine";
import {
  generateQuestion,
  type DifficultyLevel,
  type QuestionType,
} from "@/utils/questionGenerator";
import { clearStats, emptyStats, loadStats, mergeSession, saveStats, type Stats } from "@/utils/stats";

const shuffle = <T,>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export interface UseGame {
  state: GameState;
  stats: Stats;
  remainingMs: number;
  configure: (patch: Partial<GameConfig>) => void;
  start: () => void;
  submit: (answer: number) => void;
  next: () => void;
  reset: () => void;
  resetStats: () => void;
}

export const useGame = (): UseGame => {
  const [state, dispatch] = useReducer(gameReducer, DEFAULT_CONFIG, initialState);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [remainingMs, setRemainingMs] = useState(0);

  // Type order for the current run, so a run cycles rather than repeating.
  const orderRef = useRef<QuestionType[]>([]);
  // Guards the one-time stats write when a run ends.
  const recordedRef = useRef(false);

  const difficultyFor = useCallback(
    (current: GameState): DifficultyLevel => current.activeDifficulty,
    []
  );

  const questionFor = useCallback(
    (index: number, current: GameState) => {
      const order = orderRef.current.length > 0 ? orderRef.current : current.config.types;
      const type = order[index % order.length];
      return generateQuestion(type, difficultyFor(current));
    },
    [difficultyFor]
  );

  const start = useCallback(() => {
    orderRef.current = shuffle(state.config.types);
    recordedRef.current = false;
    // Start from the configured difficulty, not whatever adaptive drifted to on
    // the previous run - the reducer resets activeDifficulty the same way, and
    // the two would otherwise disagree on the first question of a replay.
    const startingDifficulty: DifficultyLevel =
      state.config.difficulty === "adaptive" ? "easy" : state.config.difficulty;
    const fresh = { ...state, activeDifficulty: startingDifficulty };
    dispatch({ type: "START", question: questionFor(0, fresh), now: Date.now() });
  }, [state, questionFor]);

  const submit = useCallback((answer: number) => {
    dispatch({ type: "SUBMIT", answer, now: Date.now() });
  }, []);

  const next = useCallback(() => {
    dispatch({ type: "NEXT", question: questionFor(state.index + 1, state), now: Date.now() });
  }, [questionFor, state]);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const configure = useCallback(
    (patch: Partial<GameConfig>) => dispatch({ type: "CONFIGURE", patch }),
    []
  );

  const resetStats = useCallback(() => {
    clearStats();
    setStats(emptyStats());
  }, []);

  // Countdown derived from the timestamp the question was shown, rather than
  // from a counter that ticks down. Nothing to reset between questions: a new
  // question changes askedAt and the remaining time follows.
  useEffect(() => {
    if (state.phase !== "asking" || !state.config.timed) {
      setRemainingMs(state.config.secondsPerQuestion * 1000);
      return;
    }

    const limit = state.config.secondsPerQuestion * 1000;

    const tick = () => {
      const left = Math.max(0, limit - (Date.now() - state.askedAt));
      setRemainingMs(left);
      if (left <= 0) dispatch({ type: "TIMEOUT", now: Date.now() });
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [state.phase, state.askedAt, state.config.timed, state.config.secondsPerQuestion]);

  // Persist the run once, when it ends.
  useEffect(() => {
    if (state.phase !== "finished" || recordedRef.current) return;
    recordedRef.current = true;

    const merged = mergeSession(loadStats(), {
      score: state.score,
      bestStreak: state.bestStreak,
      difficulty: state.config.difficulty,
      answers: state.answers.map(a => ({
        type: a.question.type,
        correct: a.correct,
        ms: a.ms,
      })),
    });

    saveStats(merged);
    setStats(merged);
  }, [state.phase, state.score, state.bestStreak, state.config.difficulty, state.answers]);

  return useMemo(
    () => ({ state, stats, remainingMs, configure, start, submit, next, reset, resetStats }),
    [state, stats, remainingMs, configure, start, submit, next, reset, resetStats]
  );
};
