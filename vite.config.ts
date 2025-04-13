import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from 'fs'; 
import Papa from 'papaparse'; 
import { componentTagger } from "lovable-tagger";

// Define the structure for the stock data (matching questionGenerator's needs)
interface StockData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  previousClose: number;
  dividendYield: number;
  dividendPerShare: number;
}

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Helper function to calculate a plausible previous close price
const calculatePreviousClose = (currentPrice: number): number => {
  const variation = (Math.random() * 0.04) - 0.02; // +/- 2% variation
  const prevClose = currentPrice * (1 + variation);
  return roundToTwoDecimals(Math.max(0.01, prevClose)); // Ensure it's not zero or negative
};

// Helper function to calculate dividend yield
const calculateDividendYield = (dividendPerShare: number, currentPrice: number): number => {
  if (currentPrice === 0) return 0;
  return roundToTwoDecimals((dividendPerShare / currentPrice) * 100);
};

// Function to load and process stock data from CSV
function loadStockData(): StockData[] {
  try {
    const csvFilePath = path.resolve(__dirname, 'Stockdata.csv');
    const csvFileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    const parsed = Papa.parse<any>(csvFileContent, {
      header: true, // Assumes first row is header
      skipEmptyLines: true,
      dynamicTyping: (header: string | number) => {
        // Attempt to auto-type numeric fields, check header names
        return ['Stock Price', 'EPS', 'Annual Dividend'].includes(header.toString());
      },
    });

    if (parsed.errors.length > 0) {
      console.error('Error parsing Stockdata.csv:', parsed.errors);
      return []; // Return empty array on parse error
    }

    // Process the parsed data
    return parsed.data.map((row: any): StockData => {
      const currentPrice = parseFloat(row['Stock Price']) || 0;
      const dividendPerShare = parseFloat(row['Annual Dividend']) || 0;
      
      // Handle potential 'B' or 'M' in Revenue/Operating Profit if needed in future
      // For now, we focus on the fields used by the question generator

      return {
        ticker: row['Ticker'] || 'N/A',
        companyName: row['Ticker'] || 'N/A', // Placeholder company name
        currentPrice: roundToTwoDecimals(currentPrice),
        previousClose: calculatePreviousClose(currentPrice),
        dividendYield: calculateDividendYield(dividendPerShare, currentPrice),
        dividendPerShare: roundToTwoDecimals(dividendPerShare),
      };
    }).filter(stock => stock.ticker !== 'N/A' && stock.currentPrice > 0); // Filter out invalid entries

  } catch (error) {
    console.error('Error reading or processing Stockdata.csv:', error);
    return []; // Return empty array on file read error
  }
}

const gameStockData = loadStockData();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Conditionally set base path only for production build (GitHub Pages)
  base: mode === 'production' ? '/finance-math-whiz-game/' : '/',
  server: {
    host: "::",
    port: 8082, // Keep the last successful port
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Inject the loaded stock data as a global constant
  define: {
    '__GAME_STOCK_DATA__': JSON.stringify(gameStockData)
  }
}));
