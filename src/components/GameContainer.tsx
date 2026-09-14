
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Question, generateQuestions, checkAnswer, DifficultyLevel } from "@/utils/questionGenerator";
import QuestionCard from "./QuestionCard";
import Timer from "./Timer";
import ScoreBoard from "./ScoreBoard";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw, BarChart3, HelpCircle, Clock3 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GameContainerProps {
  initialQuestionCount?: number;
}

const POINTS_PER_QUESTION: Record<DifficultyLevel, number> = {
  "easy": 10,
  "medium": 20,
  "hard": 30
};

const GameContainer: React.FC<GameContainerProps> = ({ initialQuestionCount = 10 }) => {
  const [gameState, setGameState] = useState<"ready" | "playing" | "feedback" | "finished">("ready");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [questionCount, setQuestionCount] = useState(initialQuestionCount);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("easy");
  const [questionTimeLimit, setQuestionTimeLimit] = useState(30);
  const [feedbackState, setFeedbackState] = useState<"correct" | "incorrect" | null>(null);

  // Generate questions when starting a new game
  useEffect(() => {
    if (gameState === "ready") {
      const newQuestions = generateQuestions(questionCount, difficulty);
      setQuestions(newQuestions);
    }
  }, [gameState, questionCount, difficulty]);

  // Start a new game
  const startGame = () => {
    setGameState("playing");
    setCurrentQuestionIndex(0);
    setScore(0);
    setCorrectAnswers(0);
    setWrongAnswers(0);
    setFeedbackState(null);
    
    toast("Game started! Answer the questions within the time limit.", {
      description: `Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`,
      icon: <Play className="h-4 w-4 text-green-500" />,
    });
  };

  // Handle user's answer
  const handleAnswer = (userAnswer: number) => {
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = checkAnswer(currentQuestion, userAnswer);
    
    // Update scores
    if (isCorrect) {
      const pointsEarned = POINTS_PER_QUESTION[currentQuestion.difficulty];
      setScore(prevScore => prevScore + pointsEarned);
      setCorrectAnswers(prev => prev + 1);
      setFeedbackState("correct");
      
      toast.success(`Correct! +${pointsEarned} points`);
    } else {
      setWrongAnswers(prev => prev + 1);
      setFeedbackState("incorrect");
      
      toast.error("Incorrect answer");
    }
    
    // Show feedback for 1.5 seconds
    setGameState("feedback");
    
    setTimeout(() => {
      // Move to next question or end the game
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setFeedbackState(null);
        setGameState("playing");
      } else {
        setGameState("finished");
      }
    }, 2000);
  };

  // Handle time up for a question
  const handleTimeUp = () => {
    if (gameState !== "playing") return;
    
    setWrongAnswers(prev => prev + 1);
    setFeedbackState("incorrect");
    toast.error("Time's up!");
    
    // Show feedback for 1.5 seconds
    setGameState("feedback");
    
    setTimeout(() => {
      // Move to next question or end the game
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setFeedbackState(null);
        setGameState("playing");
      } else {
        setGameState("finished");
      }
    }, 2000);
  };

  // Restart the game
  const restartGame = () => {
    setGameState("ready");
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      {gameState === "ready" ? (
        <div className="bg-white rounded-lg shadow-md p-6 animate-fade-in">
          <h2 className="text-2xl font-bold text-finance-blue mb-6">Financial Math Whiz</h2>
          <p className="text-gray-600 mb-8">Test your mental math skills with financial data! Answer the questions correctly to earn points.</p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty
              </label>
              <Select
                value={difficulty}
                onValueChange={(value) => setDifficulty(value as DifficultyLevel)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-gray-500">
                {difficulty === "easy"
                  ? "Whole-number percentages, generous rounding."
                  : difficulty === "medium"
                  ? "Larger percentages, tighter rounding."
                  : "Fractional percentages, little room for error."}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Questions
              </label>
              <Select
                value={questionCount.toString()}
                onValueChange={(value) => setQuestionCount(parseInt(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select number of questions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 Questions</SelectItem>
                  <SelectItem value="10">10 Questions</SelectItem>
                  <SelectItem value="15">15 Questions</SelectItem>
                  <SelectItem value="20">20 Questions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time per Question
              </label>
              <Select
                value={questionTimeLimit.toString()}
                onValueChange={(value) => setQuestionTimeLimit(parseInt(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select time limit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 Seconds</SelectItem>
                  <SelectItem value="30">30 Seconds</SelectItem>
                  <SelectItem value="45">45 Seconds</SelectItem>
                  <SelectItem value="60">60 Seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button
            onClick={startGame}
            className="w-full bg-finance-green hover:bg-green-700 text-white"
            size="lg"
          >
            <Play className="mr-2 h-5 w-5" />
            Start Game
          </Button>
          
          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="flex items-center text-lg font-semibold text-finance-blue mb-2">
              <HelpCircle className="h-5 w-5 mr-2" />
              How to Play
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>You'll be presented with financial math questions one at a time.</li>
              <li>Calculate the answer mentally and enter it in the provided field.</li>
              <li>Answer within the time limit to earn points.</li>
              <li>Different difficulty levels award different points.</li>
              <li>Try to maximize your score!</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            {(gameState === "playing" || gameState === "feedback") && questions.length > 0 && (
              <div className="space-y-6 animate-slide-up">
                <div className="bg-white rounded-lg shadow-md p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-600 font-medium">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </span>
                    {/* Keyed on the question so each one gets a fresh timer.
                        Without this the component keeps its state across
                        questions and the limit becomes a whole-game budget. */}
                    <Timer
                      key={currentQuestionIndex}
                      duration={questionTimeLimit}
                      isRunning={gameState === "playing"}
                      onTimeUp={handleTimeUp}
                    />
                  </div>
                </div>
                
                <QuestionCard 
                  question={questions[currentQuestionIndex]}
                  onAnswer={handleAnswer}
                  isAnswering={gameState === "playing"}
                  feedbackState={feedbackState}
                />
              </div>
            )}
            
            {gameState === "finished" && (
              <div className="bg-white rounded-lg shadow-md p-6 animate-fade-in">
                <h2 className="text-2xl font-bold text-finance-blue mb-6 flex items-center">
                  <BarChart3 className="mr-2 h-6 w-6 text-finance-green" />
                  Game Complete!
                </h2>
                
                <div className="mb-6">
                  <p className="text-gray-600 mb-2">You've completed the quiz with the following results:</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-3xl font-bold text-finance-blue">{score}</span>
                      <span className="ml-2 text-gray-500">Points</span>
                    </div>
                    <div className="flex-grow border-t sm:border-l sm:border-t-0 border-gray-200 sm:pl-4 sm:ml-4 pt-4 sm:pt-0">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <span className="block text-2xl font-bold text-finance-green">{correctAnswers}</span>
                          <span className="text-sm text-gray-500">Correct</span>
                        </div>
                        <div className="text-center">
                          <span className="block text-2xl font-bold text-finance-red">{wrongAnswers}</span>
                          <span className="text-sm text-gray-500">Incorrect</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={restartGame}
                  className="w-full bg-finance-blue hover:bg-blue-700 text-white"
                  size="lg"
                >
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Play Again
                </Button>
                
                <div className="mt-6 p-4 border border-gray-200 rounded-lg">
                  <h3 className="text-lg font-semibold text-finance-blue mb-3">Performance Summary</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Accuracy Rate</span>
                        <span className="font-medium">
                          {correctAnswers + wrongAnswers > 0 
                            ? Math.round((correctAnswers / (correctAnswers + wrongAnswers)) * 100) 
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full">
                        <div 
                          className="h-full bg-finance-green rounded-full"
                          style={{ 
                            width: `${correctAnswers + wrongAnswers > 0 
                              ? Math.round((correctAnswers / (correctAnswers + wrongAnswers)) * 100) 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Difficulty Level</span>
                        <span className="font-medium">{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Time per Question</span>
                        <span className="font-medium flex items-center">
                          <Clock3 className="h-3 w-3 mr-1" />
                          {questionTimeLimit} seconds
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div>
            {(gameState === "playing" || gameState === "feedback" || gameState === "finished") && (
              <ScoreBoard
                score={score}
                totalQuestions={questions.length}
                correctAnswers={correctAnswers}
                wrongAnswers={wrongAnswers}
                className="sticky top-4"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameContainer;
