import React from 'react';

interface StatPillProps {
  label: string;
  value: string | number;
  valueColor?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export default function StatPill({ label, value, valueColor = 'text-slate-100', size = 'sm', className = '' }: StatPillProps) {
  const sizeMap = {
    xs: { label: 'text-xs', value: 'text-xs' },
    sm: { label: 'text-xs', value: 'text-sm' },
    md: { label: 'text-xs', value: 'text-base' },
  };

  return (
    <div className={`flex flex-col items-center bg-surface-600 border border-surface-300 rounded-lg px-2.5 py-2 ${className}`}>
      <span className={`${sizeMap[size].label} font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap`}>{label}</span>
      <span className={`${sizeMap[size].value} font-semibold font-mono-stat ${valueColor} mt-0.5`}>{value}</span>
    </div>
  );
}