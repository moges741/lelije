import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('families/:code')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('activity')
  activity(@Param('code') code: string, @Query('days') days: unknown) {
    return this.reports.activity(code, days);
  }

  @Get('report')
  report(@Param('code') code: string, @Query('days') days: unknown) {
    return this.reports.report(code, days);
  }
}
