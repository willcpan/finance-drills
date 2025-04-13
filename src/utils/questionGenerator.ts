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

export interface Question {
  id: string;
  text: string;
  stockData: StockData;
  correctAnswer: number;
  type: QuestionType;
  difficulty: DifficultyLevel;
  allowedErrorMargin: number;
}

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Helper function to generate a random integer within a range
const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Function to generate a price increase question
const generatePriceIncreaseQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  let percentage: number;
  let allowedErrorMargin: number;
  
  switch (difficulty) {
    case "easy":
      percentage = getRandomInt(5, 10);
      allowedErrorMargin = 0.1;
      break;
    case "medium":
      percentage = getRandomInt(12, 25);
      allowedErrorMargin = 0.05;
      break;
    case "hard":
      percentage = getRandomInt(8, 33) / 2; // Create non-integer percentages for hard
      allowedErrorMargin = 0.02;
      break;
    default:
      percentage = 10;
      allowedErrorMargin = 0.1;
  }
  
  const percentageFormatted = percentage.toFixed(difficulty === "hard" ? 1 : 0);
  const correctAnswer = roundToTwoDecimals(stock.currentPrice * (1 + percentage / 100));
  
  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If the current stock price of ${stock.ticker} (${stock.companyName}) is $${stock.currentPrice.toFixed(2)} and it increases by ${percentageFormatted}%, what is the new price?`,
    stockData: stock,
    correctAnswer,
    type: "priceIncrease",
    difficulty,
    allowedErrorMargin
  };
};

// Function to generate a percentage change question
const generatePercentageChangeQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  const percentageChange = ((stock.currentPrice - stock.previousClose) / stock.previousClose) * 100;
  const percentageChangeRounded = roundToTwoDecimals(percentageChange);
  
  let allowedErrorMargin: number;
  
  switch (difficulty) {
    case "easy":
      allowedErrorMargin = 0.2;
      break;
    case "medium":
      allowedErrorMargin = 0.1;
      break;
    case "hard":
      allowedErrorMargin = 0.05;
      break;
    default:
      allowedErrorMargin = 0.2;
  }
  
  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If ${stock.ticker} (${stock.companyName}) had a previous closing price of $${stock.previousClose.toFixed(2)} and the current price is $${stock.currentPrice.toFixed(2)}, what is the approximate percentage change?`,
    stockData: stock,
    correctAnswer: percentageChangeRounded,
    type: "percentageChange",
    difficulty,
    allowedErrorMargin
  };
};

// Function to generate a dividend yield question
const generateDividendYieldQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  // Skip stocks with no dividends
  if (stock.dividendYield === 0 && gameStockData.length > 0) {
    // Find a different stock with dividends
    const stocksWithDividends = gameStockData.filter(s => s.dividendYield > 0);
    // Only switch if there are stocks with dividends available
    if (stocksWithDividends.length > 0) {
        stock = stocksWithDividends[getRandomInt(0, stocksWithDividends.length - 1)];
    }
  }
  
  let allowedErrorMargin: number;
  
  switch (difficulty) {
    case "easy":
      allowedErrorMargin = 0.1;
      break;
    case "medium":
      allowedErrorMargin = 0.05;
      break;
    case "hard":
      allowedErrorMargin = 0.02;
      break;
    default:
      allowedErrorMargin = 0.1;
  }
  
  const correctAnswer = roundToTwoDecimals(stock.dividendPerShare);
  
  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If the dividend yield of ${stock.ticker} (${stock.companyName}) is ${stock.dividendYield.toFixed(2)}% and the current stock price is $${stock.currentPrice.toFixed(2)}, what is the approximate annual dividend per share?`,
    stockData: stock,
    correctAnswer,
    type: "dividendYield",
    difficulty,
    allowedErrorMargin
  };
};

// Function to generate a dividend per share question
const generateDividendPerShareQuestion = (stock: StockData, difficulty: DifficultyLevel): Question => {
  // Skip stocks with no dividends
  if (stock.dividendPerShare === 0 && gameStockData.length > 0) {
    // Find a different stock with dividends
    const stocksWithDividends = gameStockData.filter(s => s.dividendPerShare > 0);
    // Only switch if there are stocks with dividends available
    if (stocksWithDividends.length > 0) {
        stock = stocksWithDividends[getRandomInt(0, stocksWithDividends.length - 1)];
    }
  }
  
  let allowedErrorMargin: number;
  
  switch (difficulty) {
    case "easy":
      allowedErrorMargin = 0.1;
      break;
    case "medium":
      allowedErrorMargin = 0.05;
      break;
    case "hard":
      allowedErrorMargin = 0.02;
      break;
    default:
      allowedErrorMargin = 0.1;
  }
  
  const correctAnswer = roundToTwoDecimals((stock.dividendPerShare / stock.currentPrice) * 100);
  
  return {
    id: Math.random().toString(36).substring(2, 9),
    text: `If the annual dividend per share of ${stock.ticker} (${stock.companyName}) is $${stock.dividendPerShare.toFixed(2)} and the current stock price is $${stock.currentPrice.toFixed(2)}, what is the approximate dividend yield?`,
    stockData: stock,
    correctAnswer,
    type: "dividendPerShare",
    difficulty,
    allowedErrorMargin
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
      allowedErrorMargin: 1
    };
  }

  // Get a random stock
  let randomStock = gameStockData[getRandomInt(0, gameStockData.length - 1)];
  
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
      // Ensure the selected stock is suitable for dividend yield questions
      if (randomStock.dividendYield === 0) {
        const suitableStocks = gameStockData.filter(s => s.dividendYield > 0);
        if (suitableStocks.length > 0) {
          randomStock = suitableStocks[getRandomInt(0, suitableStocks.length - 1)];
        } else {
          // Fallback if NO stocks have dividends
          return generatePriceIncreaseQuestion(randomStock, difficulty);
        }
      }
      return generateDividendYieldQuestion(randomStock, difficulty);
    case "dividendPerShare":
       // Ensure the selected stock is suitable for dividend per share questions
      if (randomStock.dividendPerShare === 0) {
        const suitableStocks = gameStockData.filter(s => s.dividendPerShare > 0);
         if (suitableStocks.length > 0) {
          randomStock = suitableStocks[getRandomInt(0, suitableStocks.length - 1)];
        } else {
           // Fallback if NO stocks have dividends
          return generatePercentageChangeQuestion(randomStock, difficulty);
        }
      }
      return generateDividendPerShareQuestion(randomStock, difficulty);
    default:
      return generatePriceIncreaseQuestion(randomStock, difficulty);
  }
};

// Function to check if the user's answer is correct (with a margin of error)
export const checkAnswer = (question: Question, userAnswer: number): boolean => {
  const errorMargin = question.correctAnswer * question.allowedErrorMargin;
  return Math.abs(userAnswer - question.correctAnswer) <= errorMargin;
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
