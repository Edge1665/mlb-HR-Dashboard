'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import AppLogo from './ui/AppLogo';
import { LayoutDashboard, CalendarDays, Search, ChevronLeft, ChevronRight, Target, Settings, Bell, History, ListOrdered } from 'lucide-react';
import { useTodaysSlateSummary } from '@/hooks/useTodaysSlateSummary';


const NAV_ITEMS = [
  { label: 'HR Dashboard', href: '/home-run-dashboard', icon: LayoutDashboard, badge: null, description: 'Top HR targets today' },
  { label: 'HRR Board', href: '/hrr-board', icon: ListOrdered, badge: null, description: 'Hits + Runs + RBIs board' },
  { label: "Today\'s Games", href: '/today-s-games', icon: CalendarDays, badge: null, description: 'Live game context' },
  { label: 'Player Research', href: '/player-research', icon: Search, badge: null, description: 'Deep batter analysis' },
  { label: 'HR History', href: '/hr-history', icon: History, badge: null, description: 'Previous picks & outcomes' },
];

interface SidebarProps {
  currentPath: string;
}

export default function Sidebar({ currentPath }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { dateLabel: liveDateLabel, gamesCount } = useTodaysSlateSummary();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-surface-800 border-r border-surface-400 transition-all duration-300 ease-in-out flex-shrink-0 ${collapsed ? 'w-16' : 'w-60'}`}
      >
        {/* Logo */}
        <div className={`flex items-center border-b border-surface-400 h-14 px-3 flex-shrink-0 ${collapsed ? 'justify-center' : 'gap-2 px-4'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <AppLogo size={28} />
            {!collapsed && (
              <span className="font-bold text-base text-slate-100 tracking-tight whitespace-nowrap">
                MLB<span className="text-brand-400">Analytics</span>
              </span>
            )}
          </div>
        </div>

        {/* Live indicator */}
        {!collapsed && (
          <div className="px-4 py-2.5 border-b border-surface-400">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span>{`Live - ${liveDateLabel}`}</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {!collapsed && (
            <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest">Analysis</p>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.href || currentPath.startsWith(item.href + '/');
            const Icon = item.icon;
            const badge = item.href === '/today-s-games' && gamesCount != null ? String(gamesCount) : item.badge;
            return (
              <Link key={`nav-${item.href}`} href={item.href} title={collapsed ? item.label : undefined}>
                <div className={`flex items-center rounded-lg transition-all duration-150 cursor-pointer group ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} ${isActive ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-surface-500'}`}>
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.label}</span>
                        {badge && (
                          <span className="text-xs font-mono-stat bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-md">
                            {badge}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}

          {!collapsed && (
            <div className="pt-3">
              <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest">Tools</p>
            </div>
          )}

          {[
            { label: 'Projections', href: '/home-run-dashboard', icon: Target },
            { label: 'Alerts', href: '/home-run-dashboard', icon: Bell },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={`tool-${item.label}`} href={item.href} title={collapsed ? item.label : undefined}>
                <div className={`flex items-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-surface-500 transition-all duration-150 cursor-pointer ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}`}>
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-surface-400 p-2 space-y-1">
          {!collapsed && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-500 cursor-pointer group">
              <div className="w-7 h-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-brand-400">ML</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">MLB Pro</p>
                <p className="text-xs text-slate-500 truncate">Season Pass</p>
              </div>
              <Settings size={14} className="text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-surface-500 transition-all duration-150"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-800 border-t border-surface-400 flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;
          return (
            <Link key={`mobile-nav-${item.href}`} href={item.href} className="flex flex-col items-center gap-1 flex-1">
              <Icon size={20} className={isActive ? 'text-brand-400' : 'text-slate-500'} />
              <span className={`text-xs font-medium ${isActive ? 'text-brand-400' : 'text-slate-500'}`}>
                {item.label.split("'")[0].trim()}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}


