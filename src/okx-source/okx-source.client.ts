import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { fetch as undiciFetch, type Dispatcher } from 'undici';
import { createDnsDispatcher } from '../network/dns-dispatcher';
import type {
  OkxApiResponse,
  OkxTokenRankingItem,
} from './okx-source.types';
import { OKX_FOCUS_CHAINS } from './okx-source.types';

interface OkxClientConfig {
  apiBaseUrl: string;
  apiKey: string;
  secretKey: string;
  passphrase: string;
  requestTimeoutMs: number;
  minRequestIntervalMs: number;
}

export function createOkxSignature(
  timestamp: string,
  method: string,
  requestPathWithQuery: string,
  secretKey: string,
  body = '',
): string {
  const preHash = `${timestamp}${method.toUpperCase()}${requestPathWithQuery}${body}`;
  return createHmac('sha256', secretKey).update(preHash).digest('base64');
}

export function resolveOkxDnsServers(
  okxDnsServers?: string,
  sharedDnsServers?: string,
): string | undefined {
  return okxDnsServers ?? sharedDnsServers;
}

@Injectable()
export class OkxSourceClient {
  private readonly config: OkxClientConfig;
  private readonly dispatcher?: Dispatcher;
  private requestQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor() {
    this.config = {
      apiBaseUrl: process.env.OKX_API_BASE_URL ?? 'https://web3.okx.com',
      apiKey: process.env.OKX_API_KEY ?? '',
      secretKey: process.env.OKX_SECRET_KEY ?? '',
      passphrase: process.env.OKX_PASSPHRASE ?? '',
      requestTimeoutMs: Math.max(
        this.readNumber('OKX_REQUEST_TIMEOUT_MS', 15_000),
        1,
      ),
      minRequestIntervalMs: Math.max(
        this.readNumber('OKX_MIN_REQUEST_INTERVAL_MS', 1_100),
        0,
      ),
    };
    this.dispatcher = createDnsDispatcher(
      resolveOkxDnsServers(
        process.env.OKX_DNS_SERVERS,
        process.env.DNS_SERVERS,
      ),
    );
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.apiKey && this.config.secretKey && this.config.passphrase,
    );
  }

  async fetchHotTokens(
    rankingType: '4' | '5',
  ): Promise<OkxTokenRankingItem[]> {
    return this.get('/api/v6/dex/market/token/hot-token', {
      rankingType,
      rankingTimeFrame: '2',
      riskFilter: 'true',
      limit: '100',
    });
  }

  async fetchTokenToplist(
    sortBy: '2' | '5' | '6',
    timeFrame: '1' | '2' | '3' | '4',
  ): Promise<OkxTokenRankingItem[]> {
    return this.get('/api/v6/dex/market/token/toplist', {
      chains: OKX_FOCUS_CHAINS.map((chain) => chain.chainIndex).join(','),
      sortBy,
      timeFrame,
    });
  }

  private async get(
    requestPath: string,
    params: Record<string, string>,
  ): Promise<OkxTokenRankingItem[]> {
    this.assertConfigured();
    await this.waitForRequestSlot();

    const query = new URLSearchParams(params).toString();
    const requestPathWithQuery = `${requestPath}?${query}`;
    const timestamp = new Date().toISOString();
    const signature = createOkxSignature(
      timestamp,
      'GET',
      requestPathWithQuery,
      this.config.secretKey,
    );
    const url = new URL(requestPathWithQuery, this.config.apiBaseUrl);
    const response = await undiciFetch(url, {
      dispatcher: this.dispatcher,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      headers: {
        'OK-ACCESS-KEY': this.config.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-PASSPHRASE': this.config.passphrase,
        'OK-ACCESS-TIMESTAMP': timestamp,
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `OKX API HTTP error: ${response.status} ${response.statusText} - ${responseBody}`,
      );
    }

    const body = (await response.json()) as OkxApiResponse<
      OkxTokenRankingItem[]
    >;
    if (String(body.code) !== '0' || !Array.isArray(body.data)) {
      throw new Error(
        `OKX API business error: code=${String(body.code)} msg=${body.msg || 'unknown error'}`,
      );
    }

    return body.data;
  }

  private async waitForRequestSlot(): Promise<void> {
    let releaseQueue: () => void = () => undefined;
    const previousRequest = this.requestQueue;
    this.requestQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previousRequest;
    try {
      const waitMs = Math.max(this.nextRequestAt - Date.now(), 0);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.nextRequestAt = Date.now() + this.config.minRequestIntervalMs;
    } finally {
      releaseQueue();
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'OKX API credentials are not configured. Set OKX_API_KEY, OKX_SECRET_KEY and OKX_PASSPHRASE.',
      );
    }
  }

  private readNumber(envKey: string, fallback: number): number {
    const raw = process.env[envKey];
    if (!raw) {
      return fallback;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }
}
