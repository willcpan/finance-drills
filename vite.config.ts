import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { buildStockData, type PriceFile, type Universe } from "./src/utils/buildStockData";

// The index and its reported figures come from scripts/refresh-universe.mjs;
// the prices from scripts/refresh-prices.mjs. Both files are committed, read
// here, and injected into the bundle - so the page itself never calls out to a
// data provider: no CORS dance, no third-party script, nothing to fail at
// runtime.
const UNIVERSE_PATH = "data/universe.json";
const PRICES_PATH = "data/prices.json";

const readJson = <T,>(root: string, relative: string): T | null => {
  const file = path.resolve(root, relative);
  if (!fs.existsSync(file)) {
    console.warn(`[stock-data] ${relative} is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch (error) {
    console.warn(`[stock-data] ${relative} is unreadable (${String(error)})`);
    return null;
  }
};

const loadGameData = (root: string) => {
  const universe = readJson<Universe>(root, UNIVERSE_PATH);
  const prices = readJson<PriceFile>(root, PRICES_PATH);
  const { stocks, asOf, withoutQuote } = buildStockData(universe, prices);

  // An empty drill is worse than a failed build: it would deploy a site where
  // every question type has an empty pool. Both files are committed, so this
  // only fires if one is deleted or corrupted.
  if (stocks.length === 0) {
    throw new Error(
      "[stock-data] no usable companies - run `npm run refresh:universe` and " +
        "`npm run refresh:prices`, rather than building an empty drill"
    );
  }

  const reported = (pick: (stock: (typeof stocks)[number]) => number) =>
    stocks.filter(stock => Number.isFinite(pick(stock))).length;

  console.log(
    `[stock-data] ${stocks.length} companies from ${universe?.index ?? "an unnamed index"}, ` +
      `prices as of ${asOf}\n` +
      `[stock-data] reported: eps ${reported(s => s.eps)}, revenue ${reported(s => s.revenue)}, ` +
      `operating profit ${reported(s => s.operatingProfit)}` +
      (withoutQuote.length ? `\n[stock-data] ${withoutQuote.length} without a quote: ${withoutQuote.join(", ")}` : "")
  );

  return { stocks, asOf, index: universe?.index ?? null };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const { stocks, asOf, index } = loadGameData(__dirname);

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
      __UNIVERSE_INDEX__: JSON.stringify(index),
    },
  };
});
