import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { LpMonitorService } from './lp-monitor.service';

interface AddressBody {
  address?: string;
}

@Controller('lp-monitor')
export class LpMonitorController {
  constructor(private readonly lpMonitorService: LpMonitorService) {}

  @Get('addresses')
  listAddresses() {
    return { addresses: this.lpMonitorService.listAddresses() };
  }

  @Post('addresses')
  async addAddress(@Body() body: AddressBody) {
    if (!body?.address) {
      throw new BadRequestException('address is required');
    }

    const address = await this.lpMonitorService.addAddress(body.address);
    return { address };
  }

  @Delete('addresses/:address')
  async removeAddress(@Param('address') address: string) {
    const removed = await this.lpMonitorService.removeAddress(address);
    return { removed };
  }

  @Post('run')
  async runNow() {
    await this.lpMonitorService.runManualCheck();
    return { success: true };
  }
}
