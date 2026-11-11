import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ALL_PERMISSIONS, inviteStaffSchema, RESTAURANT_ROLE_CODES } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, CurrentTenant, requestMeta, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { RequirePermission } from '../rbac/require-permission';
import { RestaurantsService } from './restaurants.service';

const createRestaurantSchema = z.object({ name: z.string().trim().min(2).max(120), ownerPhone: z.string().min(8) });
const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REJECTED']),
  reason: z.string().trim().max(500).optional(),
}).refine((d) => d.status === 'ACTIVE' || !!d.reason, { path: ['reason'], message: 'Le motif est obligatoire.' });
const roleCode = z.enum(RESTAURANT_ROLE_CODES as [string, ...string[]]);
const perm = z.enum(ALL_PERMISSIONS as [string, ...string[]]);
const addStaffSchema = z.object({ phone: z.string().min(8), roleCode });
const updateStaffSchema = z.object({
  roleCode: roleCode.optional(),
  granted: z.array(perm).max(50).optional(),
  revoked: z.array(perm).max(50).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

@ApiTags('admin')
@Controller('admin/restaurants')
export class AdminRestaurantsController {
  constructor(private readonly service: RestaurantsService) {}

  @Get()
  @RequirePermission('admin.restaurants.view')
  list(@Query('status') status?: string) {
    const ok = ['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'];
    return this.service.list(status && ok.includes(status) ? status : undefined);
  }

  @Post()
  @RequirePermission('admin.restaurants.review')
  create(@Body(new ZodPipe(createRestaurantSchema)) body: z.output<typeof createRestaurantSchema>, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.createWithOwner(body, a.userId, requestMeta(req));
  }

  @Patch(':id/status')
  @RequirePermission('admin.restaurants.suspend')
  setStatus(@Param('id') id: string, @Body(new ZodPipe(statusSchema)) body: z.output<typeof statusSchema>, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.setStatus(toObjectId(id), body.status, body.reason ?? null, a.userId, requestMeta(req));
  }
}

@ApiTags('restaurant')
@Controller('restaurants/:restaurantId')
export class RestaurantStaffController {
  constructor(private readonly service: RestaurantsService, private readonly audit: AuditService) {}

  @Get('staff')
  @RequirePermission('staff.view')
  list(@CurrentTenant() t: TenantContext) {
    return this.service.listStaff(t.restaurantId);
  }

  @Post('staff')
  @RequirePermission('staff.manage')
  add(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(addStaffSchema)) body: z.output<typeof addStaffSchema>, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.addStaff(t.restaurantId, body, a.userId, requestMeta(req));
  }

  @Post('staff/invite')
  @RequirePermission('staff.manage')
  invite(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(inviteStaffSchema)) body: z.output<typeof inviteStaffSchema>, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.inviteStaff(t.restaurantId, body, a.userId, requestMeta(req));
  }

  @Post('staff/:employeeId/reset-access')
  @RequirePermission('staff.manage')
  resetAccess(@CurrentTenant() t: TenantContext, @Param('employeeId') employeeId: string, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    return this.service.resetStaffAccess(t.restaurantId, toObjectId(employeeId), a.userId, requestMeta(req));
  }

  @Patch('staff/:employeeId')
  @RequirePermission('staff.manage')
  update(
    @CurrentTenant() t: TenantContext,
    @Param('employeeId') employeeId: string,
    @Body(new ZodPipe(updateStaffSchema)) body: z.output<typeof updateStaffSchema>,
    @CurrentAuth() a: AuthContext,
    @Req() req: AppRequest,
  ) {
    return this.service.updateStaff(t.restaurantId, toObjectId(employeeId), body as never, a.userId, requestMeta(req));
  }

  @Get('audit')
  @RequirePermission('staff.audit.view')
  auditLog(@CurrentTenant() t: TenantContext, @Query('limit') limit?: string) {
    return this.audit.list({ restaurantId: t.restaurantId }, Number(limit) || 100);
  }
}
