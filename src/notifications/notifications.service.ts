import { Injectable, Logger } from '@nestjs/common';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo();

  constructor(private readonly prisma: PrismaService) {}

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const devices = await this.prisma.device.findMany({
        where: { userId },
        select: { pushToken: true },
      });

      const messages: ExpoPushMessage[] = [];

      for (const { pushToken } of devices) {
        if (!Expo.isExpoPushToken(pushToken)) {
          this.logger.warn(
            `[notifications] Invalid Expo push token skipped: ${String(pushToken).slice(0, 32)}...`,
          );
          continue;
        }

        messages.push({
          to: pushToken,
          sound: 'default',
          title,
          body,
          data: data ?? {},
        });
      }

      if (messages.length === 0) {
        return;
      }

      const chunks = this.expo.chunkPushNotifications(messages);

      for (const chunk of chunks) {
        try {
          const tickets = await this.expo.sendPushNotificationsAsync(chunk);
          for (const ticket of tickets) {
            if (ticket.status === 'error') {
              this.logger.warn(
                `[notifications] Ticket error for user ${userId}: ${ticket.message ?? ticket.details?.error ?? 'unknown'}`,
              );
            }
          }
        } catch (chunkError) {
          this.logger.error(
            `[notifications] Failed to send chunk to user ${userId}:`,
            chunkError,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `[notifications] push notification dispatch failed for user ${userId}:`,
        error,
      );
    }
  }
}