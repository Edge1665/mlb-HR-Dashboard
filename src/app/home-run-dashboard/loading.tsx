import React from 'react';
import AppLayout from '@/components/AppLayout';

export default function HomeRunDashboardLoading() {
  return (
    <AppLayout currentPath="/home-run-dashboard">
      <div className="space-y-6">
        {/* Summary bar skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)]?.map((_, i) => (
            <div key={i} className="bg-surface-800 rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-surface-700 rounded w-2/3 mb-3" />
              <div className="h-7 bg-surface-700 rounded w-1/2" />
            </div>
          ))}
        </div>
        {/* Filter bar skeleton */}
        <div className="bg-surface-800 rounded-xl p-4 animate-pulse flex gap-3">
          {[...Array(5)]?.map((_, i) => (
            <div key={i} className="h-8 bg-surface-700 rounded-lg w-20" />
          ))}
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)]?.map((_, i) => (
            <div key={i} className="bg-surface-800 rounded-xl p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-surface-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-700 rounded w-3/4" />
                  <div className="h-3 bg-surface-700 rounded w-1/2" />
                </div>
              </div>
              <div className="h-12 bg-surface-700 rounded-lg" />
              <div className="space-y-2">
                <div className="h-3 bg-surface-700 rounded w-full" />
                <div className="h-3 bg-surface-700 rounded w-5/6" />
                <div className="h-3 bg-surface-700 rounded w-4/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
