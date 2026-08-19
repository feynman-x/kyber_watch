import {
  createOkxSignature,
  resolveOkxDnsServers,
} from './okx-source.client';

describe('createOkxSignature', () => {
  it('signs the complete GET path including query parameters', () => {
    const signature = createOkxSignature(
      '2026-08-12T00:00:00.000Z',
      'GET',
      '/api/v6/dex/market/token/hot-token?rankingType=4&limit=100',
      'secret',
    );

    expect(signature).toBe('yx5c3k4rQ9X4lBNat8inKsUMVbRZP0lIdWYKnR+m9Uo=');
  });
});

describe('resolveOkxDnsServers', () => {
  it('prefers the OKX-specific DNS configuration', () => {
    expect(resolveOkxDnsServers('okx-dns', 'shared-dns')).toBe('okx-dns');
  });

  it('falls back to the shared DNS configuration', () => {
    expect(resolveOkxDnsServers(undefined, 'shared-dns')).toBe('shared-dns');
  });
});
