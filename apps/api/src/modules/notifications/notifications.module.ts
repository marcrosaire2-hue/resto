import { Body, Controller, Get, Global, HttpCode, Module, Post } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { Notification, NotificationSchema } from './notification.schema';
import { NotificationsService } from './notifications.service';

const readSchema = z.object({ ids: z.union([z.literal('all'), z.array(z.string()).max(100)]) });

@ApiTags('notifications')
@Controller('notifications')
class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  list(@CurrentAuth() a: AuthContext) {
    return this.service.list(a.userId);
  }
  @Post('read')
  @HttpCode(204)
  read(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(readSchema)) b: z.output<typeof readSchema>) {
    return this.service.markRead(a.userId, b.ids);
  }
}

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
