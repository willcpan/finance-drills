import React from "react";
import { Gauge, HelpCircle, Play, Target, Timer as TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GameConfig, DifficultySetting } from "@/utils/gameEngine";
import {
  ALL_QUESTION_TYPES,
  CATEGORY_META,
  QUESTION_META,
  type QuestionCategory,
  type QuestionType,
} from "@/utils/questionGenerator";
import { weakestType, type Stats } from "@/utils/stats";
import { pricesAsOf, stocks } from "@/utils/stockData";

interface SetupScreenProps {
  config: GameConfig;
  stats: Stats;
  onChange: (patch: Partial<GameConfig>) => void;
  onStart: () => void;
}

const CATEGORIES = Object.keys(CATEGORY_META) as QuestionCategory[];

const typesInCategory = (category: QuestionCategory): QuestionType[] =>
  ALL_QUESTION_TYPES.filter(type => QUESTION_META[type].category === category);

const SetupScreen: React.FC<SetupScreenProps> = ({ config, stats, onChange, onStart }) => {
  const selected = new Set(config.types);
  const weakest = weakestType(stats);

  const toggleCategory = (category: QuestionCategory) => {
    const types = typesInCategory(category);
    const allOn = types.every(type => selected.has(type));
    const next = new Set(selected);

    for (const type of types) {
      if (allOn) next.delete(type);
      else next.add(type);
    }

    // Never leave the player with nothing to answer.
    if (next.size === 0) return;
    onChange({ types: [...next] });
  };

  const priceDate = React.useMemo(() => {
    if (!pricesAsOf) return null;
    const parsed = new Date(pricesAsOf);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }, []);

  const focusOnWeakest = () => {
    if (weakest) onChange({ types: [weakest] });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-finance-blue mb-1">Finance Drills</h2>
      <p className="text-gray-600 mb-2">
        Mental arithmetic on {ALL_QUESTION_TYPES.length} kinds of question, drawn from real company
        figures. Answer fast, then read the shortcut.
      </p>
      <p className="text-xs text-gray-500 mb-6">
        {stocks.length} companies{priceDate ? ` · prices as of ${priceDate}` : ""}
      </p>

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
            <Gauge className="h-4 w-4 mr-1.5" />
            Difficulty
          </label>
          <Select
            value={config.difficulty}
            onValueChange={value => onChange({ difficulty: value as DifficultySetting })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
              <SelectItem value="adaptive">Adaptive</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-gray-500">
            {config.difficulty === "easy"
              ? "Whole-number percentages, generous rounding."
              : config.difficulty === "medium"
                ? "Larger percentages, tighter rounding."
                : config.difficulty === "hard"
                  ? "Fractional percentages, little room for error."
                  : "Moves up when you get three right, down when you miss two."}
          </p>
        </div>

        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
            <Target className="h-4 w-4 mr-1.5" />
            Questions
          </label>
          <Select
            value={String(config.questionCount)}
            onValueChange={value => onChange({ questionCount: parseInt(value, 10) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 30].map(count => (
                <SelectItem key={count} value={String(count)}>
                  {count} questions
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
            <TimerIcon className="h-4 w-4 mr-1.5" />
            Time per question
          </label>
          <Select
            value={config.timed ? String(config.secondsPerQuestion) : "off"}
            onValueChange={value =>
              value === "off"
                ? onChange({ timed: false })
                : onChange({ timed: true, secondsPerQuestion: parseInt(value, 10) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 15, 30, 45, 60].map(seconds => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {seconds} seconds
                </SelectItem>
              ))}
              <SelectItem value="off">Practice (untimed)</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-gray-500">
            {config.timed ? "Answer faster to score more." : "No clock, no speed bonus."}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-sm font-medium text-gray-700">What to practise</span>
          {weakest && (
            <button
              type="button"
              onClick={focusOnWeakest}
              className="text-xs font-medium text-finance-blue hover:underline"
            >
              Drill my weakest: {QUESTION_META[weakest].label}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => {
            const types = typesInCategory(category);
            const active = types.every(type => selected.has(type));
            const partial = !active && types.some(type => selected.has(type));

            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={active}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  active
                    ? "bg-finance-blue text-white border-finance-blue"
                    : partial
                      ? "bg-blue-50 text-finance-blue border-finance-blue"
                      : "bg-white text-gray-600 border-gray-300 hover:border-finance-blue"
                )}
              >
                {CATEGORY_META[category].label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {config.types.length} of {ALL_QUESTION_TYPES.length} question types selected.
        </p>
      </div>

      <Button
        onClick={onStart}
        className="w-full bg-finance-green hover:bg-teal-700 text-white"
        size="lg"
      >
        <Play className="mr-2 h-5 w-5" />
        Start
      </Button>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="flex items-center text-sm font-semibold text-finance-blue mb-2">
          <HelpCircle className="h-4 w-4 mr-2" />
          How it works
        </h3>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          <li>Work each answer out in your head, type it, press Enter or Space.</li>
          <li>Close is good enough - each question shows the margin it allows.</li>
          <li>After every answer you get the shortcut, worked through.</li>
          <li>Speed and streaks both add points, so keep moving.</li>
        </ul>
      </div>
    </div>
  );
};

export default SetupScreen;
