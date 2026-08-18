import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: {
          select: {
            id: true,
            firstName: true,
            photos: {
              where: { isProfile: true },
              orderBy: { order: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        user2: {
          select: {
            id: true,
            firstName: true,
            photos: {
              where: { isProfile: true },
              orderBy: { order: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            isRead: true,
            senderId: true,
            recipientId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => {
      const isUser1 = match.user1Id === userId;
      const otherUser = isUser1 ? match.user2 : match.user1;
      const lastMessage = match.messages[0] ?? null;

      return {
        id: match.id,
        createdAt: match.createdAt,
        otherUser: {
          id: otherUser.id,
          firstName: otherUser.firstName,
          avatarUrl: otherUser.photos[0]?.url ?? null,
        },
        lastMessage,
        hasUnread: lastMessage
          ? !lastMessage.isRead && lastMessage.senderId !== userId
          : false,
      };
    });
  }
}
