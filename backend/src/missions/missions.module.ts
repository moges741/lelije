import { Module } from '@nestjs/common';
import { CompletionsService } from './completions.service';
import { GenerationLimiter } from './generation-limiter';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  controllers: [MissionsController],
  providers: [MissionsService, CompletionsService, GenerationLimiter],
  exports: [MissionsService],
})
export class MissionsModule {}
