import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { Restaurant } from '../restaurants/restaurant.schema';
import { SettingsService } from '../settings/settings.service';
import { RestaurantContract } from './contract.schema';

interface Meta { ip: string | null; userAgent: string | null }

@Injectable()
export class ContractsService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(RestaurantContract.name) private readonly contracts: Model<RestaurantContract>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Contrat en vigueur maintenant (validFrom ≤ maintenant, et pas encore terminé). */
  current(restaurantId: Types.ObjectId | string, at = new Date()) {
    return this.contracts.findOne({
      restaurantId: new Types.ObjectId(String(restaurantId)), validFrom: { $lte: at }, $or: [{ validTo: null }, { validTo: { $gt: at } }],
    }).sort({ validFrom: -1 }).lean();
  }

  /**
   * À la validation d'un restaurant : mois gratuit (0 %) puis commission standard, selon les réglages de la plateforme.
   * Sans réglage (non configuré) ou si un contrat existe déjà, ne fait rien : le contrat se saisit alors à la main.
   */
  async startDefaultPlan(restaurantId: Types.ObjectId, actor: string) {
    const [bps, freeMonths] = await Promise.all([this.settings.get('commission.standard_bps'), this.settings.get('commission.free_months')]);
    if (bps === null) return null;
    if (await this.contracts.exists({ restaurantId })) return null;
    const months = freeMonths ?? 0;
    const now = new Date();
    const freeEnd = new Date(now);
    freeEnd.setMonth(freeEnd.getMonth() + months);
    const by = new Types.ObjectId(actor);
    await this.contracts.create(months > 0
      ? [
        { restaurantId, kind: 'FREE', commissionRateBps: 0, validFrom: now, validTo: freeEnd, reference: 'Mois gratuit', createdBy: by },
        { restaurantId, kind: 'STANDARD', commissionRateBps: bps, validFrom: freeEnd, validTo: null, reference: 'Commission standard', createdBy: by },
      ]
      : [{ restaurantId, kind: 'STANDARD', commissionRateBps: bps, validFrom: now, validTo: null, reference: 'Commission standard', createdBy: by }]);
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(restaurantId), action: 'commercial.default_plan_started', entity: 'restaurant_contract', entityId: String(restaurantId), after: { freeMonths: months, standardBps: bps, freeUntil: months > 0 ? freeEnd : null }, ip: null, userAgent: null });
    return { freeUntil: months > 0 ? freeEnd : null, standardBps: bps };
  }

  /** Mois gratuits qui se terminent dans 7 jours, ou terminés depuis moins de 3 jours (avec la commission qui suit). */
  async freePeriodNotices(now = new Date()) {
    const day = 86_400_000;
    const [ending, ended] = await Promise.all([
      this.contracts.find({ kind: 'FREE', validTo: { $gt: now, $lte: new Date(now.getTime() + 7 * day) } }).lean(),
      this.contracts.find({ kind: 'FREE', validTo: { $lte: now, $gt: new Date(now.getTime() - 3 * day) } }).lean(),
    ]);
    const withNext = async (c: (typeof ending)[number]) => ({
      id: String(c._id), restaurantId: c.restaurantId, endsAt: c.validTo!,
      nextBps: (await this.contracts.findOne({ restaurantId: c.restaurantId, kind: 'STANDARD', validFrom: c.validTo!, $expr: { $eq: ['$validTo', null] } }).lean())?.commissionRateBps ?? null,
    });
    const keep = (l: Awaited<ReturnType<typeof withNext>>[]) => l.filter((x) => x.nextBps !== null); // contrat remplacé à la main : rien à annoncer
    return { ending: keep(await Promise.all(ending.map(withNext))), ended: keep(await Promise.all(ended.map(withNext))) };
  }

  async history(restaurantId: string) {
    const list = await this.contracts.find({ restaurantId: new Types.ObjectId(restaurantId) }).sort({ validFrom: -1 }).lean();
    return list.map((c) => ({ id: String(c._id), commissionRateBps: c.commissionRateBps, validFrom: c.validFrom, validTo: c.validTo, reference: c.reference }));
  }

  async set(restaurantId: Types.ObjectId, input: { commissionRateBps: number; reference?: string }, actor: string, meta: Meta) {
    if (!(await this.restaurants.exists({ _id: restaurantId }))) throw notFound();
    const session = await this.conn.startSession();
    try {
      let id = '';
      await session.withTransaction(async () => {
        const now = new Date();
        // Clôture le contrat en cours et annule les contrats futurs (mois gratuit / commission standard programmés).
        const prev = await this.contracts.findOne({ restaurantId, validFrom: { $lte: now }, $or: [{ validTo: null }, { validTo: { $gt: now } }] }).session(session).lean();
        await this.contracts.updateMany({ restaurantId, $or: [{ validTo: null }, { validTo: { $gt: now } }] }, [{ $set: { validTo: { $cond: [{ $gt: ['$validFrom', now] }, '$validFrom', now] } } }], { session });
        const [c] = await this.contracts.create([{ restaurantId, kind: 'CUSTOM', commissionRateBps: input.commissionRateBps, reference: input.reference ?? null, validFrom: now, createdBy: new Types.ObjectId(actor) }], { session });
        id = String(c._id);
        await this.audit.record({
          actorUserId: actor, scope: 'platform', restaurantId: String(restaurantId), action: 'commercial.contract_set', entity: 'restaurant_contract', entityId: id,
          before: prev ? { commissionRateBps: prev.commissionRateBps } : null, after: input, ...meta,
        }, session);
      });
      return { id };
    } finally {
      await session.endSession();
    }
  }
}
