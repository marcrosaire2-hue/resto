import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { adCampaignSchema, couponSchema, HOME_SECTION_LABELS, homeSectionSchema, planSchema } from '@plateforme/contracts';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { imageUrl } from '../media/cloudinary';
import { Product } from '../menu/menu.schemas';
import { Restaurant } from '../restaurants/restaurant.schema';
import { AdCampaign, Coupon, CouponRedemption, HomeSection, RestaurantSubscription, SubscriptionPlan } from './growth.schemas';

interface Meta { ip: string | null; userAgent: string | null }
const dup = (e: unknown) => (e as { code?: number }).code === 11000;

/** Commercial : coupons, abonnements, publicités et contenu de l'accueil — administrables sans toucher au code. */
@Injectable()
export class GrowthService {
  constructor(
    @InjectModel(Coupon.name) private readonly coupons: Model<Coupon>,
    @InjectModel(CouponRedemption.name) private readonly redemptions: Model<CouponRedemption>,
    @InjectModel(SubscriptionPlan.name) private readonly plans: Model<SubscriptionPlan>,
    @InjectModel(RestaurantSubscription.name) private readonly subs: Model<RestaurantSubscription>,
    @InjectModel(AdCampaign.name) private readonly ads: Model<AdCampaign>,
    @InjectModel(HomeSection.name) private readonly sections: Model<HomeSection>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly audit: AuditService,
  ) {}

  // ---------- Coupons ----------
  async listCoupons() {
    const list = await this.coupons.find().sort({ createdAt: -1 }).limit(300).lean();
    return list.map((c) => ({ id: String(c._id), code: c.code, description: c.description, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minItemsSubtotal: c.minItemsSubtotal, startsAt: c.startsAt, endsAt: c.endsAt, maxUses: c.maxUses, uses: c.uses, perUserLimit: c.perUserLimit, restaurantIds: c.restaurantIds.map(String), active: c.active }));
  }

