import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

type WompiTransactionPayload = {
  id?: string;
  status?: string;
  amount_in_cents?: number;
  reference?: string;
  customer_email?: string;
};

type WompiEventBody = {
  event?: string;
  data?: { transaction?: WompiTransactionPayload };
  signature?: { checksum?: string; properties?: string[] };
  timestamp?: number;
};

function isWompiEventBody(value: unknown): value is WompiEventBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WompiEventBody).data === 'object'
  );
}

const CREDITED_STATUSES = new Set(['APPROVED']);
const REJECTED_STATUSES = new Set(['DECLINED', 'VOIDED', 'ERROR']);

@Injectable()
export class WompiService {
  private readonly logger = new Logger(WompiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Procesa el evento `transaction.updated` de Wompi.
   * Siempre responde sin lanzar errores para evitar reintentos infinitos.
   */
  async handleTransactionEvent(rawBody: unknown): Promise<void> {
    if (!isWompiEventBody(rawBody)) {
      this.logger.warn('Webhook de Wompi con cuerpo inválido');
      return;
    }

    const body = rawBody;
    const transaction = body.data?.transaction;

    if (!transaction?.reference) {
      this.logger.warn('Webhook de Wompi sin transacción o referencia');
      return;
    }

    if (!this.isSignatureValid(body, transaction)) {
      this.logger.warn(
        `Firma inválida para la referencia ${transaction.reference}; evento ignorado`,
      );
      return;
    }

    const dbTransaction = await this.prisma.transaction.findUnique({
      where: { reference: transaction.reference },
      include: { user: { select: { id: true } } },
    });

    if (!dbTransaction) {
      this.logger.warn(
        `Referencia ${transaction.reference} no encontrada en la base de datos`,
      );
      return;
    }

    if (
      typeof transaction.amount_in_cents === 'number' &&
      transaction.amount_in_cents !== dbTransaction.amountInCents
    ) {
      this.logger.error(
        `Monto inconsistente para ${dbTransaction.reference}: esperado ${dbTransaction.amountInCents}, recibido ${transaction.amount_in_cents}`,
      );
      return;
    }

    if (CREDITED_STATUSES.has(transaction.status ?? '')) {
      await this.creditCoins(
        dbTransaction.id,
        dbTransaction.coinsAmount,
        dbTransaction.user.id,
        transaction.id,
      );
      return;
    }

    if (REJECTED_STATUSES.has(transaction.status ?? '')) {
      await this.prisma.transaction.updateMany({
        where: { id: dbTransaction.id, status: 'PENDING' },
        data: { status: 'DECLINED' },
      });
    }
  }

  private async creditCoins(
    transactionId: string,
    coinsAmount: number | null,
    userId: string,
    wompiTransactionId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.updateMany({
        where: { id: transactionId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          wompiTransactionId,
        },
      });

      if (updated.count === 0) {
        return;
      }

      const dbTx = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: { type: true, amountInCents: true },
      });

      if (dbTx?.type === 'VIP_SUBSCRIPTION') {
        await tx.user.update({
          where: { id: userId },
          data: {
            isLeyenda: true,
            leyendaExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            coinsBalance: { increment: 100 },
            dailyZumbidosLeft: 3,
            dailyCuyazosLeft: 1,
          },
        });
      } else if (coinsAmount !== null && coinsAmount > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { coinsBalance: { increment: coinsAmount } },
        });

        if (dbTx?.type === 'COIN_RECHARGE') {
          const previousRecharges = await tx.transaction.count({
            where: {
              userId,
              type: 'COIN_RECHARGE',
              status: 'APPROVED',
              id: { not: transactionId },
            },
          });

          if (previousRecharges === 0) {
            const buyer = await tx.user.findUnique({
              where: { id: userId },
              select: { referredById: true },
            });

            if (buyer?.referredById) {
              const commissionInCents = Math.floor(dbTx.amountInCents * 0.1);
              const commissionInCop = Math.floor(commissionInCents / 100);

              await tx.user.update({
                where: { id: buyer.referredById },
                data: {
                  referralEarnings: { increment: commissionInCop },
                  cashBalanceInCents: { increment: commissionInCop },
                },
              });

              await tx.transaction.create({
                data: {
                  reference: `CUY-REF-${Date.now()}-${randomUUID()}`,
                  amountInCents: commissionInCents,
                  type: 'REFERRAL_COMMISSION',
                  status: 'APPROVED',
                  userId: buyer.referredById,
                },
              });

              this.logger.log(
                `Referral commission of ${commissionInCents} cents (${commissionInCop} COP) credited to ${buyer.referredById} from buyer ${userId}`,
              );
            }
          }
        }
      }
    });
  }

  /**
   * Verifica la firma del evento según la documentación de Wompi:
   * SHA-256 de (transacción.id + transacción.status + transacción.amount_in_cents
   * + timestamp + WOMPI_EVENTS_SECRET), comparado con signature.checksum.
   *
   * TODO: si WOMPI_EVENTS_SECRET no está configurada, se omite la verificación
   * estricta (útil en pruebas locales); configurarla antes de producción.
   */
  private isSignatureValid(
    body: WompiEventBody,
    transaction: WompiTransactionPayload,
  ): boolean {
    const secret = process.env.WOMPI_EVENTS_SECRET;

    if (!secret) {
      this.logger.warn('WOMPI_EVENTS_SECRET no está configurada');
      return true;
    }

    const checksum = body.signature?.checksum;
    const timestamp =
      body.timestamp ??
      Number(body.signature?.properties?.[3]?.split('.')?.pop());

    if (!checksum || !timestamp || !transaction.id || !transaction.status) {
      return false;
    }

    const expected = createHash('sha256')
      .update(
        `${transaction.id}${transaction.status}${transaction.amount_in_cents ?? ''}${timestamp}${secret}`,
      )
      .digest('hex');

    return expected === checksum;
  }
}
