export interface HistoricalOddsMatchCandidate {
  playerName: string;
  normalizedPlayerName: string;
  playerNameKeys: string[];
}

export interface HistoricalOddsMatchResult<TCandidate extends HistoricalOddsMatchCandidate> {
  status: 'matched' | 'unmatched' | 'ambiguous';
  match: TCandidate | null;
  candidates: TCandidate[];
}

const NAME_SUFFIX_REGEX = /\b(jr|sr|ii|iii|iv|v)\b/gi;

const FIRST_NAME_ALIASES: Record<string, string[]> = {
  alex: ['alex', 'alexander'],
  andy: ['andy', 'andrew'],
  ben: ['ben', 'benjamin'],
  bill: ['bill', 'william'],
  cam: ['cam', 'cameron'],
  chris: ['chris', 'christopher'],
  dan: ['dan', 'daniel'],
  josh: ['josh', 'joshua'],
  jon: ['jon', 'jonathan'],
  matt: ['matt', 'matthew'],
  mike: ['mike', 'michael'],
  nate: ['nate', 'nathan'],
  nick: ['nick', 'nicholas'],
  pat: ['pat', 'patrick'],
  tony: ['tony', 'anthony'],
  will: ['will', 'william'],
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeHistoricalOddsPlayerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, ' ')
    .replace(NAME_SUFFIX_REGEX, '')
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function aliasFirstToken(token: string): string[] {
  return FIRST_NAME_ALIASES[token] ?? [token];
}

export function buildHistoricalOddsPlayerNameKeys(value: string): string[] {
  const normalized = normalizeHistoricalOddsPlayerName(value);
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const firstTokens = aliasFirstToken(tokens[0]);
  const lastToken = tokens[tokens.length - 1];
  const keys = new Set<string>([normalized]);

  for (const firstToken of firstTokens) {
    keys.add([firstToken, ...tokens.slice(1)].join(' '));
    keys.add(`${firstToken} ${lastToken}`);
    keys.add(`${firstToken.charAt(0)} ${lastToken}`);
    keys.add(`${firstToken.charAt(0)}${lastToken}`);
  }

  if (tokens.length >= 2) {
    keys.add(`${lastToken} ${tokens[0]}`);
  }

  return unique(Array.from(keys));
}

function namesLikelyMatch(left: string, right: string): boolean {
  const leftKeys = new Set(buildHistoricalOddsPlayerNameKeys(left));
  const rightKeys = buildHistoricalOddsPlayerNameKeys(right);

  for (const key of rightKeys) {
    if (leftKeys.has(key)) {
      return true;
    }
  }

  const leftTokens = normalizeHistoricalOddsPlayerName(left).split(' ').filter(Boolean);
  const rightTokens = normalizeHistoricalOddsPlayerName(right).split(' ').filter(Boolean);

  if (leftTokens.length >= 2 && rightTokens.length >= 2) {
    const leftFirst = aliasFirstToken(leftTokens[0]);
    const rightFirst = aliasFirstToken(rightTokens[0]);
    const leftLast = leftTokens[leftTokens.length - 1];
    const rightLast = rightTokens[rightTokens.length - 1];

    if (leftLast === rightLast) {
      if (leftFirst.some((token) => rightFirst.includes(token))) {
        return true;
      }

      if (leftFirst.some((token) => token.charAt(0) === rightFirst[0]?.charAt(0))) {
        return true;
      }
    }
  }

  return false;
}

export function matchHistoricalOddsPlayerByName<TCandidate extends HistoricalOddsMatchCandidate>(
  playerName: string,
  candidates: TCandidate[]
): HistoricalOddsMatchResult<TCandidate> {
  const playerNameKeys = new Set(buildHistoricalOddsPlayerNameKeys(playerName));
  const matches = candidates.filter((candidate) => {
    if (candidate.playerNameKeys.some((key) => playerNameKeys.has(key))) {
      return true;
    }

    return namesLikelyMatch(candidate.playerName, playerName);
  });

  if (matches.length === 0) {
    return {
      status: 'unmatched',
      match: null,
      candidates: [],
    };
  }

  const uniqueCandidates = unique(matches.map((candidate) => candidate.normalizedPlayerName));
  if (uniqueCandidates.length > 1) {
    return {
      status: 'ambiguous',
      match: null,
      candidates: matches,
    };
  }

  return {
    status: 'matched',
    match: matches[0] ?? null,
    candidates: matches,
  };
}
