import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MessageType } from '@prisma/client';

import { SupabaseStorageService } from '../common/supabase-storage.service';
import { PrismaService } from '../prisma/prisma.service';

const MEDIA_RETENTION_DAYS = 15;
const CLEANUP_BATCH_SIZE = 200;

@Injectable()
export class ChatMediaCleanupService {
  private readonly logger = new Logger(ChatMediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'America/Bogota' })
  async cleanupExpiredChatMedia() {
    try {
      const cutoff = new Date(
        Date.now() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );

      const expired = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: cutoff },
          mediaUrl: { not: null },
          type: { in: [MessageType.IMAGE, MessageType.AUDIO] },
        },
        select: { id: true, mediaUrl: true },
        take: CLEANUP_BATCH_SIZE,
        orderBy: { createdAt: 'asc' },
      });

      if (expired.length === 0) {
        return;
      }

      let cleaned = 0;
      for (const message of expired) {
        if (message.mediaUrl) {
          await this.storage.deleteObject(message.mediaUrl);
        }

        // Keep the text history: only drop the media reference and
        // fall back to the readable placeholder as text.
        await this.prisma.message.update({
          where: { id: message.id },
          data: { mediaUrl: null },
        });
        cleaned += 1;
      }

      this.logger.log(
        `Chat media expirada: ${cleaned} adjunto(s) liberados (>${MEDIA_RETENTION_DAYS} días)`,
      );
    } catch (error) {
      this.logger.error(
        'No se pudo limpiar la multimedia expirada del chat',
        error as Error,
      );
    }
  }
}
