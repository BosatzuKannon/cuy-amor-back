import { MessageType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_MEDIA_DURATION_MS = 10_000;

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(2000, {
    message: 'El mensaje no puede superar los 2000 caracteres',
  })
  content: string;

  @IsOptional()
  @IsEnum(MessageType, { message: 'type debe ser TEXT, IMAGE o AUDIO' })
  type?: MessageType;

  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'mediaUrl debe ser una URL https válida' },
  )
  mediaUrl?: string;

  @IsOptional()
  @IsInt({ message: 'mediaDurationMs debe ser un entero' })
  @Min(0)
  @Max(MAX_MEDIA_DURATION_MS, {
    message: 'La nota de voz no puede superar los 10 segundos',
  })
  mediaDurationMs?: number;

  @IsOptional()
  @IsUUID('4', { message: 'replyToId debe ser un UUID válido' })
  replyToId?: string;
}
