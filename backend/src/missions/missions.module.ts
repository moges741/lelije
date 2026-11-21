import { Module } from '@nestjs/common';
import { GenerationLimiter } from './generation-limiter';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  controllers: [MissionsController],
  providers: [MissionsService, GenerationLimiter],
  exports: [MissionsService],
})
export class MissionsModule {}
