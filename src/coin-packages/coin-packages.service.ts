import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoinPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.coinPackage.findMany({
      where: { isActive: true },
      orderBy: { priceInCents: 'asc' },
    });
  }
}
