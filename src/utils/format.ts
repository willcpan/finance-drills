import type { AnswerUnit } from "./questionGenerator";

// The sign goes outside the currency symbol: a falling move reads as -$1.90,
// not $-1.90.
export const money = (value: number): string => {
  const magnitude = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}$${magnitude}`;
};

export const percent = (value: number, decimals = 2): string => `${value.toFixed(decimals)}%`;

export const ratio = (value: number, decimals = 1): string => `${value.toFixed(decimals)}x`;

export const years = (value: number, decimals = 1): string => {
  const rounded = Number(value.toFixed(decimals));
  return `${rounded} ${rounded === 1 ? "year" : "years"}`;
};

// Revenue and operating profit arrive in millions. Billions read better in a
// question a person has to hold in their head.
export const bigMoney = (millions: number): string => {
  // The sign goes outside the currency symbol, as in money() above: revenue
  // that fell reads as -$2.4bn, not $-2.4bn.
  const sign = millions < 0 ? "-" : "";
  const magnitude = Math.abs(millions);

  if (magnitude >= 1000) {
    return `${sign}$${(magnitude / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}bn`;
  }
  return `${sign}$${magnitude.toLocaleString("en-US", { maximumFractionDigits: 0 })}m`;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// A YYYY-MM-DD from the quote file, for printing inside a question. Formatted
// by hand rather than through a Date: parsing the string shifts the day west
// of Greenwich, and Intl's "short" month is four letters for September in
// newer ICU ("17 Sept 2025").
export const shortDate = (iso: string): string => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;

  const [, year, month, day] = parts;
  const name = MONTHS[Number(month) - 1];
  return name ? `${Number(day)} ${name} ${year}` : iso;
};

// "CY2025" is how the SEC frames a calendar year; a question just says 2025.
// A non-calendar filer keeps its "FY2026", which is what its own report says.
export const fiscalLabel = (period: string | null): string =>
  !period ? "its last reported year" : period.startsWith("CY") ? period.slice(2) : period;

// Render an answer in whatever unit its question uses.
export const formatAnswer = (value: number, unit: AnswerUnit): string => {
  switch (unit) {
    case "currency":
      return money(value);
    case "percentagePoints":
      return percent(value);
    case "ratio":
      return ratio(value);
    case "years":
      return years(value);
    default:
      return value.toFixed(2);
  }
};

// Short suffix for the input field and inline feedback.
export const unitSuffix = (unit: AnswerUnit): string => {
  switch (unit) {
    case "currency":
      return "$";
    case "percentagePoints":
      return "%";
    case "ratio":
      return "x";
    case "years":
      return "yrs";
    default:
      return "";
  }
};

export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
};

export const formatClock = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};
