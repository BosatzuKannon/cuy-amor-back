import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreatePayoutDto {
  @IsString()
  @MaxLength(20)
  nequiNumber: string;

  @IsInt({ message: 'El monto debe ser un número entero en centavos' })
  @Min(3000000, {
    message: 'El monto mínimo de retiro es de $30.000 COP (3.000.000 centavos)',
  })
  amountInCents: number;
}
