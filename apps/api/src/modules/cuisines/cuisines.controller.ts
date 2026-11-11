import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { CuisinesService } from './cuisines.service';

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  emoji: z.string().trim().max(8).nullable().optional(),
  imagePublicId: z.string().max(300).regex(/^[\w\-/]+$/).nullable().optional(),
  sort: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

@ApiTags('admin')
@Controller('admin/cuisines')
export class AdminCuisinesController {
  constructor(private readonly service: CuisinesService) {}

  @Get()
  @RequirePermission('admin.content.manage')
  list() {
    return this.service.list(false);
  }

  @Post()
  @RequirePermission('admin.content.manage')
  create(@Body(new ZodPipe(schema)) b: z.output<typeof schema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.save(null, b, a.userId, requestMeta(r));
  }

  @Put(':id')
  @RequirePermission('admin.content.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(schema)) b: z.output<typeof schema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.save(toObjectId(id), b, a.userId, requestMeta(r));
  }
}
