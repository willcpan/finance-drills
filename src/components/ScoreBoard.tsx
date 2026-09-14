import React from "react";
import { CheckCircle, Flame, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreBoardProps {
  score: number;
  questionNumber: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  streak: number;
  bestStreak: number;
  className?: string;
}

const ScoreBoard: React.FC<ScoreBoardProps> = ({
  score,
  questionNumber,
  totalQuestions,
  correctAnswers,
  wrongAnswers,
  streak,
  bestStreak,
  className,
}) => {
  const answered = correctAnswers + wrongAnswers;
  const completion = totalQuestions > 0 ? (answered / totalQuestions) * 100 : 0;
  const accuracy = answered > 0 ? (correctAnswers / answered) * 100 : 0;

  return (
    <div className={cn("bg-white rounded-lg shadow-md p-4", className)}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-finance-blue">Score</h3>
        <div className="flex items-center">
          <Trophy className="h-5 w-5 text-finance-yellow mr-2" />
          <span className="text-xl font-bold tabular-nums">{score}</span>
        </div>
      </div>

      {streak >= 2 && (
        <div className="flex items-center justify-center gap-1.5 mb-3 py-1.5 rounded-md bg-orange-50 text-finance-yellow animate-fade-in">
          <Flame className="h-4 w-4" />
          <span className="text-sm font-semibold">{streak} in a row</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex flex-col items-center p-2 bg-green-50 rounded-md">
          <div className="flex items-center mb-1">
            <CheckCircle className="h-4 w-4 text-finance-green mr-1" />
            <span className="text-sm font-medium text-finance-green">Correct</span>
          </div>
          <span className="text-lg font-bold text-finance-green tabular-nums">{correctAnswers}</span>
        </div>

        <div className="flex flex-col items-center p-2 bg-red-50 rounded-md">
          <div className="flex items-center mb-1">
            <XCircle className="h-4 w-4 text-finance-red mr-1" />
            <span className="text-sm font-medium text-finance-red">Wrong</span>
          </div>
          <span className="text-lg font-bold text-finance-red tabular-nums">{wrongAnswers}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-finance-gray">Progress</span>
            <span className="font-medium tabular-nums">
              {Math.min(questionNumber, totalQuestions)} / {totalQuestions}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-finance-blue rounded-full transition-all duration-300 ease-out"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-finance-gray">Accuracy</span>
            <span className="font-medium tabular-nums">{Math.round(accuracy)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300 ease-out",
                accuracy >= 80
                  ? "bg-finance-green"
                  : accuracy >= 50
                    ? "bg-finance-yellow"
                    : "bg-finance-red"
              )}
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </div>

        {bestStreak > 0 && (
          <p className="text-xs text-gray-500 text-center pt-1">
            Best streak this run: <span className="font-medium">{bestStreak}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default ScoreBoard;
