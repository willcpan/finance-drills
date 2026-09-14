import React from "react";
import { AlertCircle, Infinity as InfinityIcon, TimerIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/utils/format";

interface TimerProps {
  remainingMs: number;
  totalMs: number;
  enabled: boolean;
}

const WARNING_MS = 5000;

// Purely presentational. The countdown itself is derived from a timestamp in
// useGame, so there is no interval state here to fall out of step with the
// question on screen.
const Timer: React.FC<TimerProps> = ({ remainingMs, totalMs, enabled }) => {
  if (!enabled) {
    return (
      <div className="flex items-center text-finance-gray">
        <InfinityIcon className="w-4 h-4 mr-2" />
        <span className="text-sm font-medium">Untimed</span>
      </div>
    );
  }

  const isWarning = remainingMs <= WARNING_MS;
  const progress = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;

  return (
    <div className="flex flex-col items-end w-32">
      <div className="flex items-center mb-1.5">
        {isWarning ? (
          <AlertCircle className="w-4 h-4 mr-2 text-red-500 animate-pulse" />
        ) : (
          <TimerIcon className="w-4 h-4 mr-2 text-finance-blue" />
        )}
        <span
          className={cn(
            "font-mono text-base font-bold tabular-nums",
            isWarning ? "text-red-500" : "text-finance-blue"
          )}
        >
          {formatClock(remainingMs / 1000)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-100 ease-linear",
            isWarning ? "bg-red-500" : "bg-finance-green"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default Timer;
