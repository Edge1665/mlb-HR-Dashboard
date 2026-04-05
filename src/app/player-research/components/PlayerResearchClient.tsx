'use client';
import React, { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import PlayerSearchPanel from './PlayerSearchPanel';
import RealBatterProfile from './RealBatterProfile';
import RealGameLog from './RealGameLog';
import RealMatchupPanel from './RealMatchupPanel';
import type { PlayerSearchResult } from '@/services/playerResearchApi';

export default function PlayerResearchClient() {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSearchResult | null>(null);

  const handleSelect = useCallback((player: PlayerSearchResult) => {
    setSelectedPlayer(player);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {/* Left panel: search */}
      <div className="lg:col-span-1">
        <PlayerSearchPanel selectedId={selectedPlayer?.id ?? null} onSelect={handleSelect} />
      </div>

      {/* Right panel: research content */}
      <div className="lg:col-span-2 xl:col-span-3">
        {!selectedPlayer ? (
          <div className="card-base rounded-xl">
            <EmptyState
              icon={<Search size={24} className="text-slate-500" />}
              title="Select a player to research"
              description="Search for any active MLB batter to see their season stats, recent performance, platoon splits, and today's matchup context."
            />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Profile + matchup */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <RealBatterProfile playerId={selectedPlayer.id} />
              <RealMatchupPanel playerId={selectedPlayer.id} teamId={selectedPlayer.currentTeamId} playerName={selectedPlayer.fullName} />
            </div>
            {/* Game log */}
            <RealGameLog playerId={selectedPlayer.id} playerName={selectedPlayer.fullName} />
          </div>
        )}
      </div>
    </div>
  );
}