import React from 'react';
import AppLayout from '@/components/AppLayout';
import HRHistoryClient from './components/HRHistoryClient';

export const metadata = {
  title: 'Official Board History | MLB Analytics',
  description: 'Review the last 7 days of official HR board snapshots and their scored outcomes',
};

export const dynamic = 'force-dynamic';

export default function HRHistoryPage() {
  return (
    <AppLayout currentPath="/hr-history">
      <HRHistoryClient />
    </AppLayout>
  );
}
