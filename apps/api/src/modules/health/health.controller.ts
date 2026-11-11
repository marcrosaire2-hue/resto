import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection } from 'mongoose';
import { Public } from '../../common/request-context';
import { cloudinaryConfig } from '../media/cloudinary';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    let mongo: 'up' | 'down' = 'down';
    try {
      await this.conn.db?.admin().ping();
      mongo = 'up';
    } catch {
      mongo = 'down';
    }
    const body = { status: mongo === 'up' ? 'ok' : 'degraded', mongo, media: cloudinaryConfig() ? 'configured' : 'not_configured' };
    if (mongo === 'down') throw new ServiceUnavailableException(body);
    return body;
  }
}
