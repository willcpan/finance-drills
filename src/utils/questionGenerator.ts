// Define the structure for stock data here, as it's no longer imported
// This should match the structure being created in vite.config.ts
interface StockData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  previousClose: number;
  dividendYield: number;
  dividendPerShare: number;
}

// Access the globally injected stock data from vite.config.ts
declare const __GAME_STOCK_DATA__: StockData[];
const gameStockData: StockData[] = __GAME_STOCK_DATA__ || []; // Use || [] as fallback

export type QuestionType =
  | "priceIncrease"
  | "percentageChange"
  | "dividendYield"
  | "dividendPerShare";

export type DifficultyLevel = "easy" | "medium" | "hard";

// What unit the answer is expressed in. This drives the tolerance rules below
// and the currency/percent affordances in QuestionCard, which used to infer the
// unit from the question type and only happened to land on the right one.
export type AnswerUnit = "currency" | "percentagePoints";

export interface Question {
  id: string;
  text: string;
  stockData: StockData;
  correctAnswer: number;
  type: QuestionType;
  difficulty: DifficultyLevel;
  answerUnit: AnswerUnit;
  // Absolute tolerance, in the same units as correctAnswer.
  tolerance: number;
}

// Tolerances are absolute and expressed in the answer's own units. Two rules
// shape the numbers below:
//
// 1. A price tolerance has to stay well under the smallest move we ask about
//    (5%). If the margin is wider than the move itself, the price already
//    printed in the question falls inside it, and the player scores by retyping
//    that number without doing any arithmetic.
// 2. Percentage-point answers get a flat tolerance rather than a fraction of the
//    answer. A percentage change is often near zero and is negative about half
//    the time; scaling by the answer either collapses the tolerance to nothing
//    or makes it negative, which no answer can satisfy.
const PRICE_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.01,
  medium: 0.005,
  hard: 0.0025
};

// In percentage points: 0.25 means "within a quarter of a point".
const PERCENTAGE_POINT_TOLERANCE: Record<DifficultyLevel, number> = {
  easy: 0.25,
  medium: 0.15,
  hard: 0.05
};

// Dividend amounts are small, so mental arithmetic error is proportionally
// larger than it is on a share price. These stay fractional, but never fall
// below a cent.
const DIVIDEND_TOLERANCE_FRACTION: Record<DifficultyLevel, number> = {
  easy: 0.05,
  medium: 0.03,
  hard: 0.015
};

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Helper function to generate a random integer within a range
const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const priceTolerance = (price: number, difficulty: DifficultyLevel): number => {
  return Math.max(0.02, Math.abs(price) * PRICE_TOLERANCE_FRACTION[difficulty]);
};

const dividendTolerance = (amount: number, difficulty: DifficultyLevel): number => {
  return Math.max(0.01, Math.abs(amount) * DIVIDEND_TOLERANCE_FRACTION[difficulty]);
};

// Both dividend questions need a stock that actually pays one. Yield is derived
// from the per-share amount, so a single check covers both.
const withDividend = (stock: StockData): StockData => {
  if (stock.dividendPerShare > 0) return stock;

  const payers = gameStockData.filter(s => s.dividendPerShare > 0);
  return payers.length > 0 ? payers[getRandomInt(0, payers.length - 1)] : stock;
};

// Function to generate a price increase question
const generatePriceIncreaseQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  let percentage: number;

  switch (difficulty) {
    case "easy":
      percentage = getRandomInt(5, 10);
      break;
    case "medium":
      percentage = getRandomInt(12, 25);
      break;
    case "hard":
      percentage = getRandomInt(8, 33) / 2; // Create non-integer percentages for hard
      break;
    default:
      percentage = 10;
  }

  const percentageFormatted = percentage.toFixed(difficulty === "hard" ? 1 : 0);
  const correctAnswer = roundToTwoDecimals(stock.currentPrice * (1 + percentage / 100));

  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If the current stock price of ${stock.ticker} is $${stock.currentPrice.toFixed(2)} and it increases by ${percentageFormatted}%, what is the new price?`,
    stockData: stock,
    correctAnswer,
    type: "priceIncrease",
    difficulty,
    answerUnit: "currency",
    tolerance: priceTolerance(stock.currentPrice, difficulty)
  };
};

// Function to generate a percentage change question
const generatePercentageChangeQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const percentageChange = ((stock.currentPrice - stock.previousClose) / stock.previousClose) * 100;
  const percentageChangeRounded = roundToTwoDecimals(percentageChange);

  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If ${stock.ticker} had a previous closing price of $${stock.previousClose.toFixed(2)} and the current price is $${stock.currentPrice.toFixed(2)}, what is the approximate percentage change?`,
    stockData: stock,
    correctAnswer: percentageChangeRounded,
    type: "percentageChange",
    difficulty,
    answerUnit: "percentagePoints",
    tolerance: PERCENTAGE_POINT_TOLERANCE[difficulty]
  };
};

