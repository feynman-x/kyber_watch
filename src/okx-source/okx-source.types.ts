export const OKX_FOCUS_CHAINS = [
  { chainIndex: '1', chainName: 'Ethereum' },
  { chainIndex: '501', chainName: 'Solana' },
  { chainIndex: '56', chainName: 'BNB Chain' },
  { chainIndex: '4663', chainName: 'Robinhood' },
  { chainIndex: '8453', chainName: 'Base' },
] as const;

export const OKX_SNAPSHOT_TYPES = [
  'hot-trending',
  'hot-x-mentioned',
  'top-gainers',
  'top-volume',
  'top-market-cap',
] as const;

export type OkxSnapshotType = (typeof OKX_SNAPSHOT_TYPES)[number];

export interface OkxApiResponse<T> {
  code: string | number;
  msg?: string;
  data?: T;
}

export interface OkxTokenRankingItem {
  chainIndex: string;
  tokenSymbol?: string;
  tokenLogoUrl?: string;
  tokenContractAddress: string;
  marketCap?: string;
  volume?: string;
  firstTradeTime?: string;
  change?: string;
  liquidity?: string;
  price?: string;
  holders?: string;
  uniqueTraders?: string;
  txsBuy?: string;
  txsSell?: string;
  txs?: string;
  inflowUsd?: string;
  riskLevelControl?: string;
  devHoldPercent?: string;
  top10HoldPercent?: string;
  insiderHoldPercent?: string;
  bundleHoldPercent?: string;
  vibeScore?: string;
  mentionsCount?: string;
}

export interface OkxRankedToken extends OkxTokenRankingItem {
  key: string;
  chainName: string;
  focusRank: number;
  globalRank: number | null;
  chainRank: number | null;
  previousFocusRank: number | null;
  focusRankChange: number | null;
  previousGlobalRank: number | null;
  globalRankChange: number | null;
}

export interface OkxRankingSnapshot {
  type: OkxSnapshotType;
  scope: 'all-chains-filtered' | 'focus-chains-combined';
  fetchedAt: string;
  rawItemCount: number;
  tokens: OkxRankedToken[];
}

export interface OkxSnapshotHistory {
  current: OkxRankingSnapshot | null;
  previous: OkxRankingSnapshot | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export function isOkxSnapshotType(value: string): value is OkxSnapshotType {
  return OKX_SNAPSHOT_TYPES.includes(value as OkxSnapshotType);
}
