import React, { useState, useRef, useEffect } from "react";
import { Question } from "@/utils/questionGenerator";
import { ArrowRight, TrendingUp, Percent, DollarSign, BadgeDollarSign, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  question: Question;
  onAnswer: (answer: number) => void;
  isAnswering: boolean;
  feedbackState?: "correct" | "incorrect" | null;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ 
  question, 
  onAnswer, 
  isAnswering,
  feedbackState 
}) => {
  const [userAnswer, setUserAnswer] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Set focus to input when question changes or when answering
  useEffect(() => {
    setUserAnswer(""); // Clear previous answer when question changes
    if (isAnswering && inputRef.current) {
      inputRef.current.focus();
    }
  }, [question, isAnswering]);

  // Function to handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAnswer || !isAnswering) return;

    const numericAnswer = parseFloat(userAnswer);
    if (!isNaN(numericAnswer)) {
      onAnswer(numericAnswer);
    }
  };

  // Get the appropriate icon for the question type
  const getQuestionIcon = () => {
    switch (question.type) {
      case "priceIncrease":
        return <TrendingUp className="h-5 w-5 text-finance-green mr-2" />;
      case "percentageChange":
        return <Percent className="h-5 w-5 text-finance-blue mr-2" />;
      case "dividendYield":
        return <BadgeDollarSign className="h-5 w-5 text-finance-green mr-2" />;
      case "dividendPerShare":
        return <DollarSign className="h-5 w-5 text-finance-yellow mr-2" />;
      default:
        return <Brain className="h-5 w-5 text-finance-blue mr-2" />;
    }
  };

  // Get difficulty badge styling
  const getDifficultyBadge = () => {
    const baseClasses = "text-xs font-medium px-2 py-1 rounded-full";
    
    switch (question.difficulty) {
      case "easy":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "medium":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case "hard":
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  return (
    <div className={cn(
      "bg-white rounded-lg shadow-md p-6 transition-all duration-300",
      feedbackState === "correct" ? "border-2 border-finance-green" : 
      feedbackState === "incorrect" ? "border-2 border-finance-red" : ""
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center">
          {getQuestionIcon()}
          <span className="font-medium text-gray-500">
            {question.type === "priceIncrease" ? "Price Increase" : 
             question.type === "percentageChange" ? "Percentage Change" : 
             question.type === "dividendYield" ? "Dividend Yield" : "Dividend Per Share"}
          </span>
        </div>
        <span className={getDifficultyBadge()}>
          {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
        </span>
      </div>
      
      <h2 className="text-lg font-semibold text-finance-blue mb-6">{question.text}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="answer" className="block text-sm font-medium text-gray-700 mb-1">
            Your Answer
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {question.type === "percentageChange" || question.type === "dividendPerShare" ? 
                <Percent className="h-5 w-5 text-gray-400" /> : 
                <DollarSign className="h-5 w-5 text-gray-400" />
              }
            </div>
            <Input
              ref={inputRef}
              id="answer"
              type="number"
              step="0.01"
              placeholder={question.type === "percentageChange" || question.type === "dividendPerShare" ? 
                "Enter percentage..." : "Enter amount..."}
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              className="pl-10"
              disabled={!isAnswering || feedbackState !== null}
            />
          </div>
          {feedbackState && (
            <p className={cn(
              "mt-2 text-sm font-medium",
              feedbackState === "correct" ? "text-finance-green" : "text-finance-red"
            )}>
              {feedbackState === "correct" ? 
                `Correct! The answer is ${question.correctAnswer.toFixed(2)}${question.type === "percentageChange" || question.type === "dividendPerShare" ? "%" : ""}` : 
                `Incorrect. The correct answer is ${question.correctAnswer.toFixed(2)}${question.type === "percentageChange" || question.type === "dividendPerShare" ? "%" : ""}`}
            </p>
          )}
        </div>
        
        <Button 
          type="submit" 
          className="w-full bg-finance-blue hover:bg-blue-800 text-white"
          disabled={!isAnswering || feedbackState !== null || !userAnswer}
        >
          Submit Answer
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

export default QuestionCard;
