import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const GIFT_SELECT = {
  id: true,
  name: true,
  iconUrl: true,
  coinCost: true,
  cashValueCops: true,
} as const;

@Injectable()
export class GiftsService {
  constructor(private readonly prisma: PrismaService) {}

  listGifts() {
    return this.prisma.virtualGift.findMany({
      where: { isActive: true },
      orderBy: { coinCost: 'asc' },
      select: GIFT_SELECT,
    });
  }
}
