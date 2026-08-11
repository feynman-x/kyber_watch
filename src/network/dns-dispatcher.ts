import { Resolver } from 'node:dns';
import { Agent } from 'undici';

export function createDnsDispatcher(rawServers?: string): Agent | undefined {
  const servers = rawServers
    ?.split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (!servers?.length) {
    return undefined;
  }

  const resolver = new Resolver();
  resolver.setServers(servers);

  return new Agent({
    connect: {
      family: 4,
      lookup(hostname, options, callback) {
        resolver.resolve4(hostname, (error, addresses) => {
          if (error) {
            callback(error, '', 4);
            return;
          }

          if (addresses.length === 0) {
            const notFoundError = new Error(
              `No IPv4 address found for ${hostname}`,
            ) as NodeJS.ErrnoException;
            notFoundError.code = 'ENOTFOUND';
            callback(notFoundError, '', 4);
            return;
          }

          if (options.all) {
            callback(
              null,
              addresses.map((address) => ({ address, family: 4 })),
            );
            return;
          }

          callback(null, addresses[0], 4);
        });
      },
    },
  });
}
