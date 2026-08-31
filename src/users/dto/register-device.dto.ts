import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const PUSH_TOKEN_MAX_LENGTH = 512;

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty({ message: 'El push token es requerido' })
  @MaxLength(PUSH_TOKEN_MAX_LENGTH, {
    message: 'El push token no puede exceder 512 caracteres',
  })
  pushToken: string;

  @IsString()
  @IsNotEmpty({ message: 'La plataforma es requerida' })
  platform: string;
}