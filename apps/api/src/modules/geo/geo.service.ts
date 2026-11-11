import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { City, Commune, DeliveryFeeRule, DeliveryZone, Neighborhood } from './geo.schemas';

interface Meta { ip: string | null; userAgent: string | null }
const dup = (e: unknown) => (e as { code?: number }).code === 11000;

@Injectable()
export class GeoService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(City.name) private readonly cities: Model<City>,
    @InjectModel(Commune.name) private readonly communes: Model<Commune>,
    @InjectModel(Neighborhood.name) private readonly neighborhoods: Model<Neighborhood>,
    @InjectModel(DeliveryZone.name) private readonly zones: Model<DeliveryZone>,
    @InjectModel(DeliveryFeeRule.name) private readonly rules: Model<DeliveryFeeRule>,
    private readonly audit: AuditService,
  ) {}

  /** Arborescence ville → commune → quartier. `activeOnly` pour l'usage public. */
  async tree(activeOnly: boolean) {
    const f = activeOnly ? { active: true } : {};
    const [cities, communes, hoods] = await Promise.all([
      this.cities.find(f).sort({ name: 1 }).lean(),
      this.communes.find(f).sort({ name: 1 }).lean(),
      this.neighborhoods.find(f).sort({ name: 1 }).lean(),
    ]);
    return cities.map((c) => ({
      id: String(c._id), name: c.name, active: c.active,
      communes: communes.filter((m) => String(m.cityId) === String(c._id)).map((m) => ({
        id: String(m._id), name: m.name, active: m.active,
        neighborhoods: hoods.filter((n) => String(n.communeId) === String(m._id)).map((n) => ({ id: String(n._id), name: n.name, active: n.active })),
      })),
    }));
  }

  async createCity(name: string, actor: string, meta: Meta) {
    try {
      const c = await this.cities.create({ name });
      await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'geo.city_create', entity: 'city', entityId: String(c._id), after: { name }, ...meta });
      return { id: String(c._id) };
    } catch (e) {
      if (dup(e)) throw conflict('ALREADY_EXISTS', 'Cette ville existe déjà.');
      throw e;
    }
  }

  async createCommune(cityId: Types.ObjectId, name: string, actor: string, meta: Meta) {
    if (!(await this.cities.exists({ _id: cityId }))) throw notFound('Ville introuvable.');
    try {
      const c = await this.communes.create({ cityId, name });
      await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'geo.commune_create', entity: 'commune', entityId: String(c._id), after: { name }, ...meta });
      return { id: String(c._id) };
    } catch (e) {
      if (dup(e)) throw conflict('ALREADY_EXISTS', 'Cette commune existe déjà dans la ville.');
      throw e;
    }
  }

  async createNeighborhood(communeId: Types.ObjectId, name: string, actor: string, meta: Meta) {
    const commune = await this.communes.findById(communeId).lean();
    if (!commune) throw notFound('Commune introuvable.');
    try {
      const n = await this.neighborhoods.create({ communeId, cityId: commune.cityId, name });
      await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'geo.neighborhood_create', entity: 'neighborhood', entityId: String(n._id), after: { name }, ...meta });
      return { id: String(n._id) };
    } catch (e) {
      if (dup(e)) throw conflict('ALREADY_EXISTS', 'Ce quartier existe déjà dans la commune.');
      throw e;
    }
  }

  async update(kind: 'city' | 'commune' | 'neighborhood', id: Types.ObjectId, patch: { name?: string; active?: boolean }, actor: string, meta: Meta) {
    const model = (kind === 'city' ? this.cities : kind === 'commune' ? this.communes : this.neighborhoods) as Model<{ name: string; active: boolean }>;
    const before = await model.findById(id).lean();
    if (!before) throw notFound();
    try {
      await model.updateOne({ _id: id }, patch);
    } catch (e) {
      if (dup(e)) throw conflict('ALREADY_EXISTS', 'Ce nom existe déjà.');
      throw e;
    }
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: `geo.${kind}_update`, entity: kind, entityId: String(id), before: { name: before.name, active: before.active }, after: patch, ...meta });
    return { id: String(id) };
  }

  /** Quartier actif avec sa commune et sa ville (validation des adresses). */
  async resolveNeighborhood(id: string) {
    if (!/^[a-f0-9]{24}$/i.test(id)) return null;
    const n = await this.neighborhoods.findOne({ _id: id, active: true }).lean();
    if (!n) return null;
    const [commune, city] = await Promise.all([this.communes.findById(n.communeId).lean(), this.cities.findById(n.cityId).lean()]);
    if (!commune?.active || !city?.active) return null;
    return { id: String(n._id), name: n.name, communeId: String(commune._id), communeName: commune.name, cityId: String(city._id), cityName: city.name };
  }

  async namesFor(neighborhoodIds: Types.ObjectId[]) {
    const hoods = await this.neighborhoods.find({ _id: { $in: neighborhoodIds } }).lean();
    const communes = await this.communes.find({ _id: { $in: hoods.map((h) => h.communeId) } }).lean();
    const cMap = new Map(communes.map((c) => [String(c._id), c.name]));
    return new Map(hoods.map((h) => [String(h._id), { neighborhood: h.name, commune: cMap.get(String(h.communeId)) ?? null }]));
  }

  // ---------- Zones de livraison ----------

  async listZones() {
    const [zones, rules] = await Promise.all([this.zones.find().sort({ name: 1 }).lean(), this.rules.find({ validTo: null }).lean()]);
    return {
      zones: zones.map((z) => ({ id: String(z._id), name: z.name, active: z.active, neighborhoodIds: z.neighborhoodIds.map(String) })),
      feeRules: rules.map((r) => ({
        id: String(r._id), fromZoneId: String(r.fromZoneId), toZoneId: String(r.toZoneId),
        customerFee: r.customerFee, courierPay: r.courierPay, validFrom: r.validFrom,
      })),
    };
  }

  private async assertNeighborhoodsFree(ids: Types.ObjectId[], exceptZoneId?: Types.ObjectId) {
    const found = await this.neighborhoods.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw unprocessable('UNKNOWN_NEIGHBORHOOD', 'Un quartier est introuvable.');
    const taken = await this.zones.findOne({ neighborhoodIds: { $in: ids }, ...(exceptZoneId ? { _id: { $ne: exceptZoneId } } : {}) }).lean();
    if (taken) throw unprocessable('NEIGHBORHOOD_IN_OTHER_ZONE', `Un quartier appartient déjà à la zone « ${taken.name} ».`);
  }

  async saveZone(id: Types.ObjectId | null, input: { name: string; active: boolean; neighborhoodIds: string[] }, actor: string, meta: Meta) {
    const ids = [...new Set(input.neighborhoodIds)].map((x) => new Types.ObjectId(x));
    await this.assertNeighborhoodsFree(ids, id ?? undefined);
    try {
      if (id) {
        const before = await this.zones.findById(id).lean();
        if (!before) throw notFound();
        await this.zones.updateOne({ _id: id }, { name: input.name, active: input.active, neighborhoodIds: ids });
        await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'geo.zone_update', entity: 'delivery_zone', entityId: String(id), before: { name: before.name, active: before.active, neighborhoodIds: before.neighborhoodIds.map(String) }, after: input, ...meta });
        return { id: String(id) };
      }
      const z = await this.zones.create({ name: input.name, active: input.active, neighborhoodIds: ids });
      await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'geo.zone_create', entity: 'delivery_zone', entityId: String(z._id), after: input, ...meta });
      return { id: String(z._id) };
    } catch (e) {
      if (dup(e)) throw conflict('ALREADY_EXISTS', 'Une zone porte déjà ce nom.');
      throw e;
    }
  }

  /** Nouvelle règle de frais : la règle en vigueur pour la même paire est clôturée, jamais modifiée. */
  async setFeeRule(input: { fromZoneId: string; toZoneId: string; customerFee: number; courierPay: number }, actor: string, meta: Meta) {
    const from = new Types.ObjectId(input.fromZoneId);
    const to = new Types.ObjectId(input.toZoneId);
    if ((await this.zones.countDocuments({ _id: { $in: [from, to] } })) !== (from.equals(to) ? 1 : 2)) {
      throw unprocessable('UNKNOWN_ZONE', 'Zone introuvable.');
    }
    const session = await this.conn.startSession();
    try {
      let id = '';
      await session.withTransaction(async () => {
        const now = new Date();
        const prev = await this.rules.findOneAndUpdate({ fromZoneId: from, toZoneId: to, validTo: null }, { validTo: now }, { session });
        const [rule] = await this.rules.create([{ fromZoneId: from, toZoneId: to, customerFee: input.customerFee, courierPay: input.courierPay, validFrom: now, createdBy: new Types.ObjectId(actor) }], { session });
        id = String(rule._id);
        await this.audit.record({
          actorUserId: actor, scope: 'platform', action: 'geo.fee_rule_set', entity: 'delivery_fee_rule', entityId: id,
          before: prev ? { customerFee: prev.customerFee, courierPay: prev.courierPay } : null, after: input, ...meta,
        }, session);
      });
      return { id };
    } finally {
      await session.endSession();
    }
  }
}
