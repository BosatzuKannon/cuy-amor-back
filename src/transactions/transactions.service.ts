import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

export type WompiCheckoutSession = {
  reference: string;
  amountInCents: number;
  currency: 'COP';
  signature: string;
  publicKey: string | undefined;
  transactionId: string;
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createCheckout(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<WompiCheckoutSession> {
    const coinPackage = await this.prisma.coinPackage.findUnique({
      where: { id: dto.packageId },
    });

    if (!coinPackage || !coinPackage.isActive) {
      throw new BadRequestException('El paquete de monedas no está disponible');
    }

    const reference = `CUY-${Date.now()}-${randomUUID()}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        reference,
        amountInCents: coinPackage.priceInCents,
        coinsAmount: coinPackage.coinsAmount,
        type: 'COIN_RECHARGE',
        status: 'PENDING',
        userId,
      },
    });

    const signature = this.buildIntegritySignature(
      transaction.reference,
      transaction.amountInCents,
    );

    return {
      reference: transaction.reference,
      amountInCents: transaction.amountInCents,
      currency: 'COP',
      signature,
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      transactionId: transaction.id,
    };
  }

  private buildIntegritySignature(
    reference: string,
    amountInCents: number,
  ): string {
    const secret = process.env.WOMPI_INTEGRITY_SECRET ?? '';
    if (!secret) {
      this.logger.warn(
        'WOMPI_INTEGRITY_SECRET no está configurada; la firma se generará vacía',
      );
    }
    return createHash('sha256')
      .update(`${reference}${amountInCents}COP${secret}`)
      .digest('hex');
  }
}
