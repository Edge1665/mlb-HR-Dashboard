'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchTodaysMLBSchedule } from '@/services/mlbApi';

interface TodaysSlateSummary {
  dateLabel: string;
  gamesCount: number | null;
}

function getEasternDateLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

export function useTodaysSlateSummary(): TodaysSlateSummary {
  const [gamesCount, setGamesCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchTodaysMLBSchedule()
      .then((games) => {
        if (!cancelled) {
          setGamesCount(games.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGamesCount(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dateLabel = useMemo(() => getEasternDateLabel(), []);

  return {
    dateLabel,
    gamesCount,
  };
}