  async saveCoupon(id: Types.ObjectId | null, input: z.output<typeof couponSchema>, actor: string, meta: Meta) {
    const data = { ...input, maxDiscount: input.maxDiscount ?? null, maxUses: input.maxUses ?? null, restaurantIds: input.restaurantIds.map((r) => new Types.ObjectId(r)) };
    try {
      if (id) {
        const before = await this.coupons.findById(id).lean();
        if (!before) throw notFound();
        await this.coupons.updateOne({ _id: id }, data);
        await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'commercial.coupon_update', entity: 'coupon', entityId: String(id), before: { code: before.code, value: before.value, active: before.active }, after: input, ...meta });
        return { id: String(id) };
      }
      const c = await this.coupons.create({ ...data, createdBy: new Types.ObjectId(actor) });
      await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'commercial.coupon_create', entity: 'coupon', entityId: String(c._id), after: input, ...meta });
      return { id: String(c._id) };
    } catch (e) {
      if (dup(e)) throw conflict('CODE_TAKEN', 'Ce code existe déjà.');
      throw e;
    }
  }

  // ---------- Abonnements ----------
  async listPlans() {
    return (await this.plans.find().sort({ monthlyPrice: 1 }).lean()).map((p) => ({ id: String(p._id), code: p.code, name: p.name, monthlyPrice: p.monthlyPrice, maxProducts: p.maxProducts, features: p.features, active: p.active }));
  }

  async savePlan(id: Types.ObjectId | null, input: z.output<typeof planSchema>, actor: string, meta: Meta) {
    const data = { ...input, maxProducts: input.maxProducts ?? null };
    try {
      if (id) {
        if (!(await this.plans.exists({ _id: id }))) throw notFound();
        await this.plans.updateOne({ _id: id }, data);
      } else id = (await this.plans.create(data))._id;
    } catch (e) {
      if (dup(e)) throw conflict('CODE_TAKEN', 'Ce code de formule existe déjà.');
      throw e;
    }
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'commercial.plan_save', entity: 'subscription_plan', entityId: String(id), after: input, ...meta });
    return { id: String(id) };
  }

  /** Change la formule d'un restaurant : l'abonnement en cours est clos, un nouveau commence (historique conservé). */
  async subscribe(restaurantId: Types.ObjectId, planId: Types.ObjectId, actor: string, meta: Meta) {
    const plan = await this.plans.findOne({ _id: planId, active: true }).lean();
    if (!plan) throw notFound('Formule introuvable ou inactive.');
    if (!(await this.restaurants.exists({ _id: restaurantId }))) throw notFound('Restaurant introuvable.');
    const now = new Date();
    await this.subs.updateMany({ restaurantId, status: 'ACTIVE' }, { status: 'ENDED', endsAt: now });
    const s = await this.subs.create({ restaurantId, planId, startsAt: now, monthlyPrice: plan.monthlyPrice, createdBy: new Types.ObjectId(actor) });
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(restaurantId), action: 'commercial.subscription_change', entity: 'restaurant_subscription', entityId: String(s._id), after: { plan: plan.code, monthlyPrice: plan.monthlyPrice }, ...meta });
    return { id: String(s._id) };
  }

  async subscriptions() {
    const list = await this.subs.find({ status: 'ACTIVE' }).lean();
    return list.map((s) => ({ id: String(s._id), restaurantId: String(s.restaurantId), planId: String(s.planId), startsAt: s.startsAt, monthlyPrice: s.monthlyPrice }));
  }

  /** Limite de la formule (null = aucune limite). */
  async productLimit(restaurantId: Types.ObjectId) {
    const s = await this.subs.findOne({ restaurantId, status: 'ACTIVE' }).lean();
    if (!s) return null;
    return (await this.plans.findById(s.planId).lean())?.maxProducts ?? null;
  }

  // ---------- Publicités ----------
  async listAds() {
    const list = await this.ads.find().sort({ startsAt: -1 }).limit(300).lean();
    const rs = await this.restaurants.find({ _id: { $in: list.map((a) => a.restaurantId) } }, { name: 1 }).lean();
    const rName = new Map(rs.map((r) => [String(r._id), r.name]));
    return list.map((a) => ({ id: String(a._id), restaurantId: String(a.restaurantId), restaurantName: rName.get(String(a.restaurantId)) ?? '—', placement: a.placement, productId: a.productId ? String(a.productId) : null, title: a.title, imagePublicId: a.imagePublicId, imageUrl: imageUrl(a.imagePublicId, 900), startsAt: a.startsAt, endsAt: a.endsAt, price: a.price, paid: a.paid, active: a.active }));
  }

  async saveAd(id: Types.ObjectId | null, input: z.output<typeof adCampaignSchema>, actor: string, meta: Meta) {
    const rid = new Types.ObjectId(input.restaurantId);
    if (!(await this.restaurants.exists({ _id: rid, status: 'ACTIVE' }))) throw unprocessable('UNKNOWN_RESTAURANT', 'Restaurant introuvable ou inactif.');
    if (input.productId && !(await this.products.exists({ restaurantId: rid, _id: new Types.ObjectId(input.productId), status: 'PUBLISHED' }))) throw unprocessable('UNKNOWN_PRODUCT', 'Le plat doit être publié par ce restaurant.');
    if (input.imagePublicId && !input.imagePublicId.includes('/cuisines/') && !input.imagePublicId.includes(`/restaurants/${input.restaurantId}/`)) throw unprocessable('INVALID_IMAGE', 'Image non autorisée pour cette campagne.');
    const data = { ...input, restaurantId: rid, productId: input.productId ? new Types.ObjectId(input.productId) : null, imagePublicId: input.imagePublicId ?? null };
    if (id) {
      if (!(await this.ads.exists({ _id: id }))) throw notFound();
      await this.ads.updateOne({ _id: id }, data);
    } else id = (await this.ads.create({ ...data, createdBy: new Types.ObjectId(actor) }))._id;
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: input.restaurantId, action: 'commercial.ad_save', entity: 'ad_campaign', entityId: String(id), after: input, ...meta });
    return { id: String(id) };
  }

  /** Campagnes actives maintenant pour un emplacement. */
  activeAds(placement: AdCampaign['placement'], now = new Date()) {
    return this.ads.find({ placement, active: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).lean();
  }

  // ---------- Accueil ----------
  async listSections() {
    return (await this.sections.find().sort({ sort: 1 }).lean()).map((s) => ({ id: String(s._id), type: s.type, typeLabel: HOME_SECTION_LABELS[s.type as keyof typeof HOME_SECTION_LABELS] ?? s.type, title: s.title, sort: s.sort, active: s.active, restaurantIds: s.restaurantIds.map(String) }));
  }

  async saveSection(id: Types.ObjectId | null, input: z.output<typeof homeSectionSchema>, actor: string, meta: Meta) {
    const data = { ...input, restaurantIds: input.restaurantIds.map((r) => new Types.ObjectId(r)) };
    if (id) {
      if (!(await this.sections.exists({ _id: id }))) throw notFound();
      await this.sections.updateOne({ _id: id }, data);
    } else id = (await this.sections.create(data))._id;
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'content.home_section_save', entity: 'home_section', entityId: String(id), after: input, ...meta });
    return { id: String(id) };
  }

  async deleteSection(id: Types.ObjectId, actor: string, meta: Meta) {
    const r = await this.sections.deleteOne({ _id: id });
    if (!r.deletedCount) throw notFound();
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'content.home_section_delete', entity: 'home_section', entityId: String(id), ...meta });
  }

  activeSections() {
    return this.sections.find({ active: true }).sort({ sort: 1 }).lean();
  }
}
