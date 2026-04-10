import { getTeamAbbreviation } from '@/services/mlbTeamMetadata';

async function getDailyBoard(sort: string, lineupMode?: string, sportsbooks?: string) {
  const params = new URLSearchParams({ sort });
  if (lineupMode) params.set('lineupMode', lineupMode);
  if (sportsbooks) params.set('sportsbooks', sportsbooks);

  const res = await fetch(`http://localhost:4028/api/hr-daily-board?${params.toString()}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to load HR daily board');
  }

  return res.json();
}

function formatAmericanOdds(odds: number | null) {
  if (odds == null) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(value: number | null) {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatEdge(edge: number | null) {
  if (edge == null) return '—';
  const pct = (edge * 100).toFixed(2);
  return edge >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatCombinedScore(score: number | null) {
  if (score == null) return '—';
  return score.toFixed(3);
}

export default async function HRDailyBoardPage({
  searchParams,
}: {
  searchParams?: Promise<{ sort?: string; lineupMode?: string; sportsbooks?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const sort =
    resolvedSearchParams.sort === 'edge'
      ? 'edge'
      : resolvedSearchParams.sort === 'best'
        ? 'best'
        : 'model';
  const lineupMode =
    resolvedSearchParams.lineupMode === 'all'
      ? 'all'
      : resolvedSearchParams.lineupMode === 'confirmed'
        ? 'confirmed'
        : undefined;
  const sportsbooks = resolvedSearchParams.sportsbooks;

  const data = await getDailyBoard(sort, lineupMode, sportsbooks);

  if (!data?.ok) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">Daily HR Board</h1>
        <p>Failed to load board.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Daily HR Board</h1>
          <p className="text-sm text-gray-300">
            Date: {data.targetDate} | Generated: {data.generatedAt}
          </p>
          <p className="text-sm text-gray-300">
            Training start: {data.trainingStartDate} | Training examples: {data.trainingExampleCount}
          </p>
          <p className="text-sm text-gray-300">
            Sort mode: <span className="font-semibold">{data.sortMode}</span>
          </p>
          <p className="text-sm text-gray-300">
            Lineup mode: <span className="font-semibold">{data.lineupMode}</span> | Confirmed:{' '}
            {data.confirmedCount} | Unconfirmed: {data.unconfirmedCount}
          </p>
          {Array.isArray(data.sportsbooks) && data.sportsbooks.length > 0 && (
            <p className="text-sm text-gray-300">
              Sportsbooks: {data.sportsbooks.join(', ')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <a
              href="/hr-daily-board?sort=model"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Model View
            </a>
            <a
              href="/hr-daily-board?sort=edge"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Edge View
            </a>
            <a
              href="/hr-daily-board?sort=best"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Best Bets
            </a>
          </div>
          <a
            href={`/hr-daily-board?sort=${sort}&lineupMode=confirmed${sportsbooks ? `&sportsbooks=${encodeURIComponent(sportsbooks)}` : ''}`}
            className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            Confirmed Only
          </a>
          <a
            href={`/hr-daily-board?sort=${sort}&lineupMode=all${sportsbooks ? `&sportsbooks=${encodeURIComponent(sportsbooks)}` : ''}`}
            className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            Include Unconfirmed
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border text-sm">
          <thead>
            <tr className="bg-gray-100 text-black">
              <th className="border p-2 text-left">Rank</th>
              <th className="border p-2 text-left">Opp</th>
              <th className="border p-2 text-left">Team</th>
              <th className="border p-2 text-left">Player</th>
              <th className="border p-2 text-left">Lineup</th>
              <th className="border p-2 text-left">Model</th>
              <th className="border p-2 text-left">Odds</th>
              <th className="border p-2 text-left">Implied</th>
              <th className="border p-2 text-left">Edge</th>
              <th className="border p-2 text-left">Best Score</th>
              <th className="border p-2 text-left">Tier</th>
              <th className="border p-2 text-left">Reasons</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row: any) => (
              <tr key={`${row.gameId}-${row.batterId}`}>
                <td className="border p-2">{row.rank}</td>
                <td className="border p-2">{getTeamAbbreviation(row.opponentTeamId)}</td>
                <td className="border p-2">{getTeamAbbreviation(row.teamId)}</td>
                <td className="border p-2 font-medium">{row.batterName}</td>
                <td className="border p-2">{row.lineupConfirmed ? 'Confirmed' : 'Projected'}</td>
                <td className="border p-2">{formatPercent(row.predictedProbability)}</td>
                <td className="border p-2">{formatAmericanOdds(row.sportsbookOddsAmerican)}</td>
                <td className="border p-2">{formatPercent(row.impliedProbability)}</td>
                <td className="border p-2">{formatEdge(row.edge)}</td>
                <td className="border p-2">{formatCombinedScore(row.combinedScore)}</td>
                <td className="border p-2">{row.tier}</td>
                <td className="border p-2">
                  <ul className="list-disc ml-5">
                    {row.reasons.map((reason: string, idx: number) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {row.sportsbook && (
                    <div className="mt-2 text-xs text-gray-400">Book: {row.sportsbook}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
