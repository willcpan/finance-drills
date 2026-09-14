import React, { useState } from "react";
import { Award, BarChart3, Check, ChevronDown, ChevronUp, Flame, RefreshCw, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { accuracy, breakdownByType, type AnswerRecord, type GameConfig } from "@/utils/gameEngine";
import { QUESTION_META } from "@/utils/questionGenerator";
import { formatAnswer, formatDuration } from "@/utils/format";
import { median, type Stats } from "@/utils/stats";

interface ResultScreenProps {
  answers: AnswerRecord[];
  score: number;
  bestStreak: number;
  config: GameConfig;
  stats: Stats;
  onPlayAgain: () => void;
  onChangeSettings: () => void;
}

const Stat: React.FC<{ label: string; value: string; accent?: string }> = ({
  label,
  value,
  accent,
}) => (
  <div className="text-center">
    <span className={cn("block text-2xl font-bold", accent ?? "text-finance-blue")}>{value}</span>
    <span className="text-xs text-gray-500">{label}</span>
  </div>
);

const ResultScreen: React.FC<ResultScreenProps> = ({
  answers,
  score,
  bestStreak,
  config,
  stats,
  onPlayAgain,
  onChangeSettings,
}) => {
  const [showReview, setShowReview] = useState(false);

  const correct = answers.filter(a => a.correct).length;
  const accuracyPct = accuracy(answers);
  const medianMs = median(answers.map(a => a.ms));
  const breakdown = breakdownByType(answers);

  // stats already includes this run, so a tie means the record was just set.
  const isBestScore = score > 0 && score >= stats.bestScore;
  const isBestStreak = bestStreak > 0 && bestStreak >= stats.bestStreak;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-finance-blue mb-1 flex items-center">
        <BarChart3 className="mr-2 h-6 w-6 text-finance-green" />
        Run complete
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        {answers.length} questions · {config.difficulty} ·{" "}
        {config.timed ? `${config.secondsPerQuestion}s each` : "untimed"}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-blue-50 rounded-lg mb-4">
        <Stat label="Points" value={String(score)} />
        <Stat
          label="Accuracy"
          value={`${Math.round(accuracyPct)}%`}
          accent={
            accuracyPct >= 80
              ? "text-finance-green"
              : accuracyPct >= 50
                ? "text-finance-yellow"
                : "text-finance-red"
          }
        />
        <Stat label="Median time" value={formatDuration(medianMs)} />
        <Stat label="Best streak" value={String(bestStreak)} />
      </div>

      {(isBestScore || isBestStreak) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {isBestScore && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-finance-yellow bg-yellow-50 px-3 py-1.5 rounded-full">
              <Award className="h-4 w-4" />
              Personal best score
            </span>
          )}
          {isBestStreak && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-finance-yellow bg-yellow-50 px-3 py-1.5 rounded-full">
              <Flame className="h-4 w-4" />
              Longest streak yet
            </span>
          )}
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-sm font-semibold text-finance-blue mb-2">
          By question type
          <span className="font-normal text-gray-500"> - weakest first</span>
        </h3>
        <div className="space-y-2">
          {breakdown.map(row => {
            const pct = (row.correct / row.attempts) * 100;
            return (
              <div key={row.type} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-gray-700 truncate">
                  {QUESTION_META[row.type].label}
                </span>
                <div className="flex-grow h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct >= 80
                        ? "bg-finance-green"
                        : pct >= 50
                          ? "bg-finance-yellow"
                          : "bg-finance-red"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-gray-500 tabular-nums">
                  {row.correct}/{row.attempts} · {formatDuration(row.avgMs)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Button onClick={onPlayAgain} className="bg-finance-blue hover:bg-blue-800 text-white" size="lg">
          <RefreshCw className="mr-2 h-5 w-5" />
          Run it again
        </Button>
        <Button onClick={onChangeSettings} variant="outline" size="lg">
          Change settings
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowReview(prev => !prev)}
        className="flex items-center gap-1.5 text-sm font-medium text-finance-blue hover:underline"
      >
        {showReview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showReview ? "Hide" : "Review"} all {answers.length} questions
      </button>

      {showReview && (
        <ol className="mt-3 space-y-3 animate-fade-in">
          {answers.map((record, index) => (
            <li
              key={record.question.id}
              className={cn(
                "p-3 rounded-lg border-l-4",
                record.correct ? "border-finance-green bg-green-50" : "border-finance-red bg-red-50"
              )}
            >
              <div className="flex items-start gap-2">
                {record.correct ? (
                  <Check className="h-4 w-4 text-finance-green shrink-0 mt-1" />
                ) : (
                  <X className="h-4 w-4 text-finance-red shrink-0 mt-1" />
                )}
                <div className="min-w-0 flex-grow">
                  <p className="text-sm text-gray-800">
                    <span className="text-gray-400 mr-1.5">{index + 1}.</span>
                    {record.question.text}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Answer {formatAnswer(record.question.correctAnswer, record.question.answerUnit)}
                    {" · "}
                    you said{" "}
                    {record.userAnswer === null
                      ? "nothing (timed out)"
                      : formatAnswer(record.userAnswer, record.question.answerUnit)}
                    {" · "}
                    {formatDuration(record.ms)}
                    {record.points > 0 && (
                      <span className="text-finance-green font-medium"> · +{record.points}</span>
                    )}
                  </p>
                  {!record.correct && (
                    <p className="text-xs text-gray-600 mt-1.5 flex items-start gap-1.5">
                      <Zap className="h-3 w-3 shrink-0 mt-0.5 text-finance-blue" />
                      <span>{record.question.method.join(" ")}</span>
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default ResultScreen;
