import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

class DeviceTokenDto {
  @IsString()
  @MinLength(20)
  token: string;

  @IsIn(['android', 'ios'])
  platform: string;
}

@Controller('notifications/devices')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  async register(@Req() req: any, @Body() dto: DeviceTokenDto) {
    await this.notifications.register(req.user.sub, dto.token, dto.platform);
    return { success: true };
  }

  @Delete()
  async remove(@Req() req: any, @Body() dto: DeviceTokenDto) {
    await this.notifications.remove(req.user.sub, dto.token);
    return { success: true };
  }
}
