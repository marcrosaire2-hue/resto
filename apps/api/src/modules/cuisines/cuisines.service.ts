import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { slugify } from '../../common/slug';
import { AuditService } from '../audit/audit.service';
import { imageUrl } from '../media/cloudinary';
import { CuisineCategory } from './cuisine.schema';

interface Meta { ip: string | null; userAgent: string | null }
export interface CuisineInput { name: string; emoji?: string | null; imagePublicId?: string | null; sort: number; active: boolean }

@Injectable()
export class CuisinesService {
  constructor(@InjectModel(CuisineCategory.name) private readonly model: Model<CuisineCategory>, private readonly audit: AuditService) {}

  async list(activeOnly: boolean) {
    const docs = await this.model.find(activeOnly ? { active: true } : {}).sort({ sort: 1, name: 1 }).lean();
    return docs.map((c) => ({
      id: String(c._id), name: c.name, slug: c.slug, emoji: c.emoji, active: c.active, sort: c.sort,
      imagePublicId: c.imagePublicId, imageUrl: c.imagePublicId ? imageUrl(c.imagePublicId, 160) : null,
    }));
  }

  async assertActiveIds(ids: string[]) {
    const n = await this.model.countDocuments({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, active: true });
    if (n !== new Set(ids).size) throw unprocessable('UNKNOWN_CUISINE', 'Type de cuisine inconnu ou inactif.');
  }

  async save(id: Types.ObjectId | null, input: CuisineInput, actor: string, meta: Meta) {
    if (input.imagePublicId && !input.imagePublicId.includes('/cuisines/')) {
      throw unprocessable('INVALID_IMAGE', "L'image doit être téléversée pour les catégories.");
    }
    try {
      if (id) {
        const before = await this.model.findById(id).lean();
        if (!before) throw notFound();
        await this.model.updateOne({ _id: id }, input);
        await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'cuisine.update', entity: 'cuisine_category', entityId: String(id), before, after: input, ...meta });
        return { id: String(id) };
      }
      const c = await this.model.create({ ...input, slug: slugify(input.name) || `cuisine-${Date.now()}` });
      await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'cuisine.create', entity: 'cuisine_category', entityId: String(c._id), after: input, ...meta });
      return { id: String(c._id) };
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw conflict('ALREADY_EXISTS', 'Cette catégorie existe déjà.');
      throw e;
    }
  }
}
