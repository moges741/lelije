import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [FamiliesModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
