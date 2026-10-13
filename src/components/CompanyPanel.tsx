import React, { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type MonthlyCloses,
  type StockData,
  cagrOf,
  marketCapOf,
  operatingMarginOf,
  peRatioOf,
  priceMoveOf,
  revenueGrowthOf,
} from "@/utils/stockData";
import { bigMoney, billions, fiscalLabel, money, percent, ratio } from "@/utils/format";
import { googleFinanceUrl, wikipediaUrl } from "@/utils/links";

// Whether the panel is open is remembered per browser: someone who opens it
// once usually wants it on every question. Storage can throw (private mode,
// blocked site data), and then it simply starts closed.
const OPEN_KEY = "finance-drills:company-panel-open";

const readOpen = (): boolean => {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

const writeOpen = (open: boolean): void => {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Nothing to do; it just will not be remembered.
  }
};

const signed = (value: number, decimals = 1): string =>
  `${value > 0 ? "+" : ""}${percent(value, decimals)}`;

const monthLabel = (start: string, offset: number): string => {
  const [year, month] = start.split("-").map(Number);
  const index = year * 12 + (month - 1) + offset;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[index % 12]} ${Math.floor(index / 12)}`;
};

// Five years of month-end closes as a line. Drawn by hand rather than with a
// chart library: it is one path, and the page loads nothing it does not ship.
const PriceChart: React.FC<{ monthly: MonthlyCloses }> = ({ monthly }) => {
  const { closes, start } = monthly;
  const width = 300;
  const height = 90;
  const pad = 4;

  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const span = high - low || 1;
  const x = (i: number) => (i / (closes.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - low) / span) * (height - 2 * pad);

  const line = closes.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const up = last >= first;

  // A faint rule at each January, so the line reads against the calendar.
  const [startYear, startMonth] = start.split("-").map(Number);
  const januaries: { i: number; year: number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    if ((startMonth - 1 + i) % 12 === 0) januaries.push({ i, year: startYear + Math.floor((startMonth - 1 + i) / 12) });
  }

  return (
    <figure className="space-y-1">
      <div className="flex items-baseline justify-between text-xs text-gray-500">
        <span>5-year price, month-end</span>
        <span className={cn("font-semibold tabular-nums", up ? "text-finance-green" : "text-finance-red")}>
          {money(first)} → {money(last)} ({signed(priceMoveOf(first, last), 0)})
        </span>
      </div>
      <div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-24 block"
          role="img"
          aria-label={`Share price from ${money(first)} in ${monthLabel(start, 0)} to ${money(last)} now; low ${money(low)}, high ${money(high)}`}
        >
          {januaries.map(({ i }) => (
            <line key={i} x1={x(i)} x2={x(i)} y1={0} y2={height} stroke="#e5e7eb" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} className={up ? "fill-green-50" : "fill-red-50"} />
          <path
            d={line}
            fill="none"
            className={up ? "stroke-finance-green" : "stroke-finance-red"}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="relative h-3 text-[10px] text-gray-400">
        {januaries.map(({ i, year }) => (
          <span key={i} className="absolute -translate-x-1/2" style={{ left: `${(x(i) / width) * 100}%` }}>
            {year}
          </span>
        ))}
      </div>
      {/* Below the line rather than on it, where a peak at either edge would
          run through the label. */}
      <figcaption className="pt-1 text-[11px] text-gray-500 tabular-nums">
        Low {money(low)} · High {money(high)}
      </figcaption>
    </figure>
  );
};

// The company's numbers at a glance, from the same data the questions use.
const keyFigures = (stock: StockData): { label: string; value: string }[] => {
  const figures: { label: string; value: string }[] = [];
  const cap = marketCapOf(stock);
  if (Number.isFinite(cap)) figures.push({ label: "Market cap", value: billions(cap) });
  if (stock.eps > 0) figures.push({ label: "P/E", value: ratio(peRatioOf(stock)) });
  if (stock.dividendPerShare > 0) figures.push({ label: "Dividend yield", value: percent(stock.dividendYield) });
  if (stock.yearAgo) {
    figures.push({ label: "1-year move", value: signed(priceMoveOf(stock.yearAgo.price, stock.currentPrice)) });
  }
  if (stock.revenue > 0) {
    const growth = revenueGrowthOf(stock);
    figures.push({
      label: `Revenue ${fiscalLabel(stock.fiscalYear)}`,
      value: `${bigMoney(stock.revenue)}${Number.isFinite(growth) ? ` (${signed(growth)})` : ""}`,
    });
  }
  const margin = operatingMarginOf(stock);
  if (Number.isFinite(margin)) figures.push({ label: "Operating margin", value: percent(margin, 1) });
  const history = stock.revenueHistory;
  if (history.length > 5) {
    const rate = cagrOf(history[5].value, history[0].value, 5);
    if (Number.isFinite(rate)) figures.push({ label: "Revenue, 5-yr CAGR", value: signed(rate) });
  }
  return figures;
};

const linkClass =
  "inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[13px] font-medium text-finance-blue hover:bg-blue-50";

const CompanyPanel: React.FC<{ stock: StockData }> = ({ stock }) => {
  const [open, setOpen] = useState(readOpen);
  const wiki = wikipediaUrl(stock);
  const { profile } = stock;
  const facts = [profile.subIndustry, profile.headquarters, profile.founded && `founded ${profile.founded}`].filter(
    Boolean
  );

  const toggle = () => {
    setOpen(previous => {
      writeOpen(!previous);
      return !previous;
    });
  };

  return (
    // The card moves on when tapped; nothing in here should.
    <div className="rounded-lg border border-gray-200 p-3 space-y-3 cursor-auto" onClick={event => event.stopPropagation()}>
      <div className="flex flex-wrap gap-2">
        <a href={googleFinanceUrl(stock)} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Google Finance chart
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {wiki && (
          <a href={wiki} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Wikipedia
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-semibold text-finance-blue"
      >
        <span className="truncate">About {stock.name}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="space-y-3 animate-fade-in">
          {facts.length > 0 && <p className="text-xs text-gray-500">{facts.join(" · ")}</p>}
          {profile.description && <p className="text-sm text-gray-700 leading-relaxed">{profile.description}</p>}
          {stock.monthly && <PriceChart monthly={stock.monthly} />}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {keyFigures(stock).map(({ label, value }) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800 tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};

export default CompanyPanel;
