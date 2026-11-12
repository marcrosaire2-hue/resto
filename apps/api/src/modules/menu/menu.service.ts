import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { productSchema } from '@plateforme/contracts';
import { notFound, unprocessable } from '../../common/errors';
import { searchText } from '../../common/search';
import { AuditService } from '../audit/audit.service';
import { imageUrl } from '../media/cloudinary';
import { assertImageFolder, MediaService } from '../media/media.service';
import { MenuCategory, Product, ProductDocument } from './menu.schemas';
import { GrowthService } from '../growth/growth.service';

interface Meta { ip: string | null; userAgent: string | null }
type ProductInput = z.output<typeof productSchema>;
const newId = () => new Types.ObjectId().toHexString();

@Injectable()
export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name) private readonly categories: Model<MenuCategory>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly growth: GrowthService,
  ) {}

  static toDto(p: Product & { _id: Types.ObjectId }) {
    return {
      id: String(p._id), restaurantId: String(p.restaurantId), menuCategoryId: String(p.menuCategoryId),
      name: p.name, description: p.description, basePrice: p.basePrice, images: p.images,
      imageUrls: p.images.map((i) => imageUrl(i, 900)).filter((u): u is string => !!u),
      status: p.status, available: p.available, allergens: p.allergens, tags: p.tags, prepMinutes: p.prepMinutes,
      variantGroups: p.variantGroups, addonGroups: p.addonGroups, sort: p.sort, publishedAt: p.publishedAt,
    };
  }

  async menu(restaurantId: string, includeArchived: boolean) {
    const rid = new Types.ObjectId(restaurantId);
    const [cats, prods] = await Promise.all([
      this.categories.find({ restaurantId: rid }).sort({ sort: 1, createdAt: 1 }).lean(),
      this.products.find({ restaurantId: rid, ...(includeArchived ? {} : { status: { $ne: 'ARCHIVED' } }) }).sort({ sort: 1, createdAt: 1 }).lean(),
    ]);
    return {
      categories: cats.map((c) => ({ id: String(c._id), name: c.name, active: c.active, sort: c.sort })),
      products: prods.map((p) => MenuService.toDto(p as never)),
    };
  }

  // ---------- Catégories ----------
  async createCategory(restaurantId: string, input: { name: string; active: boolean }, actor: string, meta: Meta) {
    const rid = new Types.ObjectId(restaurantId);
    const last = await this.categories.findOne({ restaurantId: rid }).sort({ sort: -1 }).lean();
    const c = await this.categories.create({ restaurantId: rid, ...input, sort: (last?.sort ?? -1) + 1 });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.category_create', entity: 'menu_category', entityId: String(c._id), after: input, ...meta });
    return { id: String(c._id) };
  }

  async updateCategory(restaurantId: string, id: Types.ObjectId, input: { name: string; active: boolean }, actor: string, meta: Meta) {
    const rid = new Types.ObjectId(restaurantId);
    const before = await this.categories.findOne({ restaurantId: rid, _id: id }).lean();
    if (!before) throw notFound();
    await this.categories.updateOne({ restaurantId: rid, _id: id }, input);
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.category_update', entity: 'menu_category', entityId: String(id), before: { name: before.name, active: before.active }, after: input, ...meta });
    return { id: String(id) };
  }

  async deleteCategory(restaurantId: string, id: Types.ObjectId, actor: string, meta: Meta) {
    const rid = new Types.ObjectId(restaurantId);
    if (!(await this.categories.exists({ restaurantId: rid, _id: id }))) throw notFound();
    if (await this.products.exists({ restaurantId: rid, menuCategoryId: id, status: { $ne: 'ARCHIVED' } })) {
      throw unprocessable('CATEGORY_NOT_EMPTY', 'Déplacez ou archivez d’abord les plats de cette catégorie.');
    }
    await this.categories.deleteOne({ restaurantId: rid, _id: id });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.category_delete', entity: 'menu_category', entityId: String(id), ...meta });
  }

  async reorderCategories(restaurantId: string, ids: string[], actor: string, meta: Meta) {
    const rid = new Types.ObjectId(restaurantId);
    const existing = await this.categories.find({ restaurantId: rid }, { _id: 1 }).lean();
    const known = new Set(existing.map((c) => String(c._id)));
    if (ids.length !== known.size || ids.some((i) => !known.has(i))) throw unprocessable('INVALID_ORDER', 'La liste doit contenir toutes les catégories.');
    await this.categories.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { restaurantId: rid, _id: new Types.ObjectId(id) }, update: { sort: i } } })));
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.category_reorder', entity: 'menu_category', after: ids, ...meta });
  }

  // ---------- Plats ----------
  private async normalize(restaurantId: string, input: ProductInput, actor: string, current?: Product) {
    const rid = new Types.ObjectId(restaurantId);
    if (!(await this.categories.exists({ restaurantId: rid, _id: new Types.ObjectId(input.menuCategoryId) }))) {
      throw unprocessable('UNKNOWN_CATEGORY', 'Catégorie inconnue.');
    }
    const folder = this.media.folderFor('product_image', { userId: actor, restaurantId });
    input.images.forEach((i) => assertImageFolder(i, folder));
    // Conserver les identifiants existants (le panier les référence) ; en créer pour les nouveaux.
    const knownIds = new Set([...(current?.variantGroups ?? []), ...(current?.addonGroups ?? [])].flatMap((g) => [g.id, ...g.options.map((o) => o.id)]));
    const keep = (id?: string) => (id && knownIds.has(id) ? id : newId());
    return {
      menuCategoryId: new Types.ObjectId(input.menuCategoryId), name: input.name, description: input.description,
      basePrice: input.basePrice, images: input.images, allergens: input.allergens, tags: input.tags, prepMinutes: input.prepMinutes ?? null,
      variantGroups: input.variantGroups.map((g) => ({ id: keep(g.id), name: g.name, options: g.options.map((o) => ({ id: keep(o.id), name: o.name, priceDelta: o.priceDelta })) })),
      addonGroups: input.addonGroups.map((g) => ({ id: keep(g.id), name: g.name, min: g.min, max: g.max, options: g.options.map((o) => ({ id: keep(o.id), name: o.name, price: o.price, available: o.available })) })),
      searchText: searchText(input.name, input.description, ...input.tags),
    };
  }

  private async find(restaurantId: string, id: Types.ObjectId): Promise<ProductDocument> {
    const p = await this.products.findOne({ restaurantId: new Types.ObjectId(restaurantId), _id: id });
    if (!p) throw notFound();
    return p;
  }

  async createProduct(restaurantId: string, input: ProductInput, actor: string, meta: Meta) {
    const data = await this.normalize(restaurantId, input, actor);
    const rid = new Types.ObjectId(restaurantId);
    const limit = await this.growth.productLimit(rid);
    if (limit !== null && (await this.products.countDocuments({ restaurantId: rid, status: { $ne: 'ARCHIVED' } })) >= limit) {
      throw unprocessable('PLAN_LIMIT', `Votre formule permet ${limit} plats. Archivez un plat ou changez de formule.`);
    }
    const last = await this.products.findOne({ restaurantId: rid, menuCategoryId: data.menuCategoryId }).sort({ sort: -1 }).lean();
    const p = await this.products.create({ restaurantId: rid, ...data, sort: (last?.sort ?? -1) + 1, status: 'DRAFT' });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.product_create', entity: 'product', entityId: String(p._id), after: { name: data.name, basePrice: data.basePrice }, ...meta });
    return MenuService.toDto(p.toObject() as never);
  }

  async updateProduct(restaurantId: string, id: Types.ObjectId, input: ProductInput, actor: string, meta: Meta) {
    const current = await this.find(restaurantId, id);
    if (current.status === 'ARCHIVED') throw unprocessable('ARCHIVED', 'Ce plat est archivé.');
    const data = await this.normalize(restaurantId, input, actor, current);
    const before = { name: current.name, basePrice: current.basePrice, description: current.description };
    await this.products.updateOne({ restaurantId: current.restaurantId, _id: id }, data);
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.product_update', entity: 'product', entityId: String(id), before, after: { name: data.name, basePrice: data.basePrice, description: data.description }, ...meta });
    return MenuService.toDto((await this.find(restaurantId, id)).toObject() as never);
  }

  async setStatus(restaurantId: string, id: Types.ObjectId, status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED', actor: string, meta: Meta) {
    const p = await this.find(restaurantId, id);
    if (p.status === 'ARCHIVED') throw unprocessable('ARCHIVED', 'Un plat archivé ne peut plus être modifié.');
    const update: Record<string, unknown> = { status };
    if (status === 'PUBLISHED') {
      const cat = await this.categories.findOne({ restaurantId: p.restaurantId, _id: p.menuCategoryId }).lean();
      if (!cat) throw unprocessable('UNKNOWN_CATEGORY', 'Catégorie inconnue.');
      update.publishedAt = p.publishedAt ?? new Date();
    }
    await this.products.updateOne({ restaurantId: p.restaurantId, _id: id }, update);
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: `menu.product_${status.toLowerCase()}`, entity: 'product', entityId: String(id), before: { status: p.status }, after: { status }, ...meta });
    return { id: String(id), status };
  }

  async setAvailability(restaurantId: string, id: Types.ObjectId, available: boolean, actor: string, meta: Meta) {
    const p = await this.find(restaurantId, id);
    await this.products.updateOne({ restaurantId: p.restaurantId, _id: id }, { available });
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'menu.product_availability', entity: 'product', entityId: String(id), before: { available: p.available }, after: { available }, ...meta });
    return { id: String(id), available };
  }
}
