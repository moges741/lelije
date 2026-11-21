import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('families/:code/reviews')
  listForFamily(@Param('code') code: string) {
    return this.reviews.listForFamily(code);
  }

  @Post('completions/:id/review')
  @HttpCode(200)
  review(@Param('id') id: string, @Body() body: unknown) {
    return this.reviews.review(id, body);
  }
}
