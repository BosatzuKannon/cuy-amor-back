import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NinjaCronService {
  private readonly logger = new Logger(NinjaCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async deactivateExpiredNinjas() {
    try {
      const result = await this.prisma.user.updateMany({
        where: {
          isNinja: true,
          ninjaExpiresAt: { lte: new Date() },
        },
        data: { isNinja: false, ninjaExpiresAt: null },
      });

      if (result.count > 0) {
        this.logger.log(
          `Modo Cuy Ninja expirado para ${result.count} usuario(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'No se pudo procesar la expiración del modo Cuy Ninja',
        error as Error,
      );
    }
  }
}
