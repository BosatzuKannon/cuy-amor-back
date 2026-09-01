import { Controller, Get } from '@nestjs/common';

import { SystemConfigService } from './system-config.service';

@Controller('system')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('config')
  async getConfig() {
    const config = await this.systemConfigService.getConfig();
    return {
      minVersionCode: config.minVersionCode,
      latestVersionCode: config.latestVersionCode,
      appStatus: config.appStatus,
      appStatusMessage: config.appStatusMessage,
      updateUrl: config.updateUrl,
    };
  }
}
