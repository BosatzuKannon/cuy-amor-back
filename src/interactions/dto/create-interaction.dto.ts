import { IsEnum, IsUUID } from 'class-validator';
import { InteractionType } from '@prisma/client';

export class CreateInteractionDto {
  @IsUUID('4', { message: 'El ID del usuario debe ser un UUID válido' })
  toUserId: string;

  @IsEnum(InteractionType, {
    message: 'El tipo debe ser uno de: LIKE, PASS, SUPER_LIKE',
  })
  type: InteractionType;
}
