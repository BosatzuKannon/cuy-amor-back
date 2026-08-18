import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MIN_AGE = 18;
const MAX_AGE = 99;

@ValidatorConstraint({ name: 'isValidAgeRange', async: false })
class AgeRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as UpdatePreferencesDto;
    if (
      object.minAgePreference === undefined ||
      object.maxAgePreference === undefined
    ) {
      return true;
    }
    return object.maxAgePreference >= object.minAgePreference;
  }

  defaultMessage(): string {
    return 'La edad máxima debe ser mayor o igual a la edad mínima';
  }
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsInt({ message: 'La edad mínima debe ser un número entero' })
  @Min(MIN_AGE, { message: `La edad mínima no puede ser menor a ${MIN_AGE}` })
  @Max(MAX_AGE, { message: `La edad mínima no puede ser mayor a ${MAX_AGE}` })
  minAgePreference?: number;

  @IsOptional()
  @IsInt({ message: 'La edad máxima debe ser un número entero' })
  @Min(MIN_AGE, { message: `La edad máxima no puede ser menor a ${MIN_AGE}` })
  @Max(MAX_AGE, { message: `La edad máxima no puede ser mayor a ${MAX_AGE}` })
  @ValidateIf(
    (object: UpdatePreferencesDto) => object.minAgePreference !== undefined,
  )
  @Validate(AgeRangeConstraint, {
    message: 'La edad máxima debe ser mayor o igual a la edad mínima',
  })
  maxAgePreference?: number;

  @IsOptional()
  @IsInt({ message: 'La distancia máxima debe ser un número entero' })
  @Min(1, { message: 'La distancia máxima debe ser un número positivo' })
  maxDistanceKm?: number;

  @IsOptional()
  @IsBoolean({ message: 'Mostrar ubicación debe ser un booleano' })
  showLocation?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Modo invisible debe ser un booleano' })
  invisibleMode?: boolean;
}
