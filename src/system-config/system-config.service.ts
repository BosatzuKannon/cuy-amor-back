import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SystemConfig } from '@prisma/client';

const DEFAULT_CONFIG_KEY = 'app';

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<SystemConfig> {
    const existing = await this.prisma.systemConfig.findUnique({
      where: { key: DEFAULT_CONFIG_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.systemConfig.create({
      data: {
        key: DEFAULT_CONFIG_KEY,
      },
    });
  }
}
