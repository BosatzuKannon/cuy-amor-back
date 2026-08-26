import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum CurrencyType {
  REAL_MONEY = 'REAL_MONEY',
  CUY_COINS = 'CUY_COINS',
}

export class WalletHistoryQueryDto {
  @IsEnum(CurrencyType, {
    message: 'currencyType debe ser REAL_MONEY o CUY_COINS',
  })
  currencyType: CurrencyType;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
