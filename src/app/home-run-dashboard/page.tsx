import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardClient from './components/DashboardClient';

export const dynamic = 'force-dynamic';

export default function HomeRunDashboardPage() {
  return (
    <AppLayout currentPath="/home-run-dashboard">
      <DashboardClient />
    </AppLayout>
  );
}