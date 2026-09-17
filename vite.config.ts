import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { buildStockData, type PriceFile } from "./src/utils/buildStockData";

// Prices are refreshed by scripts/refresh-prices.mjs and committed to
// data/prices.json; fundamentals live in Stockdata.csv. Both are read here and
// injected into the bundle, so the page itself never calls out to a data
// provider - no CORS dance, no third-party script, nothing to fail at runtime.
const PRICES_PATH = "data/prices.json";

const readPriceFile = (root: string): PriceFile | null => {
  const file = path.resolve(root, PRICES_PATH);
  if (!fs.existsSync(file)) {
    // A fresh clone can still run `npm run dev`; buildStockData falls back to
    // the CSV's own prices.
    console.warn(`[stock-data] ${PRICES_PATH} missing - falling back to CSV prices`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as PriceFile;
  } catch (error) {
    console.warn(`[stock-data] ${PRICES_PATH} unreadable (${String(error)}) - using CSV prices`);
    return null;
  }
};

const loadGameData = (root: string) => {
  const csvText = fs.readFileSync(path.resolve(root, "Stockdata.csv"), "utf-8");
  const { stocks, asOf, withoutQuote } = buildStockData(csvText, readPriceFile(root));

  // An empty drill is worse than a failed build: it would deploy a site where
  // every question type has an empty pool.
  if (stocks.length === 0) {
    throw new Error("[stock-data] no usable rows - refusing to build an empty drill");
  }

  console.log(
    `[stock-data] ${stocks.length} companies` +
      (asOf ? `, prices as of ${asOf}` : ", CSV prices (no quote file)") +
      (withoutQuote.length ? `, ${withoutQuote.length} without a quote: ${withoutQuote.join(", ")}` : "")
  );

  return { stocks, asOf };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const { stocks, asOf } = loadGameData(__dirname);

  return {
    // Conditionally set base path only for production build (GitHub Pages)
    base: mode === "production" ? "/finance-drills/" : "/",
    server: {
      host: "::",
      port: 8082, // Keep the last successful port
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __GAME_STOCK_DATA__: JSON.stringify(stocks),
      __PRICES_AS_OF__: JSON.stringify(asOf),
    },
  };
});
