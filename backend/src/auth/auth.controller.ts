import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('parent-login')
  @HttpCode(200)
  parentLogin(@Body() body: unknown) {
    return this.auth.parentLogin(body);
  }

  @Post('child-login')
  @HttpCode(200)
  childLogin(@Body() body: unknown) {
    return this.auth.childLogin(body);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.auth.getMe(authorization);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Headers('authorization') authorization?: string) {
    return this.auth.logout(authorization);
  }
}
