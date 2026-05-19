<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## LP Monitor

LP Monitor will check the watched wallet addresses every hour and send a Telegram notification for each address with one or more LP positions. The message includes:

- Total LP value
- Total unclaimed fee
- Current pool price for each LP position
- LP price range for each LP position

### Required Telegram env

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`TELEGRAM_BOT_TOKEN`
- Telegram bot token used to send messages.

`TELEGRAM_CHAT_ID`
- Target Telegram chat ID that receives LP monitor notifications.

### LP Monitor env

```bash
KYBER_POSITIONS_API_BASE_URL=https://earn-service.kyberswap.com/api/v1/positions
LP_MONITOR_CHAIN_IDS=
LP_MONITOR_PROTOCOLS=
LP_MONITOR_STATUSES=PositionStatusInRange,PositionStatusOutRange
LP_MONITOR_PAGE_SIZE=20
LP_MONITOR_STORE_PATH=data/lp-monitor-addresses.json
```

`KYBER_POSITIONS_API_BASE_URL`
- Base URL for the Kyber positions API.
- Default: `https://earn-service.kyberswap.com/api/v1/positions`
- Usually does not need to be changed unless you switch API environment or route through a proxy.

`LP_MONITOR_CHAIN_IDS`
- Optional `chainIds` filter passed to the positions API.
- Empty means no chain filter.
- Use comma-separated chain IDs if you want to limit monitoring to specific chains.

`LP_MONITOR_PROTOCOLS`
- Optional `protocols` filter passed to the positions API.
- Empty means no protocol filter.

`LP_MONITOR_STATUSES`
- `statuses` filter passed to the positions API.
- Default: `PositionStatusInRange,PositionStatusOutRange`
- This keeps the monitor aligned with the current in-range and out-of-range LP use case.

`LP_MONITOR_PAGE_SIZE`
- Page size for each positions API request.
- Default: `20`
- The service will continue paging until all LP positions for the address are fetched.

`LP_MONITOR_STORE_PATH`
- Local JSON file path used to persist the watched address list.
- Default: `data/lp-monitor-addresses.json`
- Addresses added or removed through the API are written here immediately, so they survive process restarts.

### API usage

Start the app:

```bash
pnpm start:dev
```

List watched addresses:

```bash
curl http://localhost:3000/lp-monitor/addresses
```

Add a watched address:

```bash
curl -X POST http://localhost:3000/lp-monitor/addresses \
  -H 'Content-Type: application/json' \
  -d '{"address":"0x9Bb8491b92734c924c86274C5a07c15ceC1f57eC"}'
```

Remove a watched address:

```bash
curl -X DELETE http://localhost:3000/lp-monitor/addresses/0x9Bb8491b92734c924c86274C5a07c15ceC1f57eC
```

Trigger one manual check immediately:

```bash
curl -X POST http://localhost:3000/lp-monitor/run
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
