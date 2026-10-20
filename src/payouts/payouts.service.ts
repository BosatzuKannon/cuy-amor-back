import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listPayouts(status?: PayoutStatus) {
    return this.prisma.payoutRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async approvePayout(payoutId: string) {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true, userId: true },
    });

    if (!payout) {
      throw new NotFoundException('Solicitud de pago no encontrada');
    }

    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `La solicitud ya está en estado ${payout.status}`,
      );
    }

    const updated = await this.prisma.payoutRequest.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.PROCESSING },
      select: { id: true, status: true, amountInCents: true },
    });

    this.notifications
      .sendPushNotification(
        payout.userId,
        'Retiro Aprobado 💸',
        'Tu solicitud de pago ha sido aprobada y el dinero va en camino a tu cuenta.',
        { url: 'cuyamor://wallet' },
      )
      .catch(() => {});

    return updated;
  }

  async rejectPayout(payoutId: string, adminNotes?: string) {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true, userId: true, amountInCents: true },
    });

    if (!payout) {
      throw new NotFoundException('Solicitud de pago no encontrada');
    }

    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `La solicitud ya está en estado ${payout.status}`,
      );
    }

    // Rechazar devuelve el dinero al balance del usuario (ya se descontó al solicitar).
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutRequest.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.REJECTED,
          ...(adminNotes ? { adminNotes } : {}),
        },
        select: { id: true, status: true, amountInCents: true },
      });

      await tx.user.update({
        where: { id: payout.userId },
        data: {
          cashBalanceInCents: { increment: payout.amountInCents },
        },
      });

      return result;
    });

    this.notifications
      .sendPushNotification(
        payout.userId,
        'Retiro Rechazado',
        'Tu solicitud de pago fue rechazada. El monto volvió a tu saldo disponible.',
        { url: 'cuyamor://wallet' },
      )
      .catch(() => {});

    return updated;
  }
}
