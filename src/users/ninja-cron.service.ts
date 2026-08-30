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

  @Cron('0 0 * * *')
  async deactivateExpiredLeyenda() {
    try {
      const result = await this.prisma.user.updateMany({
        where: {
          isLeyenda: true,
          leyendaExpiresAt: { lte: new Date() },
        },
        data: {
          isLeyenda: false,
          leyendaExpiresAt: null,
          dailyZumbidosLeft: 0,
          dailyCuyazosLeft: 0,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Suscripción Cuy Leyenda expirada para ${result.count} usuario(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'No se pudo procesar la expiración de Cuy Leyenda',
        error as Error,
      );
    }
  }

  @Cron('5 0 * * *')
  async resetDailyLeyendaPerks() {
    try {
      const result = await this.prisma.user.updateMany({
        where: { isLeyenda: true },
        data: { dailyZumbidosLeft: 3, dailyCuyazosLeft: 1 },
      });

      if (result.count > 0) {
        this.logger.log(
          `Perks diarios de Cuy Leyenda reiniciados para ${result.count} usuario(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'No se pudo reiniciar los perks diarios de Cuy Leyenda',
        error as Error,
      );
    }
  }
}
