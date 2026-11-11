import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PLATFORM_ROLE_CODES } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { RequirePermission } from '../rbac/require-permission';
import { PlatformStaffService } from './platform-staff.service';

const roleCode = z.enum(PLATFORM_ROLE_CODES as [string, ...string[]]);
const addSchema = z.object({ phone: z.string().min(8), roleCode });
const updateSchema = z.object({ roleCode: roleCode.optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional() });

@ApiTags('admin')
@Controller('admin')
export class PlatformStaffController {
  constructor(private readonly service: PlatformStaffService, private readonly audit: AuditService) {}

  @Get('staff')
  @RequirePermission('admin.staff.manage')
  list() {
    return this.service.list();
  }

  @Post('staff')
  @RequirePermission('admin.staff.manage')
  add(@Body(new ZodPipe(addSchema)) body: z.output<typeof addSchema>, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.add(body, a.userId, requestMeta(req));
  }

  @Patch('staff/:id')
  @RequirePermission('admin.staff.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(updateSchema)) body: z.output<typeof updateSchema>, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.update(toObjectId(id), body, a.userId, requestMeta(req));
  }

  @Get('audit')
  @RequirePermission('admin.audit.view')
  auditLog(@Query('actorUserId') actorUserId?: string, @Query('action') action?: string, @Query('limit') limit?: string) {
    if (actorUserId) toObjectId(actorUserId);
    return this.audit.list({ actorUserId, action }, Number(limit) || 100);
  }
}
