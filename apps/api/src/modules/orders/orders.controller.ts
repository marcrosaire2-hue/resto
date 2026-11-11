import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { addressSchema, cartItemSchema, checkoutSchema, delaySchema, issueSchema, OrderStatus } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AuthContext, CurrentAuth, CurrentTenant, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AddressesService } from '../customers/addresses.service';
import { CartService } from '../customers/cart.service';
import { RequirePermission } from '../rbac/require-permission';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import { RestaurantOpsService } from './restaurant-ops.service';

const addItemSchema = z.object({ item: cartItemSchema, replace: z.boolean().default(false) });
const qtySchema = z.object({ key: z.string().min(1).max(600), qty: z.number().int().min(0).max(99) });
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Motif requis.').max(300) });

@ApiTags('client')
@Controller()
export class CustomerOrdersController {
  constructor(
    private readonly addresses: AddressesService,
    private readonly cart: CartService,
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  // ----- Carnet d'adresses -----
  @Get('me/addresses') listAddresses(@CurrentAuth() a: AuthContext) { return this.addresses.list(a.userId); }
  @Post('me/addresses') createAddress(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(addressSchema)) b: z.output<typeof addressSchema>) { return this.addresses.create(a.userId, b); }
  @Put('me/addresses/:id') updateAddress(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(addressSchema)) b: z.output<typeof addressSchema>) { return this.addresses.update(a.userId, String(toObjectId(id)), b); }
  @Delete('me/addresses/:id') @HttpCode(204) removeAddress(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.addresses.remove(a.userId, String(toObjectId(id))); }

  // ----- Panier serveur + devis -----
  @Get('cart')
  async getCart(@CurrentAuth() a: AuthContext, @Query('addressId') addressId?: string) {
    return (await this.checkout.quote(a.userId, addressId && /^[a-f0-9]{24}$/i.test(addressId) ? addressId : undefined)).quote;
  }
  @Post('cart/items') @HttpCode(204) addItem(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(addItemSchema)) b: z.output<typeof addItemSchema>) { return this.cart.add(a.userId, b.item, b.replace); }
  @Patch('cart/items') @HttpCode(204) setQty(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(qtySchema)) b: z.output<typeof qtySchema>) { return this.cart.setQty(a.userId, b.key, b.qty); }
  @Delete('cart') @HttpCode(204) clearCart(@CurrentAuth() a: AuthContext) { return this.cart.clear(a.userId); }

  // ----- Commandes -----
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('orders')
  create(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(checkoutSchema)) b: z.output<typeof checkoutSchema>) {
    return this.checkout.create(a.userId, b);
  }
  @Get('orders') list(@CurrentAuth() a: AuthContext) { return this.orders.listForCustomer(a.userId); }
  @Get('orders/:id')
  async get(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(await this.orders.forCustomer(a.userId, toObjectId(id)), { audience: 'customer' });
  }
  @Post('orders/:id/cancel')
  async cancel(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) b: z.output<typeof reasonSchema>) {
    const o = await this.orders.forCustomer(a.userId, toObjectId(id));
    return this.orders.transition(o, 'CANCELLED', { kind: 'customer', userId: a.userId }, b.reason);
  }
}

@ApiTags('restaurant')
@Controller('restaurants/:restaurantId')
export class RestaurantKitchenController {
  constructor(private readonly ops: RestaurantOpsService) {}

  @Get('kitchen') @RequirePermission('kitchen.view')
  kitchen(@CurrentTenant() t: TenantContext) { return this.ops.kitchen(t.restaurantId); }

  @Get('dashboard') @RequirePermission('orders.view')
  dashboard(@CurrentTenant() t: TenantContext, @Query('days') days?: string) {
    const d = days === '7' ? 7 : days === '30' ? 30 : 1;
    return this.ops.dashboard(t.restaurantId, d, t.permissions.has('finance.restaurant.view'));
  }

  @Post('orders/:orderId/delay') @RequirePermission('kitchen.update')
  delay(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string, @Body(new ZodPipe(delaySchema)) b: z.output<typeof delaySchema>) {
    return this.ops.reportDelay(t.restaurantId, toObjectId(id), b.minutes, b.reason, a.userId);
  }

  @Post('orders/:orderId/issues') @RequirePermission('orders.report_issue')
  issue(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string, @Body(new ZodPipe(issueSchema)) b: z.output<typeof issueSchema>) {
    return this.ops.reportIssue(t.restaurantId, toObjectId(id), b.type, b.description, a.userId);
  }

  @Get('orders/:orderId/issues') @RequirePermission('orders.view')
  issues(@CurrentTenant() t: TenantContext, @Param('orderId') id: string) { return this.ops.listIssues(t.restaurantId, toObjectId(id)); }
}

@ApiTags('restaurant')
@Controller('restaurants/:restaurantId/orders')
export class RestaurantOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermission('orders.view')
  async list(@CurrentTenant() t: TenantContext, @Query('scope') scope?: string) {
    const list = await this.orders.listForRestaurant(t.restaurantId, scope === 'history' ? 'history' : 'active');
    const showContact = t.permissions.has('orders.view_customer_contact');
    return Promise.all(list.map((o) => this.orders.view(o, { audience: 'restaurant', showContact })));
  }

  @Get(':orderId')
  @RequirePermission('orders.view')
  async get(@CurrentTenant() t: TenantContext, @Param('orderId') id: string) {
    return this.orders.view(await this.orders.forRestaurant(t.restaurantId, toObjectId(id)), { audience: 'restaurant', showContact: t.permissions.has('orders.view_customer_contact') });
  }

  private async move(t: TenantContext, a: AuthContext, id: string, to: OrderStatus, reason: string | null = null) {
    const o = await this.orders.forRestaurant(t.restaurantId, toObjectId(id));
    return this.orders.transition(o, to, { kind: 'restaurant', userId: a.userId }, reason);
  }

  @Post(':orderId/accept') @RequirePermission('orders.accept')
  accept(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string) { return this.move(t, a, id, 'ACCEPTED'); }
  @Post(':orderId/reject') @RequirePermission('orders.reject')
  reject(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string, @Body(new ZodPipe(reasonSchema)) b: z.output<typeof reasonSchema>) { return this.move(t, a, id, 'REJECTED', b.reason); }
  @Post(':orderId/prepare') @RequirePermission('orders.prepare')
  prepare(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string) { return this.move(t, a, id, 'PREPARING'); }
  @Post(':orderId/ready') @RequirePermission('orders.mark_ready')
  ready(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string) { return this.move(t, a, id, 'READY'); }
  @Post(':orderId/request-courier') @RequirePermission('orders.request_courier')
  requestCourier(@CurrentTenant() t: TenantContext, @CurrentAuth() a: AuthContext, @Param('orderId') id: string) { return this.move(t, a, id, 'WAITING_FOR_COURIER'); }
}

@ApiTags('operations')
@Controller('ops/orders')
export class OpsOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id/cancel')
  @RequirePermission('ops.orders.cancel')
  async cancel(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) b: z.output<typeof reasonSchema>) {
    const o = await this.orders.findAny(toObjectId(id));
    return this.orders.transition(o, 'CANCELLED', { kind: 'ops', userId: a.userId }, b.reason);
  }
}
