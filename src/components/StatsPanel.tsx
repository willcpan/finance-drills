import React from "react";
import { History, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUESTION_META, type QuestionType } from "@/utils/questionGenerator";
import { accuracyOf, averageMsOf, type Stats, type TypeStat } from "@/utils/stats";
import { formatDuration } from "@/utils/format";

interface StatsPanelProps {
  stats: Stats;
  onReset: () => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats, onReset }) => {
  if (stats.runs === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="flex items-center text-lg font-semibold text-finance-blue mb-2">
          <History className="h-5 w-5 mr-2" />
          Your record
        </h3>
        <p className="text-sm text-gray-500">
          Finish a run and your accuracy, speed and streaks start showing up here.
        </p>
      </div>
    );
  }

  const lifetimeAccuracy = stats.answered > 0 ? (stats.correct / stats.answered) * 100 : 0;
  const rows = (Object.entries(stats.byType) as [QuestionType, TypeStat][])
    .filter(([, stat]) => stat.attempts > 0)
    .sort((a, b) => accuracyOf(a[1]) - accuracyOf(b[1]));

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center text-lg font-semibold text-finance-blue">
          <History className="h-5 w-5 mr-2" />
          Your record
        </h3>
        <button
          type="button"
          onClick={onReset}
          title="Clear saved stats"
          className="text-gray-400 hover:text-finance-red transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-center">
        <div className="p-2 bg-blue-50 rounded-md">
          <span className="block text-lg font-bold text-finance-blue tabular-nums">
            {stats.bestScore}
          </span>
          <span className="text-xs text-gray-500">Best score</span>
        </div>
        <div className="p-2 bg-blue-50 rounded-md">
          <span className="block text-lg font-bold text-finance-blue tabular-nums">
            {stats.bestStreak}
          </span>
          <span className="text-xs text-gray-500">Best streak</span>
        </div>
        <div className="p-2 bg-gray-50 rounded-md">
          <span className="block text-lg font-bold text-finance-gray tabular-nums">
            {stats.runs}
          </span>
          <span className="text-xs text-gray-500">{stats.runs === 1 ? "Run" : "Runs"}</span>
        </div>
        <div className="p-2 bg-gray-50 rounded-md">
          <span className="block text-lg font-bold text-finance-gray tabular-nums">
            {Math.round(lifetimeAccuracy)}%
          </span>
          <span className="text-xs text-gray-500">Lifetime accuracy</span>
        </div>
      </div>

      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Weakest first
      </h4>
      <ul className="space-y-1.5">
        {rows.slice(0, 6).map(([type, stat]) => {
          const pct = accuracyOf(stat);
          return (
            <li key={type} className="flex items-center gap-2 text-sm">
              <span className="flex-grow truncate text-gray-700">{QUESTION_META[type].label}</span>
              <span className="text-xs text-gray-400 tabular-nums">
                {formatDuration(averageMsOf(stat))}
              </span>
              <span
                className={cn(
                  "w-10 text-right font-medium tabular-nums",
                  pct >= 80
                    ? "text-finance-green"
                    : pct >= 50
                      ? "text-finance-yellow"
                      : "text-finance-red"
                )}
              >
                {Math.round(pct)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default StatsPanel;
