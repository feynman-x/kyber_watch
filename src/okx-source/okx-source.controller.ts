import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { OkxSourceService } from './okx-source.service';
import {
  isOkxSnapshotType,
  type OkxSnapshotType,
} from './okx-source.types';

interface RefreshBody {
  type?: OkxSnapshotType;
}

@Controller('okx-source')
export class OkxSourceController {
  constructor(private readonly okxSourceService: OkxSourceService) {}

  @Get('snapshots')
  getSnapshots() {
    return this.okxSourceService.getAllSnapshots();
  }

  @Get('snapshots/:type')
  getSnapshot(@Param('type') type: string) {
    if (!isOkxSnapshotType(type)) {
      throw new BadRequestException(`unknown snapshot type: ${type}`);
    }

    return this.okxSourceService.getSnapshot(type);
  }

  @Post('refresh')
  async refresh(@Body() body?: RefreshBody) {
    if (!body?.type) {
      return this.okxSourceService.refreshAll('manual');
    }

    if (!isOkxSnapshotType(body.type)) {
      throw new BadRequestException(`unknown snapshot type: ${body.type}`);
    }

    return this.okxSourceService.refresh(body.type, 'manual');
  }
}
