import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const PROFILE_PROMPTS_MAX_COUNT = 3;
export const PROMPT_ANSWER_MAX_LENGTH = 150;

export class ProfilePromptDto {
  @IsString({ message: 'El identificador del prompt debe ser texto' })
  @IsNotEmpty({ message: 'El identificador del prompt es obligatorio' })
  @MaxLength(40, {
    message: 'El identificador del prompt no puede exceder 40 caracteres',
  })
  id: string;

  @IsString({ message: 'La respuesta debe ser texto' })
  @IsNotEmpty({ message: 'La respuesta no puede estar vacía' })
  @MaxLength(PROMPT_ANSWER_MAX_LENGTH, {
    message: `Cada respuesta no puede exceder ${PROMPT_ANSWER_MAX_LENGTH} caracteres`,
  })
  answer: string;
}

export class ProfilePromptsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_PROMPTS_MAX_COUNT, {
    message: `Puedes responder máximo ${PROFILE_PROMPTS_MAX_COUNT} prompts`,
  })
  @ValidateNested({ each: true })
  @Type(() => ProfilePromptDto)
  profilePrompts?: ProfilePromptDto[];
}
