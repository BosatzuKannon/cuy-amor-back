import { IsUrl } from 'class-validator';

export class SubmitVerificationDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  selfieUrl!: string;
}
