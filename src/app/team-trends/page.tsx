import React from 'react';
import AppLayout from '@/components/AppLayout';
import TeamTrendsClient from './components/TeamTrendsClient';

export const dynamic = 'force-dynamic';

export default function TeamTrendsPage() {
  return (
    <AppLayout currentPath="/team-trends">
      <TeamTrendsClient />
    </AppLayout>
  );
}
