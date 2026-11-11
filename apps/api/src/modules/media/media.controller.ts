import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { MEDIA_PURPOSES, MediaService } from './media.service';

const signatureSchema = z.object({ purpose: z.enum(MEDIA_PURPOSES), restaurantId: z.string().optional() });

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Renvoie les paramètres signés pour un téléversement direct vers Cloudinary. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('signature')
  sign(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(signatureSchema)) body: z.output<typeof signatureSchema>) {
    return this.media.createSignature(a.userId, body.purpose, body.restaurantId);
  }
}
