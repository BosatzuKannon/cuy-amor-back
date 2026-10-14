import { IsIn, IsUUID } from 'class-validator';
import { InteractionType } from '@prisma/client';

const CHANGEABLE_INTERACTION_TYPES = [
  InteractionType.LIKE,
  InteractionType.SUPER_LIKE,
] as const;

export class ChangeInteractionDto {
  @IsUUID('4', { message: 'El ID del usuario debe ser un UUID válido' })
  targetUserId: string;

  @IsIn(CHANGEABLE_INTERACTION_TYPES, {
    message: 'La nueva acción debe ser LIKE o SUPER_LIKE (Cuyazo)',
  })
  newActionType: InteractionType;
}
