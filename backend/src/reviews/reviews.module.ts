import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MissionsModule } from '../missions/missions.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [FamiliesModule, MissionsModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
