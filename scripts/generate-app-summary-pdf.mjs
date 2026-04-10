import fs from 'fs';
import path from 'path';

const outputDir = path.join(process.cwd(), 'output', 'pdf');
const tmpDir = path.join(process.cwd(), 'tmp', 'pdfs');
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const outputPath = path.join(outputDir, 'mlb-hr-dashboard-summary.pdf');

const page = {
  width: 612,
  height: 792,
  margin: 44,
};

const fontSize = {
  title: 21,
  section: 10,
  body: 8.5,
  small: 8,
};

const leading = {
  title: 26,
  section: 14,
  body: 10.5,
  small: 9.5,
};

function escapePdfText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text, maxWidth, size) {
  const avgCharWidth = size * 0.5;
  const maxChars = Math.max(18, Math.floor(maxWidth / avgCharWidth));
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function addTextBlock(ops, text, x, y, size, width, leadingValue) {
  const lines = wrapText(text, width, size);
  lines.forEach((line, index) => {
    ops.push(`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y - index * leadingValue} Tm (${escapePdfText(line)}) Tj ET`);
  });
  return y - lines.length * leadingValue;
}

function addBulletList(ops, items, x, y, width) {
  let cursor = y;
  for (const item of items) {
    ops.push(`BT /F1 ${fontSize.body} Tf 1 0 0 1 ${x} ${cursor} Tm (${escapePdfText('-')}) Tj ET`);
    cursor = addTextBlock(ops, item, x + 12, cursor, fontSize.body, width - 12, leading.body);
    cursor -= 1.5;
  }
  return cursor;
}

const sections = [
  {
    heading: 'What it is',
    body: [
      'A Next.js 15 MLB analytics app focused on identifying home run targets, researching hitters, and tracking related game context.',
      'Repo evidence shows dedicated views for a live HR dashboard, daily HR board, player research, team trends, today\'s games, and historical pick outcomes.',
    ],
  },
  {
    heading: 'Who it\'s for',
    body: [
      'Primary persona: Not found in repo.',
      'Closest in-product evidence points to users evaluating MLB home run picks and matchup context, such as bettors or baseball analysts.',
    ],
  },
  {
    heading: 'What it does',
    bullets: [
      'Ranks today\'s hitters with model-based HR probabilities and confidence tiers.',
      'Refreshes live lineup-aware projections from internal `/api/hr-predictions` data.',
      'Builds a daily HR board with model, edge, and best-bet sorting modes.',
      'Shows today\'s MLB schedule with weather, probable pitchers, and lineup status.',
      'Supports player research with batter profile, matchup, game log, and pitch-vulnerability views.',
      'Tracks team offensive trends and stores historical top-pick outcomes in Supabase.',
    ],
  },
  {
    heading: 'How it works',
    body: [
      'UI: Next.js App Router pages under `src/app/*` render dashboard, games, research, trends, and history views inside a shared `AppLayout`.',
      'API layer: Route handlers in `src/app/api/*` expose predictions, daily board, history, training data, and AI chat endpoints.',
      'Data/services: `liveMLBDataService` pulls MLB Stats API schedule, lineups, batter/pitcher stats, and Baseball Savant Statcast data; `weatherService` uses OpenWeather; `oddsApiService` uses The Odds API.',
      'Modeling: `hrPredictionService` computes feature-based HR probabilities; the daily board also trains and scores an XGBoost model from Supabase feature snapshots; top dashboard candidates can be enhanced by a Gemini advisory layer.',
      'Persistence: Supabase migrations define `daily_top10_picks`, `hr_outcomes`, and `hr_feature_snapshots` tables used for history and training snapshots.',
    ],
  },
  {
    heading: 'How to run',
    bullets: [
      'Install deps: `npm install`.',
      'Add `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENWEATHER_API_KEY`, `THE_ODDS_API_KEY`; AI keys are optional unless using chat/advisory features.',
      'Start dev server: `npm run dev`.',
      'Open `http://localhost:4028`.',
    ],
  },
];

const ops = [];
ops.push('0.12 0.16 0.22 rg');
ops.push(`BT /F1 ${fontSize.title} Tf 1 0 0 1 ${page.margin} ${page.height - page.margin} Tm (MLB HR Dashboard App Summary) Tj ET`);
ops.push('0.35 0.39 0.45 rg');
ops.push(`BT /F1 ${fontSize.small} Tf 1 0 0 1 ${page.margin} ${page.height - page.margin - 18} Tm (Repo-based one-page summary) Tj ET`);

let y = page.height - page.margin - 46;
const contentWidth = page.width - page.margin * 2;

for (const section of sections) {
  ops.push('0.07 0.45 0.68 rg');
  ops.push(`BT /F1 ${fontSize.section} Tf 1 0 0 1 ${page.margin} ${y} Tm (${escapePdfText(section.heading.toUpperCase())}) Tj ET`);
  y -= leading.section;

  ops.push('0.12 0.16 0.22 rg');
  if (section.body) {
    for (const paragraph of section.body) {
      y = addTextBlock(ops, paragraph, page.margin, y, fontSize.body, contentWidth, leading.body);
      y -= 3;
    }
  }

  if (section.bullets) {
    y = addBulletList(ops, section.bullets, page.margin, y, contentWidth);
  }

  y -= 6;
}

ops.push('0.45 0.49 0.55 rg');
ops.push(`BT /F1 ${fontSize.small} Tf 1 0 0 1 ${page.margin} 28 Tm (Generated from repo evidence on 2026-04-06.) Tj ET`);

const contentStream = ops.join('\n');
const objects = [];

function addObject(body) {
  objects.push(body);
  return objects.length;
}

const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const contentObj = addObject(`<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`);
const pageObj = addObject(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
const pagesObj = addObject(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
const catalogObj = addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

let pdf = '%PDF-1.4\n';
const offsets = [0];

for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf, 'utf8');
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += '0000000000 65535 f \n';

for (let i = 1; i < offsets.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}

pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.writeFileSync(outputPath, pdf, 'binary');

console.log(outputPath);
