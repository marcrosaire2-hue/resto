import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { Restaurant } from '../restaurants/restaurant.schema';
import { RestaurantContract } from './contract.schema';

interface Meta { ip: string | null; userAgent: string | null }

@Injectable()
export class ContractsService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(RestaurantContract.name) private readonly contracts: Model<RestaurantContract>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    private readonly audit: AuditService,
  ) {}

  current(restaurantId: Types.ObjectId | string) {
    return this.contracts.findOne({ restaurantId: new Types.ObjectId(String(restaurantId)), validTo: null }).lean();
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
        const prev = await this.contracts.findOneAndUpdate({ restaurantId, validTo: null }, { validTo: now }, { session });
        const [c] = await this.contracts.create([{ restaurantId, commissionRateBps: input.commissionRateBps, reference: input.reference ?? null, validFrom: now, createdBy: new Types.ObjectId(actor) }], { session });
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
