import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { PlayService } from './play.service';

@Controller()
export class PlayController {
  constructor(private readonly play: PlayService) {}

  @Post('play-requests')
  @HttpCode(200)
  ask(@Body() body: unknown) {
    return this.play.ask(body);
  }

  @Get('families/:code/play-requests')
  listForFamily(@Param('code') code: string) {
    return this.play.listForFamily(code);
  }

  @Post('play-requests/:id/answer')
  @HttpCode(200)
  answer(@Param('id') id: string, @Body() body: unknown) {
    return this.play.answer(id, body);
  }
}
