import {
  ArrayMaxSize,
  IsArray,
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
import { Gender, InterestedIn, RelationshipGoal } from '@prisma/client';

const MIN_AGE = 18;
const BIO_MAX_LENGTH = 500;
const DEFAULT_CITY = 'Pasto';
const HOBBIES_MAX_COUNT = 12;
const HOBBY_MAX_LENGTH = 32;

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
  @IsEnum(InterestedIn, {
    message: 'El interés debe ser uno de: WOMEN, MEN, BOTH',
  })
  interestedIn?: InterestedIn;

  @IsOptional()
  @IsEnum(RelationshipGoal, {
    message:
      'La meta debe ser una de: CASUAL, FRIENDSHIP, RELATIONSHIP, CHAT, LET_IT_FLOW, LIGHT_CASUAL',
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
}

export { DEFAULT_CITY };
