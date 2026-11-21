import { Module } from '@nestjs/common';
import { ChildrenModule } from './children/children.module';
import { FamiliesModule } from './families/families.module';
import { GamesModule } from './games/games.module';
import { HealthController } from './health/health.controller';
import { MissionsModule } from './missions/missions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlayModule } from './play/play.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';

@Module({
  imports: [
    PrismaModule,
    PointsModule,
    FamiliesModule,
    ChildrenModule,
    MissionsModule,
    GamesModule,
    ProgressModule,
    ReviewsModule,
    PlayModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
