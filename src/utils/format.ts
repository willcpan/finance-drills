import type { AnswerUnit } from "./questionGenerator";

export const money = (value: number): string =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const percent = (value: number, decimals = 2): string => `${value.toFixed(decimals)}%`;

export const ratio = (value: number, decimals = 1): string => `${value.toFixed(decimals)}x`;

export const years = (value: number, decimals = 1): string => {
  const rounded = Number(value.toFixed(decimals));
  return `${rounded} ${rounded === 1 ? "year" : "years"}`;
};

// Revenue and operating profit arrive in millions. Billions read better in a
// question a person has to hold in their head.
export const bigMoney = (millions: number): string => {
  if (Math.abs(millions) >= 1000) {
    return `$${(millions / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}bn`;
  }
  return `$${millions.toLocaleString("en-US", { maximumFractionDigits: 0 })}m`;
};

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
