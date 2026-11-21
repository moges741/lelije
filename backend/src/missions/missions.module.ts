import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CompletionsService } from './completions.service';
import { GenerationLimiter } from './generation-limiter';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MissionsController],
  providers: [MissionsService, CompletionsService, GenerationLimiter],
  exports: [MissionsService],
})
export class MissionsModule {}
