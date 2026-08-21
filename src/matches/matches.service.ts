import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly messageSelect = {
    id: true,
    content: true,
    isRead: true,
    isPriority: true,
    createdAt: true,
    senderId: true,
    recipientId: true,
    replyToId: true,
  } as const;

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
            gender: true,
            lastSeen: true,
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
            gender: true,
            lastSeen: true,
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
          gender: otherUser.gender,
          lastSeen: otherUser.lastSeen,
          avatarUrl: otherUser.photos[0]?.url ?? null,
        },
        lastMessage,
        hasUnread: lastMessage
          ? !lastMessage.isRead && lastMessage.senderId !== userId
          : false,
      };
    });
  }

  async getMatchMessages(matchId: string, userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    await this.prisma.message.updateMany({
      where: {
        matchId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    return this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
      select: this.messageSelect,
    });
  }

  async createMessage(
    matchId: string,
    userId: string,
    content: string,
    replyToId?: string,
  ) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true, user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    if (replyToId) {
      const replyTo = await this.prisma.message.findFirst({
        where: { id: replyToId, matchId },
        select: { id: true },
      });
      if (!replyTo) {
        throw new NotFoundException('Mensaje a responder no encontrado');
      }
    }

    const recipientId =
      match.user1Id === userId ? match.user2Id : match.user1Id;

    return this.prisma.message.create({
      data: {
        content,
        matchId,
        senderId: userId,
        recipientId,
        replyToId,
      },
      select: this.messageSelect,
    });
  }
}
