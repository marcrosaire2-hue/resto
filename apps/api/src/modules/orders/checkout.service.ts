import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Connection, Model, Types } from 'mongoose';
import { z } from 'zod';
import { bestPromotion, checkoutSchema, computeSplit, computeUnitPrice, isOpenAt, Quote, QuoteLine } from '@plateforme/contracts';
import { unprocessable } from '../../common/errors';
import { CommercialModuleRef } from './refs';
import { AddressesService } from '../customers/addresses.service';
import { CartService } from '../customers/cart.service';
import { DeliveryFeeRule, DeliveryZone } from '../geo/geo.schemas';
import { GeoService } from '../geo/geo.service';
import { imageUrl } from '../media/cloudinary';
import { MenuCategory, Product } from '../menu/menu.schemas';
import { PromotionsService } from '../promotions/promotions.service';
import { Restaurant } from '../restaurants/restaurant.schema';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.schema';
import { Order, OrderStatusHistory } from './order.schema';
import { OrderEventsService } from './order-events.service';

type CheckoutInput = z.output<typeof checkoutSchema>;
const NUMBER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

interface QuoteContext {
  quote: Quote;
  restaurant: (Restaurant & { _id: Types.ObjectId }) | null;
  finance?: { commissionRateBps: number; commissionAmount: number; restaurantNet: number; courierPay: number; contractId: string; feeRuleId: string; fromZoneId: string; toZoneId: string };
  address?: Awaited<ReturnType<AddressesService['get']>> & { place: NonNullable<Awaited<ReturnType<GeoService['resolveNeighborhood']>>> };
  responseMinutes?: number;
  lineDetails: { productId: Types.ObjectId; description: string; selection: unknown; promotionId: string | null }[];
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger('Checkout');
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(MenuCategory.name) private readonly categories: Model<MenuCategory>,
    @InjectModel(DeliveryZone.name) private readonly zones: Model<DeliveryZone>,
    @InjectModel(DeliveryFeeRule.name) private readonly feeRules: Model<DeliveryFeeRule>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(OrderStatusHistory.name) private readonly history: Model<OrderStatusHistory>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly cart: CartService,
    private readonly addresses: AddressesService,
    private readonly geo: GeoService,
    private readonly settings: SettingsService,
    private readonly refs: CommercialModuleRef,
    private readonly events: OrderEventsService,
    private readonly promotions: PromotionsService,
  ) {}

  /** Devis calculé côté serveur à partir du panier serveur. C'est aussi la base de la création de commande. */
  async quote(userId: string, addressId?: string): Promise<QuoteContext> {
    const blocking: Quote['blocking'] = [];
    const empty = (): QuoteContext => ({ quote: { restaurant: null, lines: [], itemsSubtotal: 0, restaurantDiscount: 0, deliveryFee: null, serviceFee: null, total: null, blocking }, restaurant: null, lineDetails: [] });
    const cart = await this.cart.raw(userId);
    if (!cart?.restaurantId || cart.items.length === 0) {
      blocking.push({ code: 'EMPTY_CART', message: 'Votre panier est vide.' });
      return empty();
    }
    const r = (await this.restaurants.findById(cart.restaurantId, { draft: 0 }).lean()) as (Restaurant & { _id: Types.ObjectId }) | null;
    if (!r || r.status !== 'ACTIVE' || !r.publishedAt) {
      blocking.push({ code: 'RESTAURANT_UNAVAILABLE', message: 'Ce restaurant n’est plus disponible.' });
      return empty();
    }
    if (!isOpenAt({ openingHours: r.openingHours, closures: r.closures }, new Date())) blocking.push({ code: 'RESTAURANT_CLOSED', message: 'Le restaurant est fermé pour le moment.' });
    if (!r.acceptingOrders) blocking.push({ code: 'NOT_ACCEPTING', message: 'Le restaurant n’accepte pas de commandes pour le moment.' });

    const [prods, cats] = await Promise.all([
      this.products.find({ restaurantId: r._id, _id: { $in: cart.items.map((i) => i.productId) } }).lean(),
      this.categories.find({ restaurantId: r._id, active: true }, { _id: 1 }).lean(),
    ]);
    const activeCats = new Set(cats.map((c) => String(c._id)));
    const lines: QuoteLine[] = [];
    const lineDetails: QuoteContext['lineDetails'] = [];
    for (const item of cart.items) {
      const p = prods.find((x) => x._id.equals(item.productId));
      let problem: string | null = null;
      let unitPrice = 0;
      let labels: string[] = [];
      if (!p || p.status !== 'PUBLISHED' || !activeCats.has(String(p.menuCategoryId))) problem = 'Ce plat n’est plus proposé.';
      else if (!p.available) problem = 'Ce plat est temporairement indisponible.';
      else {
        const priced = computeUnitPrice(p, { variants: item.variants, addons: item.addons });
        if (!priced.ok) problem = priced.error;
        else {
          unitPrice = priced.unitPrice;
          labels = [
            ...p.variantGroups.map((g) => g.options.find((o) => o.id === item.variants[g.id])?.name).filter((x): x is string => !!x),
            ...p.addonGroups.flatMap((g) => g.options.filter((o) => item.addons.includes(o.id)).map((o) => `+ ${o.name}`)),
          ];
        }
      }
      lines.push({ key: item.key, productId: String(item.productId), name: p?.name ?? 'Plat retiré', imageUrl: p?.images[0] ? imageUrl(p.images[0], 300) : null, qty: item.qty, unitPrice, lineTotal: unitPrice * item.qty, unitDiscount: 0, promotionName: null, optionLabels: labels, instructions: item.instructions, problem });
      lineDetails.push({ productId: item.productId, description: p?.description ?? '', selection: { variants: item.variants, addons: item.addons }, promotionId: null });
    }
    if (lines.some((l) => l.problem)) blocking.push({ code: 'ITEMS_UNAVAILABLE', message: 'Certains plats ne peuvent pas être commandés. Retirez-les pour continuer.' });
    const itemsSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    // Promotions du restaurant : meilleure réduction par article, calculée ici et nulle part ailleurs.
    const promos = await this.promotions.activeFor(r._id);
    let restaurantDiscount = 0;
    lines.forEach((l, i) => {
      if (l.problem) return;
      const best = bestPromotion(promos, l.productId, l.unitPrice, new Date(), itemsSubtotal);
      if (!best) return;
      l.unitDiscount = best.discount;
      l.promotionName = best.promo.name;
      lineDetails[i].promotionId = best.promo.id;
      restaurantDiscount += best.discount * l.qty;
    });
    const ctx: QuoteContext = { quote: { restaurant: { id: String(r._id), slug: r.slug, name: r.name }, lines, itemsSubtotal, restaurantDiscount, deliveryFee: null, serviceFee: null, total: null, blocking }, restaurant: r, lineDetails };

    const [serviceFee, responseMinutes, contract] = await Promise.all([
      this.settings.get('orders.service_fee_fcfa'),
      this.settings.get('orders.restaurant_response_minutes'),
      this.refs.contracts.current(r._id),
    ]);
    if (serviceFee === null || responseMinutes === null) blocking.push({ code: 'PLATFORM_NOT_CONFIGURED', message: 'La prise de commande n’est pas encore ouverte sur la plateforme.' });
    if (!contract) blocking.push({ code: 'RESTAURANT_NOT_CONFIGURED', message: 'Ce restaurant ne peut pas encore recevoir de commandes en ligne.' });
    ctx.quote.serviceFee = serviceFee;
    ctx.responseMinutes = responseMinutes ?? undefined;

    if (!addressId) {
      blocking.push({ code: 'ADDRESS_REQUIRED', message: 'Choisissez une adresse de livraison.' });
      return ctx;
    }
    const address = await this.addresses.get(userId, addressId);
    const place = await this.geo.resolveNeighborhood(String(address.neighborhoodId));
    if (!place) {
      blocking.push({ code: 'OUT_OF_ZONE', message: 'Ce quartier n’est plus desservi.' });
      return ctx;
    }
    ctx.address = { ...address, place };
    const [customerZone, restaurantZone] = await Promise.all([
      this.zones.findOne({ active: true, neighborhoodIds: address.neighborhoodId }).lean(),
      r.neighborhoodId ? this.zones.findOne({ active: true, neighborhoodIds: r.neighborhoodId }).lean() : null,
    ]);
    if (!customerZone || !r.zoneIds.some((z) => z.equals(customerZone._id))) {
      blocking.push({ code: 'OUT_OF_ZONE', message: `Ce restaurant ne livre pas encore à ${place.name}.` });
      return ctx;
    }
    const rule = restaurantZone ? await this.feeRules.findOne({ fromZoneId: restaurantZone._id, toZoneId: customerZone._id, validTo: null }).lean() : null;
    if (!rule) {
      blocking.push({ code: 'DELIVERY_NOT_CONFIGURED', message: 'La livraison n’est pas encore disponible pour cette adresse.' });
      return ctx;
    }
    ctx.quote.deliveryFee = rule.customerFee;
    if (serviceFee !== null && contract) {
      const split = computeSplit({ itemsSubtotal, restaurantDiscount, platformDiscount: 0, deliveryFee: rule.customerFee, courierPay: rule.courierPay, serviceFee, commissionRateBps: contract.commissionRateBps });
      ctx.quote.total = split.total;
      ctx.finance = {
        commissionRateBps: contract.commissionRateBps, commissionAmount: split.commission, restaurantNet: split.restaurantNet, courierPay: rule.courierPay,
        contractId: String(contract._id), feeRuleId: String(rule._id), fromZoneId: String(restaurantZone!._id), toZoneId: String(customerZone._id),
      };
    }
    return ctx;
  }

  private async uniqueNumber() {
    const d = new Date(Date.now() + 60 * 60_000).toISOString(); // date béninoise
    const day = `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}`;
    for (let i = 0; i < 8; i++) {
      const suffix = Array.from({ length: 5 }, () => NUMBER_ALPHABET[randomInt(NUMBER_ALPHABET.length)]).join('');
      const n = `CT-${day}-${suffix}`;
      if (!(await this.orders.exists({ number: n }).setOptions({ crossTenant: true }))) return n;
    }
    throw new Error('Impossible de générer un numéro de commande');
  }

  private findByKey(userId: string, key: string) {
    return this.orders.findOne({ customerId: new Types.ObjectId(userId), idempotencyKey: key }).setOptions({ crossTenant: true }).lean();
  }

  /** Création de commande (docs/04 §4.1) : idempotente, prix et totaux recalculés côté serveur. */
  async create(userId: string, input: CheckoutInput) {
    const existing = await this.findByKey(userId, input.idempotencyKey);
    if (existing) return { orderId: String(existing._id), number: existing.number, duplicate: true };

    const ctx = await this.quote(userId, input.addressId);
    const block = ctx.quote.blocking[0];
    if (block) throw unprocessable(block.code, block.message);
    if (ctx.quote.total !== input.expectedTotal) {
      throw new HttpException({ statusCode: 409, error: 'PRICE_CHANGED', message: 'Le montant a changé depuis votre consultation. Vérifiez le nouveau total.', quote: ctx.quote }, 409);
    }
    const r = ctx.restaurant!;
    const user = await this.users.findById(userId).lean();
    const number = await this.uniqueNumber();
    const deliveryCode = String(randomInt(0, 10_000)).padStart(4, '0');
    const a = ctx.address!;
    const session = await this.conn.startSession();
    let orderId = '';
    try {
      await session.withTransaction(async () => {
        const [o] = await this.orders.create([{
          number, customerId: new Types.ObjectId(userId), restaurantId: r._id, status: 'PENDING', paymentMethod: input.paymentMethod,
          paymentStatus: 'PENDING', idempotencyKey: input.idempotencyKey,
          customerSnapshot: { name: user!.fullName, phone: user!.phone },
          addressSnapshot: { label: a.label, neighborhoodId: a.place.id, neighborhood: a.place.name, commune: a.place.communeName, city: a.place.cityName, streetLandmark: a.streetLandmark, instructions: a.instructions, lat: a.lat, lng: a.lng },
          restaurantSnapshot: { name: r.name, slug: r.slug, phone: r.phone, address: r.address },
          items: ctx.quote.lines.map((l, i) => ({ productId: ctx.lineDetails[i].productId, name: l.name, description: ctx.lineDetails[i].description, imageUrl: l.imageUrl, unitPrice: l.unitPrice, qty: l.qty, lineTotal: l.lineTotal, unitDiscount: l.unitDiscount, promotionId: ctx.lineDetails[i].promotionId, promotionName: l.promotionName, optionLabels: l.optionLabels, selection: ctx.lineDetails[i].selection, instructions: l.instructions })),
          amounts: { itemsSubtotal: ctx.quote.itemsSubtotal, restaurantDiscount: ctx.quote.restaurantDiscount, platformDiscount: 0, deliveryFee: ctx.quote.deliveryFee!, serviceFee: ctx.quote.serviceFee!, total: ctx.quote.total! },
          finance: ctx.finance!, deliveryCode, customerNote: input.customerNote,
          acceptDeadlineAt: new Date(Date.now() + ctx.responseMinutes! * 60_000),
        }], { session });
        orderId = String(o._id);
        await this.history.create([{ orderId: o._id, fromStatus: null, toStatus: 'PENDING', actorUserId: new Types.ObjectId(userId), actorKind: 'customer' }], { session });
        await this.cart.clear(userId);
      });
    } catch (e) {
      // Double soumission simultanée : la contrainte d'unicité garantit une seule commande.
      if ((e as { code?: number }).code === 11000) {
        const again = await this.findByKey(userId, input.idempotencyKey);
        if (again) return { orderId: String(again._id), number: again.number, duplicate: true };
      }
      throw e;
    } finally {
      await session.endSession();
    }
    await this.events.created(orderId).catch((err) => this.logger.error(`Notification de création échouée : ${(err as Error).message}`));
    return { orderId, number, duplicate: false };
  }
}
