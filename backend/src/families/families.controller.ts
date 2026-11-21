import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FamiliesService } from './families.service';

@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.families.create(body);
  }

  @Get(':code')
  findByCode(@Param('code') code: string) {
    return this.families.findByCode(code);
  }
}
