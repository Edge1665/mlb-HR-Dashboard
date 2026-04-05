'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, Save, Trophy, Target, TrendingUp, Loader2 } from 'lucide-react';
import type { DailyHistoryEntry, DailyPick, HROutcome } from '@/services/hrHistoryService';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getTierColor(tier: string): string {
  switch (tier) {
    case 'elite': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
    case 'high': return 'text-brand-400 bg-brand-400/10 border-brand-400/20';
    case 'medium': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  }
}

function getProbColor(prob: number): string {
  if (prob >= 15) return 'text-purple-400';
  if (prob >= 10) return 'text-brand-400';
  if (prob >= 7) return 'text-amber-400';
  return 'text-slate-400';
}

interface OutcomeButtonProps {
  pick: DailyPick;
  outcome: HROutcome | undefined;
  onUpdate: (pickId: string, hitHr: boolean, hrCount: number) => void;
  updating: boolean;
}

function OutcomeButton({ pick, outcome, onUpdate, updating }: OutcomeButtonProps) {
  const hitHr = outcome?.hitHr;
  const hrCount = outcome?.hrCount ?? 0;

  if (hitHr === true) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400">
            {hrCount > 1 ? `${hrCount} HR` : 'Hit HR'}
          </span>
        </div>
        <button
          onClick={() => onUpdate(pick.id, false, 0)}
          disabled={updating}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          title="Mark as no HR"
        >
          undo
        </button>
      </div>
    );
  }

  if (hitHr === false) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <XCircle size={14} className="text-red-400" />
          <span className="text-xs font-semibold text-red-400">No HR</span>
        </div>
        <button
          onClick={() => onUpdate(pick.id, true, 1)}
          disabled={updating}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          title="Mark as HR"
        >
          undo
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onUpdate(pick.id, true, 1)}
        disabled={updating}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
      >
        <CheckCircle2 size={11} />
        HR
      </button>
      <button
        onClick={() => onUpdate(pick.id, false, 0)}
        disabled={updating}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50"
      >
        <XCircle size={11} />
        No
      </button>
    </div>
  );
}