// Gives the yield and the price, asks for the annual dividend per share.
const generateDividendPerShareQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const payer = withDividend(stock);
  const correctAnswer = roundToTwoDecimals(payer.dividendPerShare);

  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If the dividend yield of ${payer.ticker} is ${payer.dividendYield.toFixed(2)}% and the current stock price is $${payer.currentPrice.toFixed(2)}, what is the approximate annual dividend per share?`,
    stockData: payer,
    correctAnswer,
    type: "dividendPerShare",
    difficulty,
    answerUnit: "currency",
    tolerance: dividendTolerance(correctAnswer, difficulty)
  };
};

// Gives the dividend per share and the price, asks for the yield.
const generateDividendYieldQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const payer = withDividend(stock);
  const correctAnswer = roundToTwoDecimals((payer.dividendPerShare / payer.currentPrice) * 100);

  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If the annual dividend per share of ${payer.ticker} is $${payer.dividendPerShare.toFixed(2)} and the current stock price is $${payer.currentPrice.toFixed(2)}, what is the approximate dividend yield?`,
    stockData: payer,
    correctAnswer,
    type: "dividendYield",
    difficulty,
    answerUnit: "percentagePoints",
    tolerance: PERCENTAGE_POINT_TOLERANCE[difficulty]
  };
};

// Main function to generate a question
export const generateQuestion = (type?: QuestionType, difficulty: DifficultyLevel = "easy"): Question => {
  // Handle case where gameStockData might be empty (e.g., CSV read error)
  if (gameStockData.length === 0) {
    console.error("No stock data available to generate questions.");
    // Return a fallback dummy question or throw an error
    return {
      id: 'error-no-data',
      text: 'Error: Could not load stock data.',
      stockData: { ticker: 'ERR', companyName: 'Error', currentPrice: 0, previousClose: 0, dividendYield: 0, dividendPerShare: 0 },
      correctAnswer: 0,
      type: 'priceIncrease',
      difficulty: 'easy',
      answerUnit: 'currency',
      tolerance: 1
    };
  }

  // Get a random stock
  const randomStock = gameStockData[getRandomInt(0, gameStockData.length - 1)];

  // If no type is specified, choose a random type
  if (!type) {
    const questionTypes: QuestionType[] = ["priceIncrease", "percentageChange", "dividendYield", "dividendPerShare"];
    type = questionTypes[getRandomInt(0, questionTypes.length - 1)];
  }

  switch (type) {
    case "priceIncrease":
      return generatePriceIncreaseQuestion(randomStock, difficulty);
    case "percentageChange":
      return generatePercentageChangeQuestion(randomStock, difficulty);
    case "dividendYield":
      return generateDividendYieldQuestion(randomStock, difficulty);
    case "dividendPerShare":
      return generateDividendPerShareQuestion(randomStock, difficulty);
    default:
      return generatePriceIncreaseQuestion(randomStock, difficulty);
  }
};

// Function to check if the user's answer is correct (with a margin of error).
// The tolerance is absolute and already in the answer's units, so this is a
// straight comparison. It used to scale by the answer itself, which made every
// negative-answer question impossible to satisfy.
export const checkAnswer = (question: Question, userAnswer: number): boolean => {
  return Math.abs(userAnswer - question.correctAnswer) <= question.tolerance;
};

// Function to generate multiple questions
export const generateQuestions = (count: number, difficulty?: DifficultyLevel): Question[] => {
  const questions: Question[] = [];
  const types: QuestionType[] = ["priceIncrease", "percentageChange", "dividendYield", "dividendPerShare"];

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const questionDifficulty = difficulty || (i < count/3 ? "easy" : i < 2*count/3 ? "medium" : "hard");
    questions.push(generateQuestion(type, questionDifficulty as DifficultyLevel));
  }

  return questions;
};
