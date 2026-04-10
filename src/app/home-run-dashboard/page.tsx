import React from 'react';
import AppLayout from '@/components/AppLayout';
import BestBetsDashboardClient from './components/BestBetsDashboardClient';

export const dynamic = 'force-dynamic';

export default function HomeRunDashboardPage() {
  return (
    <AppLayout currentPath="/home-run-dashboard">
      <BestBetsDashboardClient />
    </AppLayout>
  );
}
