import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';

@Module({
  imports: [FamiliesModule, NotificationsModule],
  controllers: [PlayController],
  providers: [PlayService],
})
export class PlayModule {}
