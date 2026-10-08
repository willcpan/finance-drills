import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QUESTION_META, type Question } from "@/utils/questionGenerator";
import { formatAnswer, formatDuration, unitSuffix } from "@/utils/format";
import { focusAnswer } from "@/utils/keyboard";

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

// A tap on the card continues, but not one that lands just as the answer
// appears: a tap meant for Submit as the timer runs out would otherwise skip
// straight past the explanation.
const TAP_GUARD_MS = 400;

// Phone-sized screens, where the on-screen keyboard takes half the height.
// matchMedia is absent in jsdom, so this is simply false under test.
const isSmallScreen = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767px)").matches;

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
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const revealedAt = useRef(0);

  // On a phone the keyboard covers the bottom half of the screen, and iOS
  // scrolls only far enough to show the input - leaving the start of the
  // question above the top edge. Pinning the card's top to the top of the
  // screen keeps the whole question and the input in view together.
  const alignCard = useCallback(() => {
    const card = cardRef.current;
    if (!card || !isSmallScreen()) return;
    const top = card.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, top) });
  }, []);

  // The keyboard opening or closing resizes the visual viewport; realign once
  // it has settled.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(alignCard, 60);
    };

    viewport.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener("resize", onResize);
    };
  }, [alignCard]);

  // Clear and refocus whenever a new question arrives - but on a phone only
  // where the keyboard can come up with it (see utils/keyboard.ts).
  useEffect(() => {
    setValue("");
    focusAnswer(inputRef.current);
    alignCard();
  }, [question.id, alignCard]);

  // Once the answer is showing, move focus to Continue so Enter carries the
  // player straight on. A drill should never need the mouse. On a phone this
  // also drops the keyboard, so the worked method has the whole screen.
  useEffect(() => {
    if (!revealed) return;
    revealedAt.current = Date.now();
    nextRef.current?.focus({ preventScroll: true });
    alignCard();
  }, [revealed, alignCard]);

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

  // iOS only raises the keyboard for a focus made inside a tap, so the input
  // is focused here, in the same tap that moves on. It is read-only while the
  // answer shows, and iOS raises no keyboard for a read-only input either -
  // so it is made editable first, ahead of React's own re-render.
  const advance = () => {
    const input = inputRef.current;
    if (!isLast && input) {
      input.readOnly = false;
      input.focus({ preventScroll: true });
    }
    onNext();
  };

  const handleCardTap = () => {
    if (!revealed || Date.now() - revealedAt.current < TAP_GUARD_MS) return;
    // Selecting text to copy a figure is not a request to move on.
    if (window.getSelection?.()?.toString()) return;
    advance();
  };

  const meta = QUESTION_META[question.type];
  const suffix = unitSuffix(question.answerUnit);

  return (
    <div
      ref={cardRef}
      onClick={revealed ? handleCardTap : undefined}
      className={cn(
        "bg-white rounded-lg shadow-md p-4 md:p-6 transition-colors duration-200 border-2",
        revealed
          ? cn("cursor-pointer pb-28 md:pb-6", wasCorrect ? "border-finance-green" : "border-finance-red")
          : "border-transparent"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 md:mb-4">
        <span className="text-sm md:text-base font-medium text-finance-gray">{meta.label}</span>
        <span className={cn("text-xs font-medium px-2 py-1 rounded-full", difficultyBadge(question.difficulty))}>
          {question.difficulty}
        </span>
      </div>

      <h2 className="text-lg font-semibold text-finance-blue mb-4 md:mb-6 leading-snug md:leading-relaxed">
        {question.text}
      </h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        {/* The input and Submit share a row, so on a phone the button sits
            right above the keyboard - whose decimal pad has no return key,
            which makes Submit the only way to answer. */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
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
              placeholder={revealed ? "" : "Your answer"}
              value={value}
              onChange={event => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setTimeout(alignCard, 350)}
              className="pl-11 h-14 text-lg md:text-lg"
              readOnly={revealed}
              aria-disabled={revealed}
            />
          </div>
          {!revealed && (
            <Button
              type="submit"
              className="h-14 px-6 text-base bg-finance-blue hover:bg-blue-800 text-white shrink-0"
              disabled={value === ""}
            >
              Submit
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
        {!revealed && (
          <p className="mt-1.5 text-xs text-gray-400">
            {/* Answers are judged on size alone (see checkAnswer), which
                matters most on a phone: the numeric keypad often has no
                minus key. */}
            {question.answerUnit === "percentagePoints" && "No minus sign needed - a fall of 4.2% is just 4.2. "}
            <span className="hidden md:inline">Enter or Space submits.</span>
          </p>
        )}
      </form>

      {revealed && (
        <div className="mt-4 space-y-4 animate-fade-in">
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

          {/* On a phone, Continue is a full-width bar pinned to the bottom of
              the screen, where a thumb already is; the card's bottom padding
              keeps it from covering the method. */}
          <div className="fixed inset-x-0 bottom-0 z-20 bg-white border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:z-auto md:bg-transparent md:border-0 md:p-0">
            <Button
              ref={nextRef}
              onClick={event => {
                // The card would otherwise take the same tap and move on twice.
                event.stopPropagation();
                advance();
              }}
              className="w-full h-14 text-lg bg-finance-green hover:bg-teal-700 text-white"
            >
              {isLast ? "See results" : "Next question"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-center text-xs text-gray-400 mt-1.5">
              <span className="md:hidden">or tap anywhere on the card</span>
              <span className="hidden md:inline">Press Enter to continue</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
