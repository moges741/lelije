import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
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

  @Post(':code/pin/check')
  @HttpCode(200)
  checkPin(@Param('code') code: string, @Body() body: unknown) {
    return this.families.checkPin(code, body);
  }

  @Post(':code/pin')
  @HttpCode(200)
  setPin(@Param('code') code: string, @Body() body: unknown) {
    return this.families.setPin(code, body);
  }
}
