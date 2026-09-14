
import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, TimerIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimerProps {
  duration: number; // Duration in seconds
  isRunning: boolean;
  onTimeUp: () => void;
}

// Warn the player when this many seconds remain.
const WARNING_THRESHOLD = 5;

const Timer: React.FC<TimerProps> = ({ duration, isRunning, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState<number>(duration);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    // Reset timer when duration changes
    setTimeLeft(duration);
    hasFiredRef.current = false;
  }, [duration]);

  useEffect(() => {
    if (!isRunning || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  // Fire onTimeUp from an effect rather than from inside the setTimeLeft
  // updater. Updaters have to stay pure, and React invokes them twice in
  // development, which double-counted the timeout. The ref keeps it to one
  // call even if onTimeUp changes identity between renders.
  useEffect(() => {
    if (timeLeft === 0 && isRunning && !hasFiredRef.current) {
      hasFiredRef.current = true;
      onTimeUp();
    }
  }, [timeLeft, isRunning, onTimeUp]);

  // Format time as MM:SS
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const isWarning = timeLeft <= WARNING_THRESHOLD;

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (timeLeft / duration) * 100 : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center mb-2">
        {isWarning ? (
          <AlertCircle className="w-5 h-5 mr-2 text-red-500 animate-pulse" />
        ) : (
          <TimerIcon className="w-5 h-5 mr-2 text-finance-blue" />
        )}
        <span
          className={cn(
            "font-mono text-lg font-bold",
            isWarning ? "text-red-500" : "text-finance-blue"
          )}
        >
          {formatTime(timeLeft)}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000 ease-linear",
            isWarning ? "bg-red-500" : "bg-finance-green"
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export default Timer;
