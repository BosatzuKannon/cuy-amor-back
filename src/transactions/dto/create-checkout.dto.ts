import { IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  @IsUUID('4', { message: 'El ID del paquete debe ser un UUID válido' })
  packageId: string;
}
