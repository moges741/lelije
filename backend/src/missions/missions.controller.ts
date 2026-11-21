import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { MissionsService } from './missions.service';

@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Post()
  @HttpCode(200)
  getToday(@Body() body: unknown) {
    return this.missions.getToday(body);
  }
}
