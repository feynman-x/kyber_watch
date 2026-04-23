import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LpMonitorController } from './lp-monitor/lp-monitor.controller';
import { LpMonitorService } from './lp-monitor/lp-monitor.service';
import { PoolsMonitorService } from './pools/pools.monitor.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot()],
  controllers: [AppController, LpMonitorController],
  providers: [AppService, PoolsMonitorService, LpMonitorService],
})
export class AppModule {}
