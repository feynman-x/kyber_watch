export interface PoolsApiResponse {
  code: number;
  message: string;
  data: {
    pools: Pool[];
  };
}

export interface Pool {
  address: string;
  earnFee: number;
  egUsd: number;
  exchange: string;
  feeTier: number;
  volume: number;
  liquidity: number;
  tvl: number;
  apr: number;
  allApr: number;
  lpApr: number;
  kemApr: number;
  tokens: PoolToken[];
  chain: PoolChain;
}

export interface PoolToken {
  address: string;
  symbol: string;
  logoURI: string;
}

export interface PoolChain {
  id: number;
  name: string;
  logoUrl: string;
}
