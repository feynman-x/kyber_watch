import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OkxSourceClient } from './okx-source.client';
import {
  OKX_FOCUS_CHAINS,
  OKX_SNAPSHOT_TYPES,
  type OkxRankedToken,
  type OkxRankingSnapshot,
  type OkxSnapshotHistory,
  type OkxSnapshotType,
  type OkxTokenRankingItem,
} from './okx-source.types';

interface SnapshotDefinition {
  scope: OkxRankingSnapshot['scope'];
  fetch: () => Promise<OkxTokenRankingItem[]>;
}

@Injectable()
export class OkxSourceService implements OnModuleInit {
  private readonly logger = new Logger(OkxSourceService.name);
  private readonly running = new Set<OkxSnapshotType>();
  private readonly snapshots = new Map<OkxSnapshotType, OkxSnapshotHistory>();
  private readonly focusChainNames = new Map<string, string>(
    OKX_FOCUS_CHAINS.map((chain) => [chain.chainIndex, chain.chainName]),
  );

  constructor(private readonly client: OkxSourceClient) {
    for (const type of OKX_SNAPSHOT_TYPES) {
      this.snapshots.set(type, {
        current: null,
        previous: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null,
      });
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.isConfigured()) {
      this.logger.warn(
        'OKX API credentials are not configured. Scheduled collection is disabled until restart with credentials.',
      );
      return;
    }

    await this.refreshAll('startup');
  }

  getAllSnapshots(): Record<OkxSnapshotType, OkxSnapshotHistory> {
    return Object.fromEntries(
      OKX_SNAPSHOT_TYPES.map((type) => [type, this.getSnapshot(type)]),
    ) as Record<OkxSnapshotType, OkxSnapshotHistory>;
  }

  getSnapshot(type: OkxSnapshotType): OkxSnapshotHistory {
    return (
      this.snapshots.get(type) ?? {
        current: null,
        previous: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null,
      }
    );
  }

  async refreshAll(
    trigger: 'startup' | 'cron' | 'manual' = 'manual',
  ): Promise<Record<OkxSnapshotType, OkxSnapshotHistory>> {
    for (const type of OKX_SNAPSHOT_TYPES) {
      try {
        await this.refresh(type, trigger);
      } catch (error) {
        this.logger.error(
          `refresh failed: type=${type} trigger=${trigger}`,
          this.formatError(error),
        );
      }
    }

    return this.getAllSnapshots();
  }

  async refresh(
    type: OkxSnapshotType,
    trigger: 'startup' | 'cron' | 'manual' = 'manual',
  ): Promise<OkxSnapshotHistory> {
    if (this.running.has(type)) {
      this.logger.log(`skip ${type} ${trigger}: previous run still in progress.`);
      return this.getSnapshot(type);
    }

    this.running.add(type);
    const startedAt = Date.now();
    const attemptedAt = new Date().toISOString();
    this.logger.log(`refresh start: type=${type} trigger=${trigger}`);

    try {
      const definition = this.getDefinition(type);
      const rawTokens = await definition.fetch();
      const currentHistory = this.getSnapshot(type);
      const snapshot = this.buildSnapshot(
        type,
        definition.scope,
        rawTokens,
        currentHistory.current,
      );
      const history = {
        current: snapshot,
        previous: currentHistory.current,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: snapshot.fetchedAt,
        lastError: null,
      };
      this.snapshots.set(type, history);
      this.logger.log(
        `refresh success: type=${type} raw=${snapshot.rawItemCount} focus=${snapshot.tokens.length}`,
      );
      return history;
    } catch (error) {
      const currentHistory = this.getSnapshot(type);
      this.snapshots.set(type, {
        ...currentHistory,
        lastAttemptAt: attemptedAt,
        lastError: this.getErrorMessage(error),
      });
      throw error;
    } finally {
      this.running.delete(type);
      this.logger.log(
        `refresh end: type=${type} elapsedMs=${Date.now() - startedAt}`,
      );
    }
  }

