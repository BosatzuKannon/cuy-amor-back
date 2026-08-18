import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { Gender, InterestedIn, RelationshipGoal } from '@prisma/client';

import { IsMinimumAge } from '../../common/validators/is-minimum-age';

const MIN_AGE = 18;
const BIO_MAX_LENGTH = 500;
const HOBBIES_MAX_COUNT = 12;
const HOBBY_MAX_LENGTH = 32;
const MAX_PHOTOS = 3;

export class PreferencesDto {
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  matchAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  messageAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @IsOptional()
  @IsBoolean()
  invisibleMode?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxDistanceKm?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_AGE)
  @Max(99)
  minAgePreference?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_AGE)
  @Max(99)
  maxAgePreference?: number;
}

export class EditPhotoDto {
  @IsOptional()
  @IsUUID()
  id?: string;

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

export class EditProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

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
  @IsEnum(InterestedIn, {
    message: 'El interés debe ser uno de: WOMEN, MEN, BOTH',
  })
  interestedIn?: InterestedIn;

  @IsOptional()
  @IsEnum(RelationshipGoal, {
    message: 'La meta debe ser una de: CASUAL, FRIENDSHIP, RELATIONSHIP, CHAT',
  })
  relationshipGoal?: RelationshipGoal;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(HOBBIES_MAX_COUNT, {
    message: `Puedes seleccionar máximo ${HOBBIES_MAX_COUNT} hobbies`,
  })
  @IsString({ each: true })
  @MaxLength(HOBBY_MAX_LENGTH, {
    each: true,
    message: `Cada hobby no puede exceder ${HOBBY_MAX_LENGTH} caracteres`,
  })
  hobbies?: string[];

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
  @IsNumber()
  @Min(-180)
  @Max(180)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  longitude?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS, {
    message: `No puedes tener más de ${MAX_PHOTOS} fotos en tu perfil`,
  })
  @ValidateNested({ each: true })
  @Type(() => EditPhotoDto)
  photos?: EditPhotoDto[];
}
