import { MoveHorizontal, Timer } from 'lucide-react';

// 型定義
type TimeField = 'startTime' | 'duration';

// Props
type TimeSectionProps = {
  startTime: number;
  duration: number;
  onChange: (field: TimeField, value: number) => void;
  activePathId?: string;
};

// コンポーネント
export const TimeSection = ({
  startTime,
  duration,
  onChange,
  activePathId,
}: TimeSectionProps) => (
  <div id="timeSection" className="flex flex-col gap-2 p-3">
    <span className="text-xs font-medium text-gray-400">Time</span>
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Timer className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-gray-500" />
        <input
          id="startTimeInput"
          key={`start-${activePathId ?? 'none'}`}
          type="number"
          min="0"
          step="0.01"
          defaultValue={startTime}
          onChange={(event) =>
            onChange('startTime', Number(event.target.value))
          }
          className="corner-md w-full appearance-none bg-gray-800 py-1.5 pr-6 pl-7 text-xs text-gray-50 focus:ring-1 focus:ring-gray-700 focus:outline-none"
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500">
          s
        </span>
      </div>

      <div className="relative flex-1">
        <MoveHorizontal className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-gray-500" />
        <input
          id="durationInput"
          key={`duration-${activePathId ?? 'none'}`}
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={duration}
          onChange={(event) => onChange('duration', Number(event.target.value))}
          className="corner-md w-full appearance-none bg-gray-800 py-1.5 pr-6 pl-7 text-xs text-gray-50 focus:ring-1 focus:ring-gray-700 focus:outline-none"
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500">
          s
        </span>
      </div>
    </div>
  </div>
);
