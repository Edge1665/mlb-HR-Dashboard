import React from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPath: string;
}

export default function AppLayout({ children, currentPath }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-surface-900 overflow-hidden">
      <Sidebar currentPath={currentPath} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar currentPath={currentPath} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-2xl mx-auto px-4 lg:px-6 xl:px-8 2xl:px-10 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}