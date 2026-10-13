import type { StockData } from "./stockData";

// Where a player can read more about a company. Both open in a new tab; the
// page itself still calls out to nothing (see index.html's CSP).

// Google Finance needs the exchange in the path - google.com/finance/quote/AAPL
// on its own opens the Google Finance home page, not Apple. It also writes
// class shares with a dot (BRK.B), where the quote feeds use a dash.
export const googleFinanceUrl = (stock: Pick<StockData, "ticker" | "profile">): string => {
  const symbol = stock.ticker.replace(/-/g, ".");
  return stock.profile.exchange
    ? `https://www.google.com/finance/quote/${encodeURIComponent(symbol)}:${stock.profile.exchange}`
    : `https://www.google.com/search?q=${encodeURIComponent(`${symbol} stock`)}`;
};

export const wikipediaUrl = (stock: Pick<StockData, "profile">): string | null =>
  stock.profile.wikiTitle
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(stock.profile.wikiTitle.replace(/ /g, "_"))}`
    : null;
