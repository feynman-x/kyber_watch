import { OkxSourceClient } from './okx-source.client';
import { OkxSourceService } from './okx-source.service';
import {
  OKX_FOCUS_CHAINS,
  type OkxTokenRankingItem,
} from './okx-source.types';

describe('OkxSourceService', () => {
  const token = (
    chainIndex: string,
    tokenContractAddress: string,
    tokenSymbol: string,
  ): OkxTokenRankingItem => ({
    chainIndex,
    tokenContractAddress,
    tokenSymbol,
  });

  let client: {
    isConfigured: jest.Mock;
    fetchHotTokens: jest.Mock;
    fetchTokenToplist: jest.Mock;
  };
  let service: OkxSourceService;

  beforeEach(() => {
    client = {
      isConfigured: jest.fn().mockReturnValue(true),
      fetchHotTokens: jest.fn(),
      fetchTokenToplist: jest.fn(),
    };
    service = new OkxSourceService(client as unknown as OkxSourceClient);
  });

  it('uses the configured five focus chains', () => {
    expect(OKX_FOCUS_CHAINS).toEqual([
      { chainIndex: '1', chainName: 'Ethereum' },
      { chainIndex: '501', chainName: 'Solana' },
      { chainIndex: '56', chainName: 'BNB Chain' },
      { chainIndex: '4663', chainName: 'Robinhood' },
      { chainIndex: '8453', chainName: 'Base' },
    ]);
  });

  it('keeps the global rank while filtering hot tokens to focus chains', async () => {
    client.fetchHotTokens.mockResolvedValue([
      token('10', '0x-unsupported', 'OTHER'),
      token('1', '0xAbC', 'ETH-TOKEN'),
      token('501', 'SolAddress', 'SOL-TOKEN'),
      token('1', '0xabc', 'DUPLICATE'),
    ]);

    const history = await service.refresh('hot-trending');

    expect(client.fetchHotTokens).toHaveBeenCalledWith('4');
    expect(history.current?.rawItemCount).toBe(4);
    expect(history.current?.tokens).toEqual([
      expect.objectContaining({
        key: '1:0xabc',
        chainName: 'Ethereum',
        globalRank: 2,
        focusRank: 1,
      }),
      expect.objectContaining({
        key: '501:soladdress',
        chainName: 'Solana',
        globalRank: 3,
        focusRank: 2,
      }),
    ]);
  });

  it('calculates rank changes against the previous successful snapshot', async () => {
    client.fetchHotTokens
      .mockResolvedValueOnce([
        token('1', '0xabc', 'ETH-TOKEN'),
        token('10', '0x-unsupported', 'OTHER'),
        token('501', 'SolAddress', 'SOL-TOKEN'),
      ])
      .mockResolvedValueOnce([
        token('501', 'SolAddress', 'SOL-TOKEN'),
        token('10', '0x-unsupported', 'OTHER'),
        token('1', '0xabc', 'ETH-TOKEN'),
      ]);

    await service.refresh('hot-trending');
    const history = await service.refresh('hot-trending');

    expect(history.previous?.tokens[0]).toEqual(
      expect.objectContaining({ key: '1:0xabc', focusRank: 1, globalRank: 1 }),
    );
    expect(history.current?.tokens[0]).toEqual(
      expect.objectContaining({
        key: '501:soladdress',
        previousFocusRank: 2,
        focusRankChange: 1,
        previousGlobalRank: 3,
        globalRankChange: 2,
      }),
    );
  });

  it('uses the five-chain combined gainers definition', async () => {
    client.fetchTokenToplist.mockResolvedValue([
      token('4663', '0xRobinhood', 'HOOD-TOKEN'),
    ]);

    const history = await service.refresh('top-gainers');

    expect(client.fetchTokenToplist).toHaveBeenCalledWith('2', '1');
    expect(history.current?.scope).toBe('focus-chains-combined');
    expect(history.current?.tokens[0]).toEqual(
      expect.objectContaining({
        chainName: 'Robinhood',
        globalRank: null,
        focusRank: 1,
      }),
    );
  });

  it('preserves the last successful snapshot when a refresh fails', async () => {
    client.fetchHotTokens
      .mockResolvedValueOnce([token('8453', '0xbase', 'BASE-TOKEN')])
      .mockRejectedValueOnce(new Error('temporary OKX failure'));

    const successful = await service.refresh('hot-trending');
    await expect(service.refresh('hot-trending')).rejects.toThrow(
      'temporary OKX failure',
    );

    const history = service.getSnapshot('hot-trending');
    expect(history.current).toBe(successful.current);
    expect(history.previous).toBeNull();
    expect(history.lastError).toBe('temporary OKX failure');
  });
});
