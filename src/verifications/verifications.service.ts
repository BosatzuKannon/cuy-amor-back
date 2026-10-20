import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { SupabaseStorageService } from '../common/supabase-storage.service';
import { PrismaService } from '../prisma/prisma.service';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isVerified: true,
} as const;

@Injectable()
export class VerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async submitSelfie(userId: string, selfieUrl: string) {
    const existingPending = await this.prisma.verificationRequest.findFirst({
      where: { userId, status: VerificationStatus.PENDING },
      select: { id: true },
    });

    if (existingPending) {
      return this.prisma.verificationRequest.update({
        where: { id: existingPending.id },
        data: { selfieUrl },
        include: { user: { select: userSelect } },
      });
    }

    return this.prisma.verificationRequest.create({
      data: { userId, selfieUrl },
      include: { user: { select: userSelect } },
    });
  }

  async getMyStatus(userId: string) {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: userSelect } },
    });
    return { request: request ?? null };
  }

  async listRequests(status?: VerificationStatus) {
    return this.prisma.verificationRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: userSelect } },
    });
  }

  async approveRequest(requestId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Solicitud de verificación no encontrada');
    }
    if (request.status !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `La solicitud ya está en estado ${request.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.verificationRequest.update({
        where: { id: requestId },
        data: { status: VerificationStatus.APPROVED },
        include: { user: { select: userSelect } },
      });

      await tx.user.update({
        where: { id: request.userId },
        data: { isVerified: true },
      });

      await tx.verificationRequest.updateMany({
        where: {
          userId: request.userId,
          status: VerificationStatus.PENDING,
          id: { not: requestId },
        },
        data: { status: VerificationStatus.REJECTED },
      });

      return result;
    });

    // Liberar espacio: la foto ya no es necesaria tras el análisis.
    await this.storage.deleteObject(request.selfieUrl);

    return updated;
  }

  async rejectRequest(requestId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Solicitud de verificación no encontrada');
    }
    if (request.status !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `La solicitud ya está en estado ${request.status}`,
      );
    }

    const updated = await this.prisma.verificationRequest.update({
      where: { id: requestId },
      data: { status: VerificationStatus.REJECTED },
      include: { user: { select: userSelect } },
    });

    // Liberar espacio inmediatamente al rechazar.
    await this.storage.deleteObject(request.selfieUrl);

    return updated;
  }
}
