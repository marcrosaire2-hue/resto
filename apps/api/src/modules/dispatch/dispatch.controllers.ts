import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { courierApplicationSchema, incidentCreateSchema, incidentUpdateSchema, INCIDENT_TYPES, otpSchema, positionSchema } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { CouriersService } from '../couriers/couriers.service';
import { OrdersService } from '../orders/orders.service';
import { RequirePermission } from '../rbac/require-permission';
import { DeliveriesService } from './deliveries.service';
import { IncidentsService } from './incidents.service';
import { OpsService } from './ops.service';

const oid = z.string().regex(/^[a-f0-9]{24}$/i);
const reason = z.object({ reason: z.string().trim().min(3, 'Motif requis.').max(300) });
const online = z.object({ online: z.boolean() });
const deliverBody = otpSchema.extend({ lat: z.number().optional(), lng: z.number().optional() });
const reportBody = z.object({ type: z.enum(INCIDENT_TYPES), description: z.string().trim().min(3).max(500) });
const assignBody = z.object({ courierId: oid });
const offerBody = z.object({ courierIds: z.array(oid).min(1).max(20) });
const reviewBody = z.object({ decision: z.enum(['approve', 'reject', 'suspend', 'reactivate']), reason: z.string().trim().max(300).optional() })
  .refine((d) => d.decision === 'approve' || d.decision === 'reactivate' || !!d.reason, { path: ['reason'], message: 'Le motif est obligatoire.' });

/** Espace livreur : toutes les routes sont limitées au livreur connecté. */
@ApiTags('livreur')
@Controller('courier')
export class CourierController {
  constructor(private readonly couriers: CouriersService, private readonly deliveries: DeliveriesService) {}

  @Get('me') me(@CurrentAuth() a: AuthContext) { return this.couriers.me(a.userId); }
  @Post('application') apply(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(courierApplicationSchema)) b: z.output<typeof courierApplicationSchema>, @Req() r: AppRequest) { return this.couriers.apply(a.userId, b, requestMeta(r)); }
  @Post('online') setOnline(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(online)) b: z.output<typeof online>) { return this.couriers.setOnline(a.userId, b.online); }
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('position') @HttpCode(204) position(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(positionSchema)) b: z.output<typeof positionSchema>) { return this.couriers.updatePosition(a.userId, b); }
  @Get('offers') offers(@CurrentAuth() a: AuthContext) { return this.deliveries.offersFor(a.userId); }
  @Post('offers/:id/accept') accept(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.deliveries.accept(a.userId, toObjectId(id)); }
  @Post('offers/:id/decline') @HttpCode(204) decline(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.deliveries.decline(a.userId, toObjectId(id)); }
  @Get('active') active(@CurrentAuth() a: AuthContext) { return this.deliveries.active(a.userId); }
  @Post('deliveries/:id/arrived-pickup') arrivedPickup(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.deliveries.arrivedPickup(a.userId, toObjectId(id)); }
  @Post('deliveries/:id/picked-up') pickedUp(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.deliveries.pickedUp(a.userId, toObjectId(id)); }
  @Post('deliveries/:id/arrived-dropoff') arrivedDropoff(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.deliveries.arrivedDropoff(a.userId, toObjectId(id)); }
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('deliveries/:id/deliver') deliver(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(deliverBody)) b: z.output<typeof deliverBody>) {
    return this.deliveries.deliver(a.userId, toObjectId(id), b.code, b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : undefined);
  }
  @Post('deliveries/:id/fail') fail(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reason)) b: z.output<typeof reason>) { return this.deliveries.fail(a.userId, toObjectId(id), b.reason); }
  @Post('deliveries/:id/withdraw') withdraw(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reason)) b: z.output<typeof reason>) { return this.deliveries.withdraw(a.userId, toObjectId(id), b.reason); }
  @Post('deliveries/:id/report') report(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reportBody)) b: z.output<typeof reportBody>) { return this.deliveries.report(a.userId, toObjectId(id), b.type, b.description); }
  @Get('history') history(@CurrentAuth() a: AuthContext) { return this.deliveries.history(a.userId); }
  @Get('earnings') earnings(@CurrentAuth() a: AuthContext) { return this.deliveries.earnings(a.userId); }
}

