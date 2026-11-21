import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProgressService } from './progress.service';

@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('progress')
  forChild(@Query('childId') childId: unknown) {
    return this.progress.forChildId(childId);
  }

  @Get('families/:code/progress')
  forFamily(@Param('code') code: string) {
    return this.progress.forFamily(code);
  }
}
