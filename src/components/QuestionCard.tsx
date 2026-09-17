import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QUESTION_META, type Question } from "@/utils/questionGenerator";
import { formatAnswer, formatDuration, unitSuffix } from "@/utils/format";

interface QuestionCardProps {
  question: Question;
  revealed: boolean;
  wasCorrect: boolean;
  userAnswer: number | null;
  elapsedMs: number;
  onAnswer: (answer: number) => void;
  onNext: () => void;
  isLast: boolean;
}

const difficultyBadge = (difficulty: Question["difficulty"]): string => {
  switch (difficulty) {
    case "easy":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-red-100 text-red-800";
  }
};

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  revealed,
  wasCorrect,
  userAnswer,
  elapsedMs,
  onAnswer,
  onNext,
  isLast,
}) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Clear and refocus whenever a new question arrives.
  useEffect(() => {
    setValue("");
    inputRef.current?.focus();
  }, [question.id]);

  // Once the answer is showing, move focus to Continue so Enter carries the
  // player straight on. A drill should never need the mouse.
  useEffect(() => {
    if (revealed) nextRef.current?.focus();
  }, [revealed]);

  const submit = () => {
    if (revealed) return;

    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) onAnswer(parsed);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submit();
  };

  // Space submits as well as Enter. Every answer is a number, so a space can
  // never be part of one, and on a drill scored by speed the nearer key wins.
  // preventDefault stops the keystroke reaching the input, and stops a space
  // held down from scrolling the page.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    submit();
  };

  const meta = QUESTION_META[question.type];
  const suffix = unitSuffix(question.answerUnit);

  return (
    <div
      className={cn(
        "bg-white rounded-lg shadow-md p-6 transition-colors duration-200 border-2",
        revealed
          ? wasCorrect
            ? "border-finance-green"
            : "border-finance-red"
          : "border-transparent"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="font-medium text-finance-gray">{meta.label}</span>
        <span className={cn("text-xs font-medium px-2 py-1 rounded-full", difficultyBadge(question.difficulty))}>
          {question.difficulty}
        </span>
      </div>

      <h2 className="text-lg font-semibold text-finance-blue mb-6 leading-relaxed">
        {question.text}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="answer" className="block text-sm font-medium text-gray-700 mb-1">
            Your answer
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm font-medium pointer-events-none">
              {suffix}
            </span>
            <Input
              ref={inputRef}
              id="answer"
              type="number"
              step="any"
              inputMode="decimal"
              autoComplete="off"
              placeholder={revealed ? "" : "Type a number, press Enter or Space"}
              value={value}
              onChange={event => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10"
              disabled={revealed}
            />
          </div>
        </div>

        {!revealed && (
          <Button type="submit" className="w-full bg-finance-blue hover:bg-blue-800 text-white" disabled={value === ""}>
            Submit
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </form>

      {revealed && (
        <div className="mt-5 space-y-4 animate-fade-in">
          <div
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg",
              wasCorrect ? "bg-green-50" : "bg-red-50"
            )}
          >
            {wasCorrect ? (
              <Check className="h-5 w-5 text-finance-green shrink-0 mt-0.5" />
            ) : (
              <X className="h-5 w-5 text-finance-red shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className={cn("font-semibold", wasCorrect ? "text-finance-green" : "text-finance-red")}>
                {wasCorrect
                  ? `Correct in ${formatDuration(elapsedMs)}`
                  : userAnswer === null
                    ? "Out of time"
                    : `Not quite - you said ${formatAnswer(userAnswer, question.answerUnit)}`}
              </p>
              <p className="text-gray-600 mt-0.5">
                Answer: {formatAnswer(question.correctAnswer, question.answerUnit)}
                <span className="text-gray-400">
                  {" "}
                  (within {formatAnswer(question.tolerance, question.answerUnit)})
                </span>
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50">
            <h3 className="flex items-center text-sm font-semibold text-finance-blue mb-2">
              <Lightbulb className="h-4 w-4 mr-2" />
              Doing it in your head
            </h3>
            <ol className="space-y-1.5">
              {question.method.map((step, index) => (
                <li key={index} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-finance-blue font-semibold shrink-0">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <Button
            ref={nextRef}
            onClick={onNext}
            className="w-full bg-finance-green hover:bg-teal-700 text-white"
          >
            {isLast ? "See results" : "Next question"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-center text-xs text-gray-400">Press Enter to continue</p>
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
