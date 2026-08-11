import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fetch as undiciFetch, type Dispatcher } from 'undici';
import { createDnsDispatcher } from '../network/dns-dispatcher';
import type {
  AddressReport,
  AddressStore,
  Position,
  PositionStats,
  PositionsApiResponse,
} from './lp-monitor.types';

interface LpMonitorConfig {
  apiBaseUrl: string;
  chainIds: string;
  protocols: string;
  statuses: string;
  pageSize: number;
  telegramBotToken: string;
  telegramChatId: string;
  telegramMessageThreadId?: number;
  storePath: string;
}

@Injectable()
export class LpMonitorService implements OnModuleInit {
  private readonly logger = new Logger(LpMonitorService.name);
  private readonly config: LpMonitorConfig;
  private readonly kyberDispatcher?: Dispatcher;
  private readonly addresses = new Set<string>();
  private running = false;

  constructor() {
    this.kyberDispatcher = createDnsDispatcher(process.env.DNS_SERVERS);
    this.config = {
      apiBaseUrl:
        process.env.KYBER_POSITIONS_API_BASE_URL ??
        'https://earn-service.kyberswap.com/api/v1/positions',
      chainIds: process.env.LP_MONITOR_CHAIN_IDS ?? '',
      protocols: process.env.LP_MONITOR_PROTOCOLS ?? '',
      statuses:
        process.env.LP_MONITOR_STATUSES ??
        'PositionStatusInRange,PositionStatusOutRange',
      pageSize: this.readNumber('LP_MONITOR_PAGE_SIZE', 20),
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
      telegramMessageThreadId: this.readOptionalNumber(
        'LP_MONITOR_TELEGRAM_MESSAGE_THREAD_ID',
      ),
      storePath:
        process.env.LP_MONITOR_STORE_PATH ?? 'data/lp-monitor-addresses.json',
    };
  }

  async onModuleInit(): Promise<void> {
    await this.loadAddresses();
    await this.runOnce('startup');
  }

  listAddresses(): string[] {
    return [...this.addresses];
  }

  async addAddress(rawAddress: string): Promise<string> {
    const address = this.normalizeAddress(rawAddress);
    if (this.addresses.has(address)) {
      return address;
    }

    this.addresses.add(address);
    await this.persistAddresses();
    this.logger.log(`address added: ${address}`);
    return address;
  }

  async removeAddress(rawAddress: string): Promise<string> {
    const address = this.normalizeAddress(rawAddress);
    if (!this.addresses.delete(address)) {
      throw new NotFoundException(`address not found: ${address}`);
    }

    await this.persistAddresses();
    this.logger.log(`address removed: ${address}`);
    return address;
  }

  async runManualCheck(): Promise<void> {
    await this.runOnce('manual');
  }

  @Cron('0 * * * *')
  private async runScheduledCheck(): Promise<void> {
    await this.runOnce('cron');
  }

  private async runOnce(trigger: 'startup' | 'cron' | 'manual'): Promise<void> {
    if (this.running) {
      this.logger.log(`skip ${trigger} run: previous run still in progress.`);
      return;
    }

    if (this.addresses.size === 0) {
      this.logger.log(`skip ${trigger} run: watch list is empty.`);
      return;
    }

    this.running = true;
    const startedAt = Date.now();
    this.logger.log(`run start: trigger=${trigger} addresses=${this.addresses.size}`);

    try {
      const reports: AddressReport[] = [];

      for (const address of this.addresses) {
        const report = await this.fetchAddressReport(address);
        reports.push(report);
      }

      await this.notifyTelegram(reports);
      this.logger.log(`notified addresses: ${reports.length}`);
    } catch (error) {
      this.logger.error('lp monitor run failed', error instanceof Error ? error.stack : `${error}`);
      throw error;
    } finally {
      this.running = false;
      this.logger.log(`run end: ${Date.now() - startedAt}ms`);
    }
  }

  private async fetchAddressReport(address: string): Promise<AddressReport> {
    const positions: Position[] = [];
    let page = 1;
    let totalItems = 0;
    let stats: PositionStats | null = null;

    do {
      const params = new URLSearchParams({
        wallet: address,
        chainIds: this.config.chainIds,
        protocols: this.config.protocols,
        statuses: this.config.statuses,
        keyword: '',
        sorts: 'valueUsd:desc',
        page: String(page),
        pageSize: String(this.config.pageSize),
      });

      const url = `${this.config.apiBaseUrl}?${params.toString()}`;
      const response = await undiciFetch(url, {
        dispatcher: this.kyberDispatcher,
      });
      if (!response.ok) {
        throw new Error(
          `Positions API failed for ${address}: ${response.status} ${response.statusText}`,
        );
      }

      const body = (await response.json()) as PositionsApiResponse;
      if (body.code !== 0 || !body.data?.positions || !body.data.stats) {
        throw new Error(
          `Positions API error for ${address}: ${body.message || 'unknown error'}`,
        );
      }

      positions.push(...body.data.positions);
      totalItems = body.data.stats.totalItems;
      stats = body.data.stats;
      page += 1;
    } while (positions.length < totalItems);

    return {
      address,
      positions,
      stats: stats ?? this.emptyStats(),
    };
  }

