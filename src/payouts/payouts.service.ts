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
}
