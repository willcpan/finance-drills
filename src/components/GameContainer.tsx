import React from "react";
import QuestionCard from "./QuestionCard";
import ResultScreen from "./ResultScreen";
import ScoreBoard from "./ScoreBoard";
import SetupScreen from "./SetupScreen";
import StatsPanel from "./StatsPanel";
import Timer from "./Timer";
import { useGame } from "@/hooks/useGame";

const GameContainer: React.FC = () => {
  const { state, stats, remainingMs, configure, start, submit, next, reset, resetStats } = useGame();

  if (state.phase === "setup") {
    return (
      <div className="max-w-5xl mx-auto p-4 grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <SetupScreen config={state.config} stats={stats} onChange={configure} onStart={start} />
        </div>
        <StatsPanel stats={stats} onReset={resetStats} />
      </div>
    );
  }

  if (state.phase === "finished") {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <ResultScreen
          answers={state.answers}
          score={state.score}
          bestStreak={state.bestStreak}
          config={state.config}
          stats={stats}
          onPlayAgain={start}
          onChangeSettings={reset}
        />
      </div>
    );
  }

  if (!state.current) return null;

  const revealed = state.phase === "revealed";
  const lastAnswer = state.answers[state.answers.length - 1];
  const correctSoFar = state.answers.filter(a => a.correct).length;

  return (
    <div className="max-w-5xl mx-auto p-4 grid md:grid-cols-3 gap-6 items-start">
      <div className="md:col-span-2 space-y-4 animate-slide-up">
        <div className="bg-white rounded-lg shadow-md p-4 flex items-center justify-between gap-4">
          <div>
            <span className="block text-sm text-gray-500">
              Question {state.index + 1} of {state.config.questionCount}
            </span>
            <span className="text-xs text-gray-400">
              {state.config.difficulty === "adaptive"
                ? `Adaptive · now ${state.activeDifficulty}`
                : state.config.difficulty}
            </span>
          </div>
          <Timer
            remainingMs={remainingMs}
            totalMs={state.config.secondsPerQuestion * 1000}
            enabled={state.config.timed}
          />
        </div>

        <QuestionCard
          question={state.current}
          revealed={revealed}
          wasCorrect={revealed && lastAnswer ? lastAnswer.correct : false}
          userAnswer={revealed && lastAnswer ? lastAnswer.userAnswer : null}
          elapsedMs={revealed && lastAnswer ? lastAnswer.ms : 0}
          onAnswer={submit}
          onNext={next}
          isLast={state.index + 1 >= state.config.questionCount}
        />
      </div>

      <ScoreBoard
        className="sticky top-4"
        score={state.score}
        questionNumber={state.index + 1}
        totalQuestions={state.config.questionCount}
        correctAnswers={correctSoFar}
        wrongAnswers={state.answers.length - correctSoFar}
        streak={state.streak}
        bestStreak={state.bestStreak}
      />
    </div>
  );
};

export default GameContainer;
