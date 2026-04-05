import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function Skeleton({ className = '', rounded = 'md' }: SkeletonProps) {
  const roundedMap = { sm: 'rounded', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' };
  return <div className={`animate-pulse bg-surface-400 ${roundedMap[rounded]} ${className}`} />;
}

export function GameCardSkeleton() {
  return (
    <div className="card-base rounded-xl p-4 space-y-4 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <Skeleton className="h-14 rounded-lg" />
    </div>
  );
}

export function ProjectionCardSkeleton() {
  return (
    <div className="card-base rounded-xl p-4 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="flex gap-2">
        {['w-14', 'w-14', 'w-14', 'w-14'].map((w, i) => (
          <Skeleton key={`skel-stat-${i}`} className={`h-12 ${w} rounded-lg`} />
        ))}
      </div>
      <Skeleton className="h-2 rounded-full" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 8 }: { cols?: number }) {
  return (
    <tr className="border-b border-surface-400">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={`trow-${i}`} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export default function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={`ls-card-${i}`} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {[1,2,3,4,5,6,7,8].map(i => <ProjectionCardSkeleton key={`ls-proj-${i}`} />)}
      </div>
    </div>
  );
}