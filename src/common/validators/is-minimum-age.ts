import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsMinimumAge(
  minAge: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMinimumAge',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [minAge],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }

          const birthDate = new Date(value);
          if (Number.isNaN(birthDate.getTime())) {
            return false;
          }

          const [minAgeConstraint] = args.constraints as number[];
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age -= 1;
          }

          return age >= minAgeConstraint;
        },
        defaultMessage(args: ValidationArguments) {
          const [minAgeConstraint] = args.constraints as number[];
          return `${args.property} must be at least ${minAgeConstraint} years old`;
        },
      },
    });
  };
}
