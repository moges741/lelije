import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { FamiliesService } from './families.service';

@Controller('families')
export class FamiliesController {
  constructor(
    private readonly families: FamiliesService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const family = await this.families.create(body);
    const token = this.auth.issueParentToken({ id: family.id, code: family.code });
    return { ...family, token };
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
