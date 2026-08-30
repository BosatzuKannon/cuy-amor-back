import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const MAX_REASON_LENGTH = 200;
const MAX_DETAILS_LENGTH = 1000;

export class BlockUserDto {
  @IsOptional()
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(MAX_REASON_LENGTH, {
    message: `El motivo no puede superar los ${MAX_REASON_LENGTH} caracteres`,
  })
  reason?: string;
}

export class ReportUserDto {
  @IsNotEmpty({ message: 'El motivo del reporte es obligatorio' })
  @IsString({ message: 'El motivo del reporte debe ser un texto' })
  @MaxLength(MAX_REASON_LENGTH, {
    message: `El motivo del reporte no puede superar los ${MAX_REASON_LENGTH} caracteres`,
  })
  reason: string;

  @IsOptional()
  @IsString({ message: 'Los detalles deben ser un texto' })
  @MaxLength(MAX_DETAILS_LENGTH, {
    message: `Los detalles no pueden superar los ${MAX_DETAILS_LENGTH} caracteres`,
  })
  details?: string;
}
