import { Module } from '@nestjs/common';

import { SupabaseStorageService } from '../common/supabase-storage.service';
import { ChatMediaCleanupService } from './chat-media-cleanup.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, ChatMediaCleanupService, SupabaseStorageService],
})
export class MatchesModule {}
