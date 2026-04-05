import React from 'react';
import AppLayout from '@/components/AppLayout';

export default function TodaysGamesLoading() {
  return (
    <AppLayout currentPath="/today-s-games">
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
          {[...Array(4)]?.map((_, i) => (
            <div key={i} className="h-8 bg-surface-700 rounded-lg w-20" />
          ))}
        </div>
        {/* Game cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {[...Array(6)]?.map((_, i) => (
            <div key={i} className="bg-surface-800 rounded-xl p-5 animate-pulse space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-4 bg-surface-700 rounded w-1/3" />
                <div className="h-5 bg-surface-700 rounded-full w-16" />
              </div>
              <div className="flex justify-between items-center py-3">
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-surface-700 rounded w-3/4" />
                  <div className="h-3 bg-surface-700 rounded w-1/2" />
                </div>
                <div className="h-6 bg-surface-700 rounded w-8 mx-4" />
                <div className="space-y-2 flex-1 text-right">
                  <div className="h-5 bg-surface-700 rounded w-3/4 ml-auto" />
                  <div className="h-3 bg-surface-700 rounded w-1/2 ml-auto" />
                </div>
              </div>
              <div className="h-3 bg-surface-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
