import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { hoursSchema, restaurantApplicationSchema, restaurantProfileSchema } from '@plateforme/contracts';
import { env } from '../../common/env';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, CurrentTenant, requestMeta, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { RestaurantProfileService } from './profile.service';

const reviewSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() })
  .refine((d) => d.decision === 'approve' || !!d.reason, { path: ['reason'], message: 'Le motif du refus est obligatoire.' });
const zonesSchema = z.object({ zoneIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100) });
const acceptingSchema = z.object({ acceptingOrders: z.boolean() });

@ApiTags('restaurant')
@Controller()
export class RestaurantProfileController {
  constructor(private readonly service: RestaurantProfileService) {}

  @Throttle({ default: { limit: () => env().THROTTLE_AUTH_LIMIT_PER_MIN, ttl: 60_000 } })
  @Post('restaurant-applications')
  apply(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(restaurantApplicationSchema)) b: z.output<typeof restaurantApplicationSchema>, @Req() r: AppRequest) {
    return this.service.apply(a.userId, b, requestMeta(r));
  }

  @Post('admin/restaurants/:id/review')
  @RequirePermission('admin.restaurants.review')
  review(@Param('id') id: string, @Body(new ZodPipe(reviewSchema)) b: z.output<typeof reviewSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.review(toObjectId(id), b.decision, b.reason ?? null, a.userId, requestMeta(r));
  }

  @Get('restaurants/:restaurantId/profile')
  @RequirePermission('restaurant.profile.view')
  get(@CurrentTenant() t: TenantContext) {
    return this.service.get(t.restaurantId);
  }

  @Put('restaurants/:restaurantId/profile/draft')
  @RequirePermission('restaurant.profile.edit')
  draft(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(restaurantProfileSchema)) b: z.output<typeof restaurantProfileSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.saveDraft(t.restaurantId, b, a.userId, requestMeta(r));
  }

  @Post('restaurants/:restaurantId/profile/publish')
  @RequirePermission('restaurant.profile.edit')
  publish(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.publish(t.restaurantId, a.userId, requestMeta(r));
  }

  @Put('restaurants/:restaurantId/hours')
  @RequirePermission('restaurant.hours.edit')
  hours(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(hoursSchema)) b: z.output<typeof hoursSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.setHours(t.restaurantId, b, a.userId, requestMeta(r));
  }

  @Put('restaurants/:restaurantId/zones')
  @RequirePermission('restaurant.zones.edit')
  zones(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(zonesSchema)) b: z.output<typeof zonesSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.setZones(t.restaurantId, b.zoneIds, a.userId, requestMeta(r));
  }

  @Patch('restaurants/:restaurantId/accepting-orders')
  @RequirePermission('restaurant.open_toggle')
  accepting(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(acceptingSchema)) b: z.output<typeof acceptingSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.setAccepting(t.restaurantId, b.acceptingOrders, a.userId, requestMeta(r));
  }
}
