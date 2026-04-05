import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'amber' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const variantClasses: Record<string, string> = {
    default: 'bg-slate-500/15 border-slate-500/30 text-slate-300',
    success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    warning: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    danger: 'bg-red-500/15 border-red-500/30 text-red-400',
    info: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
    amber: 'bg-amber-400/15 border-amber-400/30 text-amber-300',
    outline: 'bg-transparent border-surface-300 text-slate-400',
  };

  const sizeClasses: Record<string, string> = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
  };

  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-md border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  );
}