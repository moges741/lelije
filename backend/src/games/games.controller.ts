import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post('result')
  @HttpCode(200)
  recordResult(@Body() body: unknown) {
    return this.games.recordResult(body);
  }
}
