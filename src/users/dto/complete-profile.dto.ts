import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

import { IsMinimumAge } from '../../common/validators/is-minimum-age';
import { Gender } from '@prisma/client';

const MIN_AGE = 18;
const BIO_MAX_LENGTH = 500;
const DEFAULT_CITY = 'Pasto';

export class CompleteProfileDto {
  @IsOptional()
  @IsISO8601()
  @IsMinimumAge(MIN_AGE, {
    message: 'La fecha de nacimiento indica una edad menor a 18 años',
  })
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender, {
    message: 'El género debe ser uno de: MALE, FEMALE, OTHER',
  })
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(BIO_MAX_LENGTH, {
    message: 'La biografía no puede exceder los 500 caracteres',
  })
  bio?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  longitude?: number;
}

export { DEFAULT_CITY };
