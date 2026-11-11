import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { z } from 'zod';
import { hoursSchema, restaurantApplicationSchema, restaurantProfileSchema } from '@plateforme/contracts';
import { notFound, unprocessable } from '../../common/errors';
import { searchText } from '../../common/search';
import { slugify } from '../../common/slug';
import { AuditService } from '../audit/audit.service';
import { CuisinesService } from '../cuisines/cuisines.service';
import { GeoService } from '../geo/geo.service';
import { DeliveryZone } from '../geo/geo.schemas';
import { imageUrl } from '../media/cloudinary';
import { assertImageFolder, MediaService } from '../media/media.service';
import { RestaurantEmployee } from '../rbac/restaurant-employee.schema';
import { Restaurant, RestaurantDocument, RestaurantStatus } from './restaurant.schema';

interface Meta { ip: string | null; userAgent: string | null }
type Profile = z.output<typeof restaurantProfileSchema>;
const PROFILE_KEYS = ['name', 'description', 'phone', 'whatsapp', 'email', 'address', 'neighborhoodId', 'cuisineIds', 'avgPrepMinutes', 'logoPublicId', 'coverPublicId'] as const;
const MAX_PENDING_APPLICATIONS = 3;

@Injectable()
export class RestaurantProfileService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(RestaurantEmployee.name) private readonly employees: Model<RestaurantEmployee>,
    @InjectModel(DeliveryZone.name) private readonly zones: Model<DeliveryZone>,
    private readonly geo: GeoService,
    private readonly cuisines: CuisinesService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  private async uniqueSlug(name: string, exceptId?: Types.ObjectId) {
    const base = slugify(name) || 'restaurant';
    let slug = base;
    for (let i = 2; await this.restaurants.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }); i++) slug = `${base}-${i}`;
    return slug;
  }

  private async validateRefs(p: { neighborhoodId: string; cuisineIds: string[] }) {
    const hood = await this.geo.resolveNeighborhood(p.neighborhoodId);
    if (!hood) throw unprocessable('UNKNOWN_NEIGHBORHOOD', 'Quartier inconnu ou non desservi.');
    await this.cuisines.assertActiveIds(p.cuisineIds);
    return hood;
  }

  /** Candidature d'un restaurateur : crée le restaurant (en attente) et l'affectation propriétaire. */
  async apply(userId: string, input: z.output<typeof restaurantApplicationSchema>, meta: Meta) {
    const pending = await this.employees
      .find({ userId: new Types.ObjectId(userId), roleCode: 'owner' })
      .setOptions({ crossTenant: true })
      .lean();
    const pendingCount = await this.restaurants.countDocuments({ _id: { $in: pending.map((p) => p.restaurantId) }, status: 'PENDING_REVIEW' });
    if (pendingCount >= MAX_PENDING_APPLICATIONS) throw unprocessable('TOO_MANY_APPLICATIONS', 'Vous avez déjà des candidatures en cours d’examen.');
    const hood = await this.validateRefs(input);
    const slug = await this.uniqueSlug(input.name);
    const session = await this.conn.startSession();
    try {
      let id = '';
      await session.withTransaction(async () => {
        const [r] = await this.restaurants.create([{
          name: input.name, slug, status: 'PENDING_REVIEW', createdBy: new Types.ObjectId(userId),
          description: input.description ?? '', phone: input.phone, address: input.address,
          neighborhoodId: new Types.ObjectId(input.neighborhoodId), cuisineIds: input.cuisineIds.map((c) => new Types.ObjectId(c)),
          searchText: searchText(input.name, input.description, hood.name, hood.communeName),
        }], { session });
        id = String(r._id);
        await this.employees.create([{ restaurantId: r._id, userId: new Types.ObjectId(userId), roleCode: 'owner', createdBy: new Types.ObjectId(userId) }], { session });
        await this.audit.record({ actorUserId: userId, scope: 'restaurant', restaurantId: id, action: 'restaurant.apply', entity: 'restaurant', entityId: id, after: { name: input.name }, ...meta }, session);
      });
      return { id, slug, status: 'PENDING_REVIEW' as const };
    } finally {
      await session.endSession();
    }
  }

  async review(id: Types.ObjectId, decision: 'approve' | 'reject', reason: string | null, actor: string, meta: Meta) {
    const r = await this.restaurants.findById(id);
    if (!r) throw notFound();
    if (r.status !== 'PENDING_REVIEW') throw unprocessable('NOT_PENDING', 'Cette candidature a déjà été traitée.');
    const status: RestaurantStatus = decision === 'approve' ? 'ACTIVE' : 'REJECTED';
    await this.restaurants.updateOne({ _id: id }, { status, statusReason: reason });
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(id), action: `restaurant.${decision}`, entity: 'restaurant', entityId: String(id), before: { status: r.status }, after: { status, reason }, ...meta });
    return { id: String(id), status };
  }

  private liveProfile(r: RestaurantDocument | Restaurant & { _id: Types.ObjectId }) {
    return {
      name: r.name, description: r.description, phone: r.phone, whatsapp: r.whatsapp, email: r.email, address: r.address,
      neighborhoodId: r.neighborhoodId ? String(r.neighborhoodId) : null, cuisineIds: r.cuisineIds.map(String),
      avgPrepMinutes: r.avgPrepMinutes, logoPublicId: r.logoPublicId, coverPublicId: r.coverPublicId,
    };
  }

  async get(restaurantId: string) {
    const r = await this.restaurants.findById(restaurantId).lean();
    if (!r) throw notFound();
    const live = this.liveProfile(r as never);
    const draft = (r.draft as typeof live | null) ?? null;
    const img = (p: string | null | undefined, w: number) => (p ? imageUrl(p, w) : null);
    return {
      id: String(r._id), slug: r.slug, status: r.status, statusReason: r.statusReason, publishedAt: r.publishedAt,
      acceptingOrders: r.acceptingOrders, openingHours: r.openingHours, closures: r.closures, zoneIds: r.zoneIds.map(String),
      isDemo: r.isDemo, live, draft, hasDraft: !!draft,
      preview: { ...(draft ?? live), logoUrl: img((draft ?? live).logoPublicId, 200), coverUrl: img((draft ?? live).coverPublicId, 900) },
    };
  }

  /** Enregistre le brouillon (aperçu) sans toucher à la vitrine publique. */
  async saveDraft(restaurantId: string, p: Profile, actor: string, meta: Meta) {
    await this.validateRefs(p);
    assertImageFolder(p.logoPublicId, this.media.folderFor('restaurant_logo', { userId: actor, restaurantId }));
    assertImageFolder(p.coverPublicId, this.media.folderFor('restaurant_cover', { userId: actor, restaurantId }));
    const draft = Object.fromEntries(PROFILE_KEYS.map((k) => [k, p[k] ?? null]));
    await this.restaurants.updateOne({ _id: restaurantId }, { draft });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'restaurant.profile_draft', entity: 'restaurant', entityId: restaurantId, after: draft, ...meta });
    return this.get(restaurantId);
  }

  /** Publie le brouillon : il devient la vitrine publique (si le restaurant est validé). */
  async publish(restaurantId: string, actor: string, meta: Meta) {
    const r = await this.restaurants.findById(restaurantId);
    if (!r) throw notFound();
    if (!r.openingHours.length) throw unprocessable('HOURS_REQUIRED', 'Renseignez vos horaires avant de publier.');
    const raw = (r.draft as Record<string, unknown> | null) ?? this.liveProfile(r);
    // null (champ facultatif vide) -> absent, pour la validation
    const source = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
    const p = restaurantProfileSchema.safeParse(source);
    if (!p.success) throw unprocessable('PROFILE_INCOMPLETE', `Profil incomplet : ${p.error.issues[0].path.join('.')} — ${p.error.issues[0].message}`);
    const hood = await this.validateRefs(p.data);
    const before = this.liveProfile(r);
    const slug = p.data.name !== r.name ? await this.uniqueSlug(p.data.name, r._id) : r.slug;
    const cuisineNames = (await this.cuisines.list(true)).filter((c) => p.data.cuisineIds.includes(c.id)).map((c) => c.name);
    await this.restaurants.updateOne({ _id: r._id }, {
      ...p.data,
      neighborhoodId: new Types.ObjectId(p.data.neighborhoodId),
      cuisineIds: p.data.cuisineIds.map((c) => new Types.ObjectId(c)),
      logoPublicId: p.data.logoPublicId ?? null, coverPublicId: p.data.coverPublicId ?? null,
      slug, draft: null, publishedAt: r.publishedAt ?? new Date(),
      searchText: searchText(p.data.name, p.data.description, hood.name, hood.communeName, ...cuisineNames),
    });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'restaurant.profile_publish', entity: 'restaurant', entityId: restaurantId, before, after: p.data, ...meta });
    return this.get(restaurantId);
  }

  async setHours(restaurantId: string, h: z.output<typeof hoursSchema>, actor: string, meta: Meta) {
    const before = await this.restaurants.findById(restaurantId, { openingHours: 1, closures: 1 }).lean();
    await this.restaurants.updateOne({ _id: restaurantId }, { openingHours: h.openingHours, closures: h.closures });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'restaurant.hours_update', entity: 'restaurant', entityId: restaurantId, before, after: h, ...meta });
    return this.get(restaurantId);
  }

  async setZones(restaurantId: string, zoneIds: string[], actor: string, meta: Meta) {
    const ids = [...new Set(zoneIds)].map((z) => new Types.ObjectId(z));
    if ((await this.zones.countDocuments({ _id: { $in: ids }, active: true })) !== ids.length) throw unprocessable('UNKNOWN_ZONE', 'Zone inconnue ou inactive.');
    await this.restaurants.updateOne({ _id: restaurantId }, { zoneIds: ids });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'restaurant.zones_update', entity: 'restaurant', entityId: restaurantId, after: { zoneIds }, ...meta });
    return this.get(restaurantId);
  }

  async setAccepting(restaurantId: string, accepting: boolean, actor: string, meta: Meta) {
    const r = await this.restaurants.findById(restaurantId, { status: 1, publishedAt: 1 }).lean();
    if (accepting && (r?.status !== 'ACTIVE' || !r.publishedAt)) {
      throw unprocessable('NOT_PUBLISHED', 'Le restaurant doit être validé et sa vitrine publiée pour recevoir des commandes.');
    }
    await this.restaurants.updateOne({ _id: restaurantId }, { acceptingOrders: accepting });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'restaurant.accepting_toggle', entity: 'restaurant', entityId: restaurantId, after: { acceptingOrders: accepting }, ...meta });
    return { acceptingOrders: accepting };
  }
}
