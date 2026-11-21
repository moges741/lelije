import { Body, Controller, Post } from '@nestjs/common';
import { ChildrenService } from './children.service';

@Controller('children')
export class ChildrenController {
  constructor(private readonly children: ChildrenService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.children.create(body);
  }
}
