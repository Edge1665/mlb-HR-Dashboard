import React from 'react';
import AppLayout from '@/components/AppLayout';
import HRHistoryClient from './components/HRHistoryClient';

export const metadata = {
  title: 'HR Pick History | MLB Analytics',
  description: 'Browse previous days top 10 HR targets and track actual outcomes',
};

export const dynamic = 'force-dynamic';

export default function HRHistoryPage() {
  return (
    <AppLayout currentPath="/hr-history">
      <HRHistoryClient />
    </AppLayout>
  );
}
