import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CompletionsService } from './completions.service';
import { MissionsService } from './missions.service';

@Controller('missions')
export class MissionsController {
  constructor(
    private readonly missions: MissionsService,
    private readonly completions: CompletionsService,
  ) {}

  @Post()
  @HttpCode(200)
  getToday(@Body() body: unknown) {
    return this.missions.getToday(body);
  }

  @Post('complete')
  @HttpCode(200)
  complete(@Body() body: unknown) {
    return this.completions.complete(body);
  }
}