export default function HRHistoryClient() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entry, setEntry] = useState<DailyHistoryEntry | null>(null);
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [updatingPickId, setUpdatingPickId] = useState<string | null>(null);
  const [savingToday, setSavingToday] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [todaySaved, setTodaySaved] = useState(false);
  const [dateIdx, setDateIdx] = useState(0);

  const fetchDates = useCallback(async () => {
    setLoadingDates(true);
    try {
      const res = await fetch('/api/hr-history');
      const json = await res.json();
      const d: string[] = json.dates ?? [];
      setDates(d);
      if (d.length > 0 && !selectedDate) {
        setSelectedDate(d[0]);
        setDateIdx(0);
      }
    } catch {
      setDates([]);
    } finally {
      setLoadingDates(false);
    }
  }, [selectedDate]);

  const checkTodaySaved = useCallback(async () => {
    try {
      const res = await fetch('/api/hr-history/save-today');
      const json = await res.json();
      setTodaySaved(json.saved ?? false);
    } catch {}
  }, []);

  useEffect(() => {
    fetchDates();
    checkTodaySaved();
  }, [fetchDates, checkTodaySaved]);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingEntry(true);
    fetch(`/api/hr-history?date=${selectedDate}`)
      .then(r => r.json())
      .then(json => setEntry(json.date ? json : null))
      .catch(() => setEntry(null))
      .finally(() => setLoadingEntry(false));
  }, [selectedDate]);

  const handleSaveToday = async () => {
    setSavingToday(true);
    setSaveStatus('idle');
    try {
      // Fetch today's predictions first
      const predRes = await fetch('/api/hr-predictions', { cache: 'no-store' });
      if (!predRes.ok) throw new Error('Failed to fetch predictions');
      const predData = await predRes.json();

      const saveRes = await fetch('/api/hr-history/save-today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projections: predData.projections ?? [],
          batters: predData.batters ?? {},
          pitchers: predData.pitchers ?? {},
        }),
      });

      if (!saveRes.ok) throw new Error('Save failed');
      setSaveStatus('saved');
      setTodaySaved(true);
      await fetchDates();
    } catch {
      setSaveStatus('error');
    } finally {
      setSavingToday(false);
    }
  };

  const handleOutcomeUpdate = async (pickId: string, hitHr: boolean, hrCount: number) => {
    setUpdatingPickId(pickId);
    try {
      await fetch('/api/hr-history/outcomes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickId, hitHr, hrCount }),
      });
      // Refresh entry
      if (selectedDate) {
        const res = await fetch(`/api/hr-history?date=${selectedDate}`);
        const json = await res.json();
        setEntry(json.date ? json : null);
      }
    } finally {
      setUpdatingPickId(null);
    }
  };

  const navigateDate = (dir: 'prev' | 'next') => {
    const newIdx = dir === 'next' ? dateIdx + 1 : dateIdx - 1;
    if (newIdx < 0 || newIdx >= dates.length) return;
    setDateIdx(newIdx);
    setSelectedDate(dates[newIdx]);
  };

  // Stats for selected date
  const outcomes = entry?.outcomes ?? [];
  const picks = entry?.picks ?? [];
  const resolved = outcomes.filter(o => o.hitHr !== null);
  const hits = outcomes.filter(o => o.hitHr === true);
  const accuracy = resolved.length > 0 ? Math.round((hits.length / resolved.length) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Header + Save Today */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">HR Pick History</h1>
          <p className="text-sm text-slate-500 mt-1">Browse previous days' top 10 HR targets and track actual outcomes</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Saved!
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400">Save failed</span>
          )}
          <button
            onClick={handleSaveToday}
            disabled={savingToday}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              todaySaved
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' :'bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20'
            } disabled:opacity-50`}
          >
            {savingToday ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {savingToday ? 'Saving…' : todaySaved ? 'Re-save Today' : "Save Today's Top 10"}
          </button>
        </div>
      </div>

      {/* Date Navigator */}
      {loadingDates ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading history…
        </div>
      ) : dates.length === 0 ? (
        <div className="card-base rounded-xl p-8 text-center">
          <Calendar size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-300 font-medium">No history yet</p>
          <p className="text-slate-500 text-sm mt-1">Click "Save Today's Top 10" to start tracking</p>
        </div>
      ) : (
        <>
          {/* Date selector */}
          <div className="card-base rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => navigateDate('next')}
                disabled={dateIdx >= dates.length - 1}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex-1 flex items-center justify-center gap-3 flex-wrap">
                {dates.slice(0, 7).map((d, i) => (
                  <button
                    key={d}
                    onClick={() => { setSelectedDate(d); setDateIdx(i); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedDate === d
                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' :'text-slate-500 hover:text-slate-200 hover:bg-surface-500'
                    }`}
                  >
                    {formatDate(d)}
                  </button>
                ))}
              </div>

              <button
                onClick={() => navigateDate('prev')}
                disabled={dateIdx <= 0}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Stats bar for selected date */}
          {selectedDate && !loadingEntry && entry && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card-base rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                  <Target size={18} className="text-brand-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Picks</p>
                  <p className="text-xl font-bold text-slate-100">{picks.length}</p>
                </div>
              </div>
              <div className="card-base rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Trophy size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Hit HR</p>
                  <p className="text-xl font-bold text-emerald-400">{hits.length}</p>
                </div>
              </div>
              <div className="card-base rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Clock size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending</p>
                  <p className="text-xl font-bold text-amber-400">{picks.length - resolved.length}</p>
                </div>
              </div>
              <div className="card-base rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp size={18} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Accuracy</p>
                  <p className="text-xl font-bold text-purple-400">
                    {accuracy !== null ? `${accuracy}%` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Picks table */}
          {loadingEntry ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="animate-spin text-brand-400" />
              <span className="text-slate-400 text-sm">Loading picks…</span>
            </div>
          ) : !entry ? (
            <div className="card-base rounded-xl p-8 text-center">
              <p className="text-slate-500 text-sm">No data for this date</p>
            </div>
          ) : (
            <div className="card-base rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-400 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Top 10 HR Targets — {formatDate(selectedDate!)}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click HR / No to record actual outcomes
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono-stat">{picks.length} picks</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-400 bg-surface-600">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-40">Player</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-32">Matchup</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">HR Prob</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Tier</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-36">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picks.map((pick, idx) => {
                      const outcome = outcomes.find(o => o.pickId === pick.id);
                      const isUpdating = updatingPickId === pick.id;
                      return (
                        <tr
                          key={pick.id}
                          className={`border-b border-surface-400 transition-colors duration-100 ${
                            outcome?.hitHr === true
                              ? 'bg-emerald-500/5'
                              : outcome?.hitHr === false
                              ? 'bg-red-500/5'
                              : idx % 2 === 0 ? 'bg-surface-700' : 'bg-surface-800'
                          }`}
                        >
                          <td className="px-4 py-3 text-xs font-mono-stat text-slate-500">{pick.rank}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{pick.playerName}</p>
                              <p className="text-xs text-slate-500">{pick.teamAbbreviation}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {pick.opposingPitcher ? (
                              <p className="text-xs text-slate-400">vs {pick.opposingPitcher}</p>
                            ) : (
                              <p className="text-xs text-slate-600 italic">TBD</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`text-sm font-bold font-mono-stat ${getProbColor(pick.hrProbability)}`}>
                              {pick.hrProbability.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${getTierColor(pick.confidenceTier)}`}>
                              {pick.confidenceTier.charAt(0).toUpperCase() + pick.confidenceTier.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isUpdating ? (
                              <Loader2 size={14} className="animate-spin text-slate-400" />
                            ) : (
                              <OutcomeButton
                                pick={pick}
                                outcome={outcome}
                                onUpdate={handleOutcomeUpdate}
                                updating={isUpdating}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
