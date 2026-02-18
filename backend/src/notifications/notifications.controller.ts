import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  async list(@Req() req: any) {
    return this.notificationsService.getUserNotifications(req.user.id);
  }

  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    await this.notificationsService.markAllRead(req.user.id);
    return { success: true };
  }

  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.notificationsService.markRead(req.user.id, id);
    return { success: true };
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    await this.notificationsService.delete(req.user.id, id);
    return { success: true };
  }

  @Delete()
  async deleteAll(@Req() req: any) {
    await this.notificationsService.deleteAll(req.user.id);
    return { success: true };
  }
}
