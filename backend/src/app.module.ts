import { Module } from '@nestjs/common';
import { ChildrenModule } from './children/children.module';
import { FamiliesModule } from './families/families.module';
import { GamesModule } from './games/games.module';
import { HealthController } from './health/health.controller';
import { MissionsModule } from './missions/missions.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';

@Module({
  imports: [
    PrismaModule,
    PointsModule,
    FamiliesModule,
    ChildrenModule,
    MissionsModule,
    GamesModule,
    ProgressModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
