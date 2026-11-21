import { Module } from '@nestjs/common';
import { ChildrenModule } from './children/children.module';
import { FamiliesModule } from './families/families.module';
import { HealthController } from './health/health.controller';
import { MissionsModule } from './missions/missions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, FamiliesModule, ChildrenModule, MissionsModule],
  controllers: [HealthController],
})
export class AppModule {}
