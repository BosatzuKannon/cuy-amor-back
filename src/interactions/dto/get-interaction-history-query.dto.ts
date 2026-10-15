import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetInteractionHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser al menos 1' })
  @Max(50, { message: 'El límite no puede superar 50' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'El cursor debe ser una cadena de texto' })
  cursor?: string;
}
