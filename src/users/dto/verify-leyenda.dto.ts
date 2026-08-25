import { IsString, MinLength } from 'class-validator';

export class VerifyLeyendaDto {
  @IsString({ message: 'La referencia es requerida' })
  @MinLength(1, { message: 'La referencia no puede estar vacía' })
  reference: string;
}
