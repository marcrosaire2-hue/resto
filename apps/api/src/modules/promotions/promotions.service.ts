import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { PromotionLike, promotionSchema } from '@plateforme/contracts';
import { notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { Product } from '../menu/menu.schemas';
import { Promotion } from './promotion.schema';

interface Meta { ip: string | null; userAgent: string | null }
type Input = z.output<typeof promotionSchema>;

@Injectable()
export class PromotionsService {
  constructor(
    @InjectModel(Promotion.name) private readonly model: Model<Promotion>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly audit: AuditService,
  ) {}

  private dto(p: Promotion & { _id: Types.ObjectId }) {
    return { id: String(p._id), name: p.name, type: p.type, value: p.value, productIds: p.productIds.map(String), startsAt: p.startsAt, endsAt: p.endsAt, minItemsSubtotal: p.minItemsSubtotal, active: p.active };
  }

  async list(restaurantId: string) {
    const docs = await this.model.find({ restaurantId: new Types.ObjectId(restaurantId) }).sort({ endsAt: -1 }).lean();
    return docs.map((d) => this.dto(d as never));
  }

  /** Promotions actives à un instant donné (pour le devis et le catalogue). */
  async activeFor(restaurantId: Types.ObjectId | string, at = new Date()): Promise<(PromotionLike & { name: string })[]> {
    const docs = await this.model.find({ restaurantId: new Types.ObjectId(String(restaurantId)), active: true, startsAt: { $lte: at }, endsAt: { $gt: at } }).lean();
    return docs.map((d) => ({ ...this.dto(d as never), productIds: d.productIds.map(String) }));
  }

  private async checkProducts(restaurantId: string, ids: string[]) {
    if (!ids.length) return;
    const n = await this.products.countDocuments({ restaurantId: new Types.ObjectId(restaurantId), _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, status: { $ne: 'ARCHIVED' } });
    if (n !== new Set(ids).size) throw unprocessable('UNKNOWN_PRODUCT', 'Un plat sélectionné n’appartient pas à votre carte.');
  }

  async save(restaurantId: string, id: Types.ObjectId | null, input: Input, actor: string, meta: Meta) {
    await this.checkProducts(restaurantId, input.productIds);
    const rid = new Types.ObjectId(restaurantId);
    const data = { ...input, productIds: input.productIds.map((p) => new Types.ObjectId(p)) };
    if (id) {
      const before = await this.model.findOne({ restaurantId: rid, _id: id }).lean();
      if (!before) throw notFound();
      await this.model.updateOne({ restaurantId: rid, _id: id }, data);
      await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'promotion.update', entity: 'promotion', entityId: String(id), before: this.dto(before as never), after: input, ...meta });
      return { id: String(id) };
    }
    const p = await this.model.create({ ...data, restaurantId: rid, createdBy: new Types.ObjectId(actor) });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'promotion.create', entity: 'promotion', entityId: String(p._id), after: input, ...meta });
    return { id: String(p._id) };
  }
}
