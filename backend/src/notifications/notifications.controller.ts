import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('families/:code/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Param('code') code: string,
    @Query('audience') audience: unknown,
    @Query('childId') childId: unknown,
  ) {
    return this.notifications.list(code, audience, childId);
  }

  @Post('read')
  @HttpCode(200)
  markRead(@Param('code') code: string, @Body() body: unknown) {
    return this.notifications.markRead(code, body);
  }
}
