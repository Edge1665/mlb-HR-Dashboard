import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'));

  const { runSavedSnapshotOddsBacktest } = await import('@/services/ml/hrSnapshotOddsBacktest');
  const summary = await runSavedSnapshotOddsBacktest();

  console.log('Saved Snapshot Odds ROI Backtest');
  console.log(`  totalRowsWithUsableOdds: ${summary.totalRowsWithUsableOdds}`);
  console.log(`  snapshotCount: ${summary.snapshotCoverage.snapshotCount}`);
  console.log(`  uniqueDates: ${summary.snapshotCoverage.uniqueDates}`);
  console.log(`  boardTypes: ${summary.snapshotCoverage.boardTypes.join(', ') || 'none'}`);
  console.log(`  sportsbooks: ${summary.snapshotCoverage.sportsbooks.join(', ') || 'none'}`);
  console.log('');

  console.log('Overall');
  console.log(`  hitRate: ${summary.overall.hitRate.toFixed(4)}`);
  console.log(`  roi: ${summary.overall.roi.toFixed(4)}`);
  console.log(`  profitUnits: ${summary.overall.profitUnits.toFixed(4)}`);
  console.log(`  averageOdds: ${summary.overall.averageOdds?.toFixed(2) ?? 'n/a'}`);
  console.log('');

  console.log('By Strategy');
  for (const strategy of summary.strategyResults) {
    console.log(
      [
        `  ${strategy.strategy}`,
        strategy.description,
        `rows=${strategy.totalRows}`,
        `bets=${strategy.totalBets}`,
        `hits=${strategy.totalHits}`,
        `hitRate=${strategy.hitRate.toFixed(4)}`,
        `profitUnits=${strategy.profitUnits.toFixed(4)}`,
        `roi=${strategy.roi.toFixed(4)}`,
        `averageOdds=${strategy.averageOdds?.toFixed(2) ?? 'n/a'}`,
      ].join(' | ')
    );
  }
  console.log('');

  console.log('By Sportsbook');
  for (const sportsbook of summary.sportsbookResults) {
    console.log(
      [
        `  ${sportsbook.sportsbook}`,
        `bets=${sportsbook.totalBets}`,
        `hits=${sportsbook.totalHits}`,
        `hitRate=${sportsbook.hitRate.toFixed(4)}`,
        `profitUnits=${sportsbook.profitUnits.toFixed(4)}`,
        `roi=${sportsbook.roi.toFixed(4)}`,
        `averageOdds=${sportsbook.averageOdds?.toFixed(2) ?? 'n/a'}`,
      ].join(' | ')
    );
  }
}

main().catch((error) => {
  console.error('Saved snapshot odds backtest failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
