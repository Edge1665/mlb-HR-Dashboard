import React from 'react';
import HRBoardShareView from '@/app/hr-board/share/components/HRBoardShareView';
import { buildDailyHRBoard } from '@/services/hrDailyBoardService';

export const dynamic = 'force-dynamic';

interface HRBoardSharePageProps {
  searchParams?: Promise<{
    view?: string;
  }>;
}

export default async function HRBoardSharePage({ searchParams }: HRBoardSharePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const rowLimit = resolvedSearchParams.view === '10' ? 10 : 20;

  const board = await buildDailyHRBoard({
    sortMode: 'best',
    lineupMode: 'all',
    limit: 20,
  });

  return <HRBoardShareView board={board} rowLimit={rowLimit} />;
}