@ApiTags('operations')
@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService, private readonly deliveries: DeliveriesService, private readonly incidents: IncidentsService, private readonly orders: OrdersService) {}

  @Get('overview') @RequirePermission('ops.orders.view_all') overview() { return this.ops.overview(); }
  @Get('orders') @RequirePermission('ops.orders.view_all')
  list(@Query('scope') scope?: string, @Query('restaurantId') restaurantId?: string, @Query('neighborhood') neighborhood?: string) {
    return this.ops.listOrders({ scope: scope === 'all' ? 'all' : scope === 'active' ? 'active' : 'unassigned', restaurantId, neighborhood: neighborhood?.slice(0, 80) });
  }
  @Get('couriers') @RequirePermission('ops.dispatch.assign') couriers() { return this.ops.listCouriers(); }
  @Post('orders/:id/assign') @RequirePermission('ops.dispatch.assign')
  assign(@Param('id') id: string, @Body(new ZodPipe(assignBody)) b: z.output<typeof assignBody>, @CurrentAuth() a: AuthContext) { return this.deliveries.assign(toObjectId(id), toObjectId(b.courierId), a.userId); }
  @Post('orders/:id/offer') @RequirePermission('ops.dispatch.assign')
  offer(@Param('id') id: string, @Body(new ZodPipe(offerBody)) b: z.output<typeof offerBody>, @CurrentAuth() a: AuthContext) { return this.deliveries.offer(toObjectId(id), b.courierIds.map((c) => toObjectId(c)), a.userId); }
  @Post('orders/:id/unassign') @RequirePermission('ops.dispatch.reassign')
  unassign(@Param('id') id: string, @Body(new ZodPipe(reason)) b: z.output<typeof reason>, @CurrentAuth() a: AuthContext) { return this.deliveries.unassign(toObjectId(id), b.reason, { kind: 'ops', userId: a.userId }); }
  @Post('orders/:id/retry') @RequirePermission('ops.dispatch.reassign')
  async retry(@Param('id') id: string, @CurrentAuth() a: AuthContext) {
    return this.orders.transition(await this.orders.findAny(toObjectId(id)), 'WAITING_FOR_COURIER', { kind: 'ops', userId: a.userId }, null, { courierId: null, courierAlertAt: null });
  }

  @Get('incidents') @RequirePermission('ops.incidents.view') listIncidents(@Query('status') status?: string) { return this.incidents.list(status); }
  @Post('incidents') @RequirePermission('ops.incidents.manage')
  async createIncident(@Body(new ZodPipe(incidentCreateSchema)) b: z.output<typeof incidentCreateSchema>, @CurrentAuth() a: AuthContext) {
    const o = b.orderId ? await this.orders.findAny(toObjectId(b.orderId)) : null;
    return this.incidents.open({ type: b.type, description: b.description, source: 'ops', reportedBy: a.userId, orderId: o?._id ?? null, restaurantId: o?.restaurantId ?? null, courierId: o?.courierId ?? null });
  }
  @Patch('incidents/:id') @RequirePermission('ops.incidents.manage')
  updateIncident(@Param('id') id: string, @Body(new ZodPipe(incidentUpdateSchema)) b: z.output<typeof incidentUpdateSchema>, @CurrentAuth() a: AuthContext) { return this.incidents.update(toObjectId(id), b, a.userId); }
}

@ApiTags('admin')
@Controller('admin/couriers')
export class AdminCouriersController {
  constructor(private readonly couriers: CouriersService) {}
  @Get() @RequirePermission('admin.couriers.review') list(@Query('status') status?: string) { return this.couriers.adminList(['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'].includes(status ?? '') ? status : undefined); }
  @Post(':id/review') @RequirePermission('admin.couriers.review')
  review(@Param('id') id: string, @Body(new ZodPipe(reviewBody)) b: z.output<typeof reviewBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.couriers.review(toObjectId(id), b.decision, b.reason ?? null, a.userId, requestMeta(r)); }
  @Get(':id/documents/:index') @RequirePermission('admin.couriers.review')
  document(@Param('id') id: string, @Param('index') index: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.couriers.documentUrl(toObjectId(id), Number(index) || 0, a.userId, requestMeta(r)); }
}