  private async notifyTelegram(reports: AddressReport[]): Promise<void> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) {
      this.logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set. Skipping notify.');
      return;
    }

    for (const report of reports) {
      if (report.positions.length === 0) {
        this.logger.log(`skip telegram notify for ${report.address}: no LP positions found.`);
        continue;
      }

      const text = this.buildTelegramMessage(report);
      const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
      const payload: {
        chat_id: string;
        text: string;
        parse_mode: 'HTML';
        disable_web_page_preview: true;
        message_thread_id?: number;
      } = {
        chat_id: this.config.telegramChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      if (this.config.telegramMessageThreadId !== undefined) {
        payload.message_thread_id = this.config.telegramMessageThreadId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Telegram notify failed for ${report.address}: ${response.status} ${response.statusText} - ${body}`,
        );
      }
    }
  }

  private buildTelegramMessage(report: AddressReport): string {
    const header = '<b>LP Monitor Update</b>';
    const summary = [
      `- address: <code>${report.address}</code>`,
      `- positions: ${report.stats.totalItems}`,
      `- total value: ${this.formatUsd(report.stats.totalValueUsd)}`,
      `- unclaimed fee: ${this.formatUsd(report.stats.totalUnclaimedFeeUsd)}`,
    ].join('\n');

    const positions = report.positions
      .map((position, index) => this.formatPosition(position, index + 1))
      .join('\n\n');

    return [header, summary, positions].join('\n\n');
  }

  private formatPosition(position: Position, index: number): string {
    const pair = position.pool.tokenAmounts.map((item) => item.token.symbol).join('/');
    const priceRange = position.extra?.priceRange;
    const rangeText =
      priceRange &&
      Number.isFinite(priceRange.min) &&
      Number.isFinite(priceRange.maxPrice)
        ? `${this.formatNumber(priceRange.min)} - ${this.formatNumber(priceRange.maxPrice)}`
        : 'N/A';

    return [
      `<b>${index}. ${pair || position.pool.address}</b>`,
      `- protocol: ${position.pool.protocol.name}`,
      `- status: ${position.status}`,
      `- position value: ${this.formatUsd(position.valueInUSD)}`,
      `- pool price: ${this.formatNumber(position.pool.price)}`,
      `- price range: ${rangeText}`,
      `- pool: <code>${position.pool.address}</code>`,
      `- positionId: <code>${position.positionId}</code>`,
    ].join('\n');
  }

  private async loadAddresses(): Promise<void> {
    const filePath = this.resolveStorePath();
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as AddressStore | string[];
      const addresses = Array.isArray(data) ? data : data.addresses;

      for (const address of addresses ?? []) {
        try {
          this.addresses.add(this.normalizeAddress(address));
        } catch (error) {
          this.logger.warn(`skip invalid stored address ${address}: ${String(error)}`);
        }
      }

      this.logger.log(`loaded lp monitor addresses: ${this.addresses.size}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`failed to load lp monitor addresses: ${String(error)}`);
      }
    }
  }

  private async persistAddresses(): Promise<void> {
    const filePath = this.resolveStorePath();
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const payload = JSON.stringify(
      {
        addresses: this.listAddresses(),
      } satisfies AddressStore,
      null,
      2,
    );
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, payload, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  private resolveStorePath(): string {
    return path.isAbsolute(this.config.storePath)
      ? this.config.storePath
      : path.resolve(process.cwd(), this.config.storePath);
  }

  private normalizeAddress(rawAddress: string): string {
    const address = rawAddress.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      throw new BadRequestException(`invalid evm address: ${rawAddress}`);
    }
    return address;
  }

  private formatUsd(value: number): string {
    return `$${this.formatNumber(value)}`;
  }

  private formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
      return 'N/A';
    }

    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`;
    }
    if (abs >= 1) {
      return value.toFixed(2);
    }
    return value.toFixed(6);
  }

  private readNumber(envKey: string, fallback: number): number {
    const raw = process.env[envKey];
    if (!raw) {
      return fallback;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  private readOptionalNumber(envKey: string): number | undefined {
    const raw = process.env[envKey];
    if (!raw) {
      return undefined;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  private emptyStats(): PositionStats {
    return {
      totalItems: 0,
      totalValueUsd: 0,
      totalEarnedFeeUsd: 0,
      totalClaimedFeeUsd: 0,
      totalUnclaimedFeeUsd: 0,
      totalClaimedRewardUsd: 0,
      totalUnclaimedRewardUsd: 0,
      totalPendingRewardUsd: 0,
    };
  }
}
