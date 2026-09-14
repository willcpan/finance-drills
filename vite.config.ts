import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from 'fs'; 
import Papa from 'papaparse'; 
import { componentTagger } from "lovable-tagger";

// Define the structure for the stock data (matching questionGenerator's needs).
// Revenue, EPS and operating profit come straight from the CSV and unlock the
// valuation and margin questions; previously they were parsed and discarded.
interface StockData {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  eps: number;
  revenue: number;          // millions
  operatingProfit: number;  // millions
  dividendPerShare: number;
  dividendYield: number;
}

interface StockRow {
  Ticker?: string;
  Revenue?: string | number;
  'Stock Price'?: string | number;
  EPS?: string | number;
  'Operating Profit'?: string | number;
  'Annual Dividend'?: string | number;
}

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (num: number): number => {
  return Math.round(num * 100) / 100;
};

const toNumber = (value: string | number | undefined): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Deterministic 0..1 from the ticker. The CSV has no prior close, so one is
// derived - but deriving it from Math.random() meant the same ticker showed a
// different prior close on every build. Seeding from the ticker keeps a given
// company's numbers stable between builds.
const seededUnitFloat = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
};

// Derive a plausible previous close, within +/-2% of the current price.
const derivePreviousClose = (ticker: string, currentPrice: number): number => {
  const variation = seededUnitFloat(ticker) * 0.04 - 0.02;
  return roundToTwoDecimals(Math.max(0.01, currentPrice * (1 + variation)));
};

// Function to load and process stock data from CSV
function loadStockData(): StockData[] {
  try {
    const csvFilePath = path.resolve(__dirname, 'Stockdata.csv');
    const csvFileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    const parsed = Papa.parse<StockRow>(csvFileContent, {
      header: true, // Assumes first row is header
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      console.error('Error parsing Stockdata.csv:', parsed.errors);
      return []; // Return empty array on parse error
    }

    return parsed.data
      .map((row): StockData => {
        const ticker = (row.Ticker ?? '').trim();
        const currentPrice = toNumber(row['Stock Price']);
        const dividendPerShare = toNumber(row['Annual Dividend']);

        return {
          ticker,
          currentPrice: roundToTwoDecimals(currentPrice),
          previousClose: derivePreviousClose(ticker, currentPrice),
          eps: toNumber(row.EPS),
          revenue: toNumber(row.Revenue),
          operatingProfit: toNumber(row['Operating Profit']),
          dividendPerShare: roundToTwoDecimals(dividendPerShare),
          dividendYield:
            currentPrice > 0 ? roundToTwoDecimals((dividendPerShare / currentPrice) * 100) : 0,
        };
      })
      // A handful of rows have blank cells. Drop anything that did not parse
      // rather than letting NaN reach the question generator.
      .filter(
        stock =>
          stock.ticker.length > 0 &&
          stock.currentPrice > 0 &&
          Number.isFinite(stock.eps) &&
          Number.isFinite(stock.revenue) &&
          Number.isFinite(stock.operatingProfit) &&
          Number.isFinite(stock.dividendPerShare)
      );
  } catch (error) {
    console.error('Error reading or processing Stockdata.csv:', error);
    return []; // Return empty array on file read error
  }
}

const gameStockData = loadStockData();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Conditionally set base path only for production build (GitHub Pages)
  base: mode === 'production' ? '/finance-drills/' : '/',
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
