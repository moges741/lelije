import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('story')
  @HttpCode(200)
  story(@Body() body: unknown) {
    return this.ai.story(body);
  }

  @Post('story/complete')
  @HttpCode(200)
  completeStory(@Body() body: unknown) {
    return this.ai.completeStory(body);
  }

  @Post('summary')
  @HttpCode(200)
  summary(@Body() body: unknown) {
    return this.ai.weeklySummary(body);
  }
}
