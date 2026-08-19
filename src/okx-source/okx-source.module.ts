import { Module } from '@nestjs/common';
import { OkxSourceClient } from './okx-source.client';
import { OkxSourceController } from './okx-source.controller';
import { OkxSourceService } from './okx-source.service';

@Module({
  controllers: [OkxSourceController],
  providers: [OkxSourceClient, OkxSourceService],
  exports: [OkxSourceService],
})
export class OkxSourceModule {}
