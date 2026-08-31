import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 18 * * *', { timeZone: 'America/Bogota' })
  async inactivityReminder() {
    try {
      const now = new Date();
      const hours72Ago = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      const hours96Ago = new Date(now.getTime() - 96 * 60 * 60 * 1000);

      const users = await this.prisma.user.findMany({
        where: {
          lastSeen: { gte: hours96Ago, lt: hours72Ago },
        },
        select: { id: true },
      });

      if (users.length === 0) {
        return;
      }

      this.logger.log(
        `Inactivity reminder: sending to ${users.length} user(s)`,
      );

      const title = 'Te extrañamos 🥺';
      const body =
        'Tus prospectos te extrañan. Entra para ver quién está en línea cerca de ti.';
      const data = { url: 'cuyamor://' };

      for (const { id } of users) {
        this.notifications
          .sendPushNotification(id, title, body, data)
          .catch(() => {});
      }
    } catch (error) {
      this.logger.error('Inactivity reminder cron failed', error as Error);
    }
  }

  @Cron('0 10 * * *', { timeZone: 'America/Bogota' })
  async expiredBenefitsReminder() {
    try {
      const now = new Date();
      const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            {
              isLeyenda: false,
              leyendaExpiresAt: { gte: hours24Ago, lt: now },
            },
            {
              isNinja: false,
              ninjaExpiresAt: { gte: hours24Ago, lt: now },
            },
          ],
        },
        select: { id: true },
      });

      if (users.length === 0) {
        return;
      }

      this.logger.log(
        `Expired benefits reminder: sending to ${users.length} user(s)`,
      );

      const title = 'Tus poderes han terminado ⚡';
      const body =
        'Tus beneficios exclusivos han caducado. ¡Actívalos de nuevo para seguir destacando en tu ciudad!';
      const data = { url: 'cuyamor://store' };

      for (const { id } of users) {
        this.notifications
          .sendPushNotification(id, title, body, data)
          .catch(() => {});
      }
    } catch (error) {
      this.logger.error(
        'Expired benefits reminder cron failed',
        error as Error,
      );
    }
  }

  @Cron('0 20 * * *', { timeZone: 'America/Bogota' })
  async compatibilityRadar() {
    try {
      const now = new Date();
      const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const recentNewcomers = await this.prisma.user.findMany({
        where: { createdAt: { gte: hours24Ago } },
        select: { id: true, city: true, gender: true },
      });

      if (recentNewcomers.length === 0) {
        return;
      }

      const activeUsers = await this.prisma.user.findMany({
        where: {
          lastSeen: { gte: days7Ago },
        },
        select: {
          id: true,
          city: true,
          interestedIn: true,
        },
      });

      if (activeUsers.length === 0) {
        return;
      }

      const notifiedUserIds = new Set<string>();

      for (const user of activeUsers) {
        if (notifiedUserIds.has(user.id)) {
          continue;
        }

        const city = user.city ?? 'Pasto';
        const interestedIn = user.interestedIn;

        const matchingNewcomers = recentNewcomers.filter((n) => {
          if (n.city !== city) {
            return false;
          }
          if (!interestedIn || !n.gender) {
            return true;
          }
          if (interestedIn === 'BOTH') {
            return n.gender === 'MALE' || n.gender === 'FEMALE';
          }
          if (interestedIn === 'WOMEN' && n.gender === 'FEMALE') {
            return true;
          }
          if (interestedIn === 'MEN' && n.gender === 'MALE') {
            return true;
          }
          return false;
        });

        if (matchingNewcomers.length === 0) {
          continue;
        }

        notifiedUserIds.add(user.id);

        this.notifications
          .sendPushNotification(
            user.id,
            'Nuevos perfiles cerca de ti 👀',
            'Alguien nuevo que encaja con tus gustos acaba de unirse. ¡Entra a descubrir de quién se trata!',
            { url: 'cuyamor://' },
          )
          .catch(() => {});
      }

      if (notifiedUserIds.size > 0) {
        this.logger.log(
          `Compatibility radar: sent to ${notifiedUserIds.size} user(s)`,
        );
      }
    } catch (error) {
      this.logger.error('Compatibility radar cron failed', error as Error);
    }
  }
}
