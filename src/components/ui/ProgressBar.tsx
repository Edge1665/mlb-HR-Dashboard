import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
  animated?: boolean;
}

export default function ProgressBar({
  value, max = 100, color = 'bg-brand-500',
  height = 4, showLabel = false, label,
  className = '', animated = false,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs text-slate-400">{label}</span>}
          <span className="text-xs font-mono-stat text-slate-300 ml-auto">{value.toFixed(1)}%</span>
        </div>
      )}
      <div className={`w-full rounded-full bg-surface-400`} style={{ height }}>
        <div
          className={`${color} rounded-full transition-all duration-500 ${animated ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%`, height }}
        />
      </div>
    </div>
  );
}