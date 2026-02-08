import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool, PoolsApiResponse } from './pools.types';

interface MonitorConfig {
  apiBaseUrl: string;
  chainIds: string;
  pages: number;
  limit: number;
  minApr: number;
  minEarnFee: number;
  minVolume: number;
  larkWebhookUrl: string;
  notifyCooldownMs: number;
  notifyStorePath: string;
}

interface NotifyState {
  notifiedAt: number;
  volume: number;
}

@Injectable()
export class PoolsMonitorService implements OnModuleInit {
  private readonly logger = new Logger(PoolsMonitorService.name);
  private running = false;
  private readonly notifyState = new Map<string, NotifyState>();
  private readonly config: MonitorConfig;
  private readonly volumeGrowthRatioForRenotify = 0.2;

  constructor() {
    this.config = {
      apiBaseUrl:
        process.env.KYBER_EARN_API_BASE_URL ??
        'https://earn-service.kyberswap.com/api/v1/explorer/pools',
      chainIds: process.env.KYBER_CHAIN_IDS ?? '8453,56',
      pages: this.readNumber('POOL_PAGES', 5),
      limit: this.readNumber('POOL_LIMIT', 10),
      minApr: this.readNumber('POOL_MIN_APR', 3000),
      minEarnFee: this.readNumber('POOL_MIN_EARN_FEE', 1000),
      minVolume: this.readNumber('POOL_MIN_VOLUME', 100_000),
      larkWebhookUrl: process.env.LARK_WEBHOOK_URL ?? '',
      notifyCooldownMs: this.readNumber(
        'POOL_NOTIFY_COOLDOWN_MS',
        1 * 24 * 60 * 60_000,
      ),
      notifyStorePath: process.env.POOL_NOTIFY_STORE_PATH ?? 'data/pool-notify.json',
    };
  }

  async onModuleInit(): Promise<void> {
    await this.loadNotifiedState();
    await this.runOnce();
  }

