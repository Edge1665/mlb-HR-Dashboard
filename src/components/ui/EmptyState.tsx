import React from 'react';
import { Target } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-500 border border-surface-300 flex items-center justify-center mb-4">
        {icon ?? <Target size={24} className="text-slate-500" />}
      </div>
      <h3 className="text-base font-semibold text-slate-200 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-4">{description}</p>
      {action}
    </div>
  );
}