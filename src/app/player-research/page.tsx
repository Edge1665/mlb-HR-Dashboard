import React from 'react';
import AppLayout from '@/components/AppLayout';
import PlayerResearchClient from './components/PlayerResearchClient';

export const dynamic = 'force-dynamic';

export default function PlayerResearchPage() {
  return (
    <AppLayout currentPath="/player-research">
      <PlayerResearchClient />
    </AppLayout>
  );
}