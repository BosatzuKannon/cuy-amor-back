import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUrl,
  ValidateNested,
  Min,
} from 'class-validator';

export class PhotoDto {
  @IsUrl(
    { require_protocol: true },
    { message: 'La URL de la foto no es válida' },
  )
  url: string;

  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(0)
  order: number;

  @IsOptional()
  @IsBoolean()
  isProfile?: boolean;
}

export class AddPhotosDto {
  @IsArray({ message: 'photos debe ser un arreglo de fotos' })
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos: PhotoDto[];
}
