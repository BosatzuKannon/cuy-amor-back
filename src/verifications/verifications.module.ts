import { Module } from '@nestjs/common';

import { SupabaseStorageService } from '../common/supabase-storage.service';
import { UserVerificationController } from './user-verification.controller';
import { VerificationsAdminController } from './verifications-admin.controller';
import { VerificationsService } from './verifications.service';

@Module({
  controllers: [VerificationsAdminController, UserVerificationController],
  providers: [VerificationsService, SupabaseStorageService],
})
export class VerificationsModule {}