  @Cron('*/15 * * * *')
  private async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.log('skip run: previous run still in progress.');
      return;
    }
    this.running = true;
    const startedAt = Date.now();
    this.logger.log(
      `run start: pages=${this.config.pages} limit=${this.config.limit} chainIds=${this.config.chainIds}`,
    );
    try {
      const pools = await this.fetchPools();
      this.logger.log(`fetched pools: ${pools.length}`);
      const filtered = pools.filter((pool) => this.matches(pool));
      this.logger.log(`matched filters: ${filtered.length}`);
      const deduped = this.applyCooldown(filtered);
      this.logger.log(`after cooldown: ${deduped.length}`);
      if (deduped.length === 0) {
        this.logger.log('no pools to notify.');
        return;
      }

      await this.notifyLark(deduped);
      this.logger.log(`notified pools: ${deduped.length}`);
      const now = Date.now();
      for (const pool of deduped) {
        this.notifyState.set(pool.address.toLowerCase(), {
          notifiedAt: now,
          volume: pool.volume,
        });
      }
      await this.persistNotifiedState();
    } catch (error) {
      this.logger.error('run failed', error instanceof Error ? error.stack : `${error}`);
    } finally {
      const elapsedMs = Date.now() - startedAt;
      this.logger.log(`run end: ${elapsedMs}ms`);
      this.running = false;
    }
  }

  private async fetchPools(): Promise<Pool[]> {
    const pools: Pool[] = [];

    for (let page = 1; page <= this.config.pages; page += 1) {
      const params = new URLSearchParams({
        chainIds: this.config.chainIds,
        page: String(page),
        limit: String(this.config.limit),
        interval: '24h',
        protocol: '',
        tag: '',
        sortBy: 'earn_fee',
        orderBy: 'DESC',
        q: '',
      });

      const url = `${this.config.apiBaseUrl}?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Pools API failed: ${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as PoolsApiResponse;
      if (body.code !== 0 || !body.data?.pools) {
        throw new Error(`Pools API error: ${body.message || 'unknown error'}`);
      }

      pools.push(...body.data.pools);

      if (page < this.config.pages) {
        await this.delay(5000);
      }
    }

    return pools;
  }

  private matches(pool: Pool): boolean {
    return (
      pool.apr >= this.config.minApr &&
      pool.earnFee >= this.config.minEarnFee &&
      pool.volume >= this.config.minVolume
    );
  }

  private applyCooldown(pools: Pool[]): Pool[] {
    const now = Date.now();
    return pools.filter((pool) => {
      const key = pool.address.toLowerCase();
      const state = this.notifyState.get(key);
      if (!state) {
        return true;
      }

      const volumeGrowthBase = Math.max(state.volume, 0);
      const volumeIncreaseThreshold =
        volumeGrowthBase * (1 + this.volumeGrowthRatioForRenotify);
      if (pool.volume >= volumeIncreaseThreshold) {
        return true;
      }

      if (this.config.notifyCooldownMs <= 0) {
        return false;
      }

      return now - state.notifiedAt >= this.config.notifyCooldownMs;
    });
  }

  private async loadNotifiedState(): Promise<void> {
    const filePath = this.resolveStorePath();
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<
        string,
        number | { notifiedAt?: number; volume?: number }
      >;
      for (const [address, value] of Object.entries(data)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          this.notifyState.set(address.toLowerCase(), {
            notifiedAt: value,
            volume: 0,
          });
          continue;
        }

        if (
          value &&
          typeof value === 'object' &&
          Number.isFinite(value.notifiedAt) &&
          Number.isFinite(value.volume)
        ) {
          this.notifyState.set(address.toLowerCase(), {
            notifiedAt: value.notifiedAt,
            volume: value.volume,
          });
        }
      }
      this.logger.log(`loaded notified state: ${this.notifyState.size}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`failed to load notified state: ${String(error)}`);
      }
    }
  }

  private async persistNotifiedState(): Promise<void> {
    const filePath = this.resolveStorePath();
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const payload = JSON.stringify(Object.fromEntries(this.notifyState), null, 2);
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, payload, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  private resolveStorePath(): string {
    return path.isAbsolute(this.config.notifyStorePath)
      ? this.config.notifyStorePath
      : path.resolve(process.cwd(), this.config.notifyStorePath);
  }

  private async notifyLark(pools: Pool[]): Promise<void> {
    if (!this.config.larkWebhookUrl) {
      this.logger.warn('LARK_WEBHOOK_URL is not set. Skipping notify.');
      return;
    }

    const response = await fetch(this.config.larkWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: this.buildLarkCard(pools),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Lark notify failed: ${response.status} ${response.statusText} - ${body}`);
    }
  }

  private buildLarkCard(pools: Pool[]): Record<string, unknown> {
    const elements = pools.flatMap((pool) => [
      {
        tag: 'markdown',
        content: this.formatPoolMarkdown(pool),
      },
      {
        tag: 'hr',
      },
    ]);

    if (elements.length > 0) {
      elements.pop();
    }

    elements.push({
      tag: 'markdown',
      content: `Filters: apr>=${this.config.minApr}, earnFee>=${this.config.minEarnFee}, volume>=${this.config.minVolume}`,
    });

    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: `Pools matched: ${pools.length}`,
        },
      },
      elements,
    };
  }

  private formatPoolMarkdown(pool: Pool): string {
    const pair = pool.tokens.map((token) => token.symbol).join('/');
    const link = this.buildPoolLink(pool);
    const linkText = link ? `[link](${link})` : 'link: N/A';
    return [
      `**${pair}**`,
      `- chain: ${pool.chain.name}`,
      `- exchange: ${pool.exchange}`,
      `- apr: ${this.formatPercent(pool.apr)}`,
      `- earnFee: ${this.formatKmb(pool.earnFee)}`,
      `- volume: ${this.formatKmb(pool.volume)}`,
      `- tvl: ${this.formatKmb(pool.tvl)}`,
      `- address: \`${pool.address}\``,
      `- ${linkText}`,
    ].join('\n');
  }

  private buildPoolLink(pool: Pool): string | null {
    switch (pool.chain.id) {
      case 8453:
        return `https://basescan.org/address/${pool.address}`;
      case 56:
        return `https://bscscan.com/address/${pool.address}`;
      default:
        return null;
    }
  }

  private formatPercent(value: number): string {
    return `${this.formatFixed(value / 100)}%`;
  }

  private formatKmb(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) {
      return `${this.formatFixed(value / 1_000_000_000)}B`;
    }
    if (abs >= 1_000_000) {
      return `${this.formatFixed(value / 1_000_000)}M`;
    }
    if (abs >= 1_000) {
      return `${this.formatFixed(value / 1_000)}K`;
    }
    return this.formatFixed(value);
  }

  private formatFixed(value: number): string {
    return value.toFixed(1);
  }

  private readNumber(envKey: string, fallback: number): number {
    const raw = process.env[envKey];
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
