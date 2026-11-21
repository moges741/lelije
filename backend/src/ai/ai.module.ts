import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [ReportsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