  @Cron('10 */5 * * * *')
  private async refreshHotTrending(): Promise<void> {
    await this.runScheduled('hot-trending');
  }

  @Cron('30 */15 * * * *')
  private async refreshHotXMentioned(): Promise<void> {
    await this.runScheduled('hot-x-mentioned');
  }

  @Cron('0 */3 * * * *')
  private async refreshTopGainers(): Promise<void> {
    await this.runScheduled('top-gainers');
  }

  @Cron('20 */5 * * * *')
  private async refreshTopVolume(): Promise<void> {
    await this.runScheduled('top-volume');
  }

  @Cron('0 5 0 * * *')
  private async refreshTopMarketCap(): Promise<void> {
    await this.runScheduled('top-market-cap');
  }

  private async runScheduled(type: OkxSnapshotType): Promise<void> {
    if (!this.client.isConfigured()) {
      return;
    }

    try {
      await this.refresh(type, 'cron');
    } catch (error) {
      this.logger.error(
        `scheduled refresh failed: type=${type}`,
        this.formatError(error),
      );
    }
  }

  private getDefinition(type: OkxSnapshotType): SnapshotDefinition {
    switch (type) {
      case 'hot-trending':
        return {
          scope: 'all-chains-filtered',
          fetch: () => this.client.fetchHotTokens('4'),
        };
      case 'hot-x-mentioned':
        return {
          scope: 'all-chains-filtered',
          fetch: () => this.client.fetchHotTokens('5'),
        };
      case 'top-gainers':
        return {
          scope: 'focus-chains-combined',
          fetch: () => this.client.fetchTokenToplist('2', '1'),
        };
      case 'top-volume':
        return {
          scope: 'focus-chains-combined',
          fetch: () => this.client.fetchTokenToplist('5', '2'),
        };
      case 'top-market-cap':
        return {
          scope: 'focus-chains-combined',
          fetch: () => this.client.fetchTokenToplist('6', '4'),
        };
    }
  }

  private buildSnapshot(
    type: OkxSnapshotType,
    scope: OkxRankingSnapshot['scope'],
    rawTokens: OkxTokenRankingItem[],
    previous: OkxRankingSnapshot | null,
  ): OkxRankingSnapshot {
    const previousByKey = new Map(
      previous?.tokens.map((token) => [token.key, token]) ?? [],
    );
    const seen = new Set<string>();
    const rankedTokens: OkxRankedToken[] = [];

    rawTokens.forEach((token, index) => {
      const chainName = this.focusChainNames.get(String(token.chainIndex));
      const address = token.tokenContractAddress?.trim();
      if (!chainName || !address) {
        return;
      }

      const key = this.buildTokenKey(String(token.chainIndex), address);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      const focusRank = rankedTokens.length + 1;
      const globalRank = scope === 'all-chains-filtered' ? index + 1 : null;
      const previousToken = previousByKey.get(key);
      rankedTokens.push({
        ...token,
        chainIndex: String(token.chainIndex),
        tokenContractAddress: address,
        key,
        chainName,
        focusRank,
        globalRank,
        chainRank: null,
        previousFocusRank: previousToken?.focusRank ?? null,
        focusRankChange: previousToken
          ? previousToken.focusRank - focusRank
          : null,
        previousGlobalRank: previousToken?.globalRank ?? null,
        globalRankChange:
          previousToken?.globalRank != null && globalRank != null
            ? previousToken.globalRank - globalRank
            : null,
      });
    });

    return {
      type,
      scope,
      fetchedAt: new Date().toISOString(),
      rawItemCount: rawTokens.length,
      tokens: rankedTokens,
    };
  }

  private buildTokenKey(chainIndex: string, address: string): string {
    return `${chainIndex}:${address.toLowerCase()}`;
  }

  private formatError(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }

    return error.stack ?? `${error.name}: ${error.message}`;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
