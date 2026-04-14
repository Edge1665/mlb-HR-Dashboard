import React from 'react';
import AppLayout from '@/components/AppLayout';
import HRHistoryDashboardClient from './components/HRHistoryDashboardClient';

export const metadata = {
  title: 'HR Validation Dashboard | MLB Analytics',
  description: 'Evaluate HR board snapshot performance over time by snapshot type and rank distribution',
};

export const dynamic = 'force-dynamic';

export default function HRHistoryPage() {
  return (
    <AppLayout currentPath="/hr-history">
      <HRHistoryDashboardClient />
    </AppLayout>
  );
}
