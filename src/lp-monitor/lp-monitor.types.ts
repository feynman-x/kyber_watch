export interface PositionsApiResponse {
  code: number;
  message: string;
  data?: {
    positions: Position[];
    stats: PositionStats;
  };
}

export interface PositionStats {
  totalItems: number;
  totalValueUsd: number;
  totalEarnedFeeUsd: number;
  totalClaimedFeeUsd: number;
  totalUnclaimedFeeUsd: number;
  totalClaimedRewardUsd: number;
  totalUnclaimedRewardUsd: number;
  totalPendingRewardUsd: number;
}

export interface Position {
  id: number;
  positionId: string;
  wallet: string;
  status: string;
  valueInUSD: number;
  tokenId: number;
  pool: PositionPool;
  extra?: {
    priceRange?: {
      min: number;
      maxPrice: number;
    };
  };
}

export interface PositionPool {
  id: string;
  address: string;
  price: number;
  protocol: {
    type: string;
    name: string;
    logo: string;
  };
  tokenAmounts: PositionTokenAmount[];
}

export interface PositionTokenAmount {
  amount: {
    usdValue: number;
    priceUsd: number;
    amount: string;
  };
  token: {
    logo: string;
    symbol: string;
    name: string;
    decimals: number;
    address: string;
  };
}

export interface AddressStore {
  addresses: string[];
}

export interface AddressReport {
  address: string;
  positions: Position[];
  stats: PositionStats;
}
