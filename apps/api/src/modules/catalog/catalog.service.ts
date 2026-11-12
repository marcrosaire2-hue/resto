import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { bestPromotion, isOpenAt, PromotionLike, PublicProduct, PublicRestaurantCard, PublicRestaurantDetail } from '@plateforme/contracts';
import { notFound } from '../../common/errors';
import { containsRegex } from '../../common/search';
import { CuisinesService } from '../cuisines/cuisines.service';
import { GeoService } from '../geo/geo.service';
import { imageUrl } from '../media/cloudinary';
import { MenuCategory, Product } from '../menu/menu.schemas';
import { PromotionsService } from '../promotions/promotions.service';
import { GrowthService } from '../growth/growth.service';
import { Restaurant } from '../restaurants/restaurant.schema';

export type CatalogSort = 'popular' | 'rating' | 'new' | 'prep';
type R = Restaurant & { _id: Types.ObjectId };
type P = Product & { _id: Types.ObjectId };

/** Seuls les restaurants validés ET dont la vitrine est publiée sont visibles du public. */
const VISIBLE = { status: 'ACTIVE', publishedAt: { $ne: null } } as const;

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(MenuCategory.name) private readonly categories: Model<MenuCategory>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly cuisines: CuisinesService,
    private readonly geo: GeoService,
    private readonly promotions: PromotionsService,
    private readonly growth: GrowthService,
  ) {}

  private async cards(list: R[], now = new Date()): Promise<PublicRestaurantCard[]> {
    const [cuisines, names] = await Promise.all([
      this.cuisines.list(true),
      this.geo.namesFor(list.map((r) => r.neighborhoodId).filter((x): x is Types.ObjectId => !!x)),
    ]);
    const cMap = new Map(cuisines.map((c) => [c.id, c.name]));
    return list.map((r) => {
      const place = r.neighborhoodId ? names.get(String(r.neighborhoodId)) : undefined;
      return {
        id: String(r._id), slug: r.slug, name: r.name, description: r.description,
        logoUrl: imageUrl(r.logoPublicId, 200), coverUrl: imageUrl(r.coverPublicId, 700),
        cuisines: r.cuisineIds.map((id) => ({ id: String(id), name: cMap.get(String(id)) ?? '' })).filter((c) => c.name),
        rating: r.ratingAvg, ratingCount: r.ratingCount, avgPrepMinutes: r.avgPrepMinutes,
        isOpen: isOpenAt({ openingHours: r.openingHours, closures: r.closures }, now),
        acceptingOrders: r.acceptingOrders,
        neighborhood: place?.neighborhood ?? null, commune: place?.commune ?? null, isDemo: r.isDemo,
      };
    });
  }

  private productDto(p: P, promos: (PromotionLike & { name: string })[] = []): PublicProduct {
    const best = bestPromotion(promos, String(p._id), p.basePrice, new Date());
    return {
      id: String(p._id), restaurantId: String(p.restaurantId), menuCategoryId: String(p.menuCategoryId),
      name: p.name, description: p.description, basePrice: p.basePrice,
      imageUrls: p.images.map((i) => imageUrl(i, 900)).filter((u): u is string => !!u),
      available: p.available, allergens: p.allergens, tags: p.tags, prepMinutes: p.prepMinutes,
      variantGroups: p.variantGroups, addonGroups: p.addonGroups,
      promotion: best ? { name: best.promo.name, discountedBasePrice: p.basePrice - best.discount, minItemsSubtotal: best.promo.minItemsSubtotal, endsAt: new Date(best.promo.endsAt).toISOString() } : null,
    };
  }

  async listRestaurants(f: { q?: string; cuisine?: string; openNow?: boolean; sort: CatalogSort; limit: number }) {
    const filter: Record<string, unknown> = { ...VISIBLE };
    if (f.q) filter.searchText = containsRegex(f.q);
    if (f.cuisine && /^[a-f0-9]{24}$/i.test(f.cuisine)) filter.cuisineIds = new Types.ObjectId(f.cuisine);
    const sort: Record<CatalogSort, Record<string, 1 | -1>> = {
      popular: { ratingCount: -1, ratingAvg: -1, publishedAt: -1 },
      rating: { ratingAvg: -1, ratingCount: -1 },
      new: { publishedAt: -1 },
      prep: { avgPrepMinutes: 1 },
    };
    const docs = (await this.restaurants.find(filter, { draft: 0 }).sort(sort[f.sort]).limit(Math.min(f.limit, 100)).lean()) as R[];
    let cards = await this.cards(docs);
    if (f.openNow) cards = cards.filter((c) => c.isOpen);
    // Restaurants sponsorisés (campagne « tête de liste » active) : en premier, toujours signalés comme tels.
    const sponsored = new Set((await this.growth.activeAds('TOP_LIST')).map((a) => String(a.restaurantId)));
    cards = cards.map((c) => ({ ...c, sponsored: sponsored.has(c.id) }));
    return [...cards.filter((c) => c.sponsored), ...cards.filter((c) => !c.sponsored)];
  }

  async restaurantBySlug(slug: string): Promise<PublicRestaurantDetail> {
    const r = (await this.restaurants.findOne({ slug, ...VISIBLE }, { draft: 0 }).lean()) as R | null;
    if (!r) throw notFound('Restaurant introuvable.');
    const [card] = await this.cards([r]);
    const [cats, prods, promos] = await Promise.all([
      this.categories.find({ restaurantId: r._id, active: true }).sort({ sort: 1 }).lean(),
      this.products.find({ restaurantId: r._id, status: 'PUBLISHED' }).sort({ sort: 1 }).lean(),
      this.promotions.activeFor(r._id),
    ]);
    return {
      ...card, phone: r.phone ?? '', whatsapp: r.whatsapp, address: r.address ?? '', openingHours: r.openingHours,
      menu: cats.map((c) => ({
        id: String(c._id), name: c.name,
        products: (prods as P[]).filter((p) => String(p.menuCategoryId) === String(c._id)).map((p) => this.productDto(p, promos)),
      })).filter((c) => c.products.length > 0),
      promotions: promos.map((p) => ({ name: p.name, type: p.type, value: p.value, endsAt: new Date(p.endsAt).toISOString(), minItemsSubtotal: p.minItemsSubtotal, allProducts: p.productIds.length === 0 })),
    };
  }

  async product(id: Types.ObjectId) {
    // Lecture publique transversale : un plat est identifié par son id, son restaurant est vérifié ensuite.
    const p = (await this.products.findOne({ _id: id, status: 'PUBLISHED' }).setOptions({ crossTenant: true }).lean()) as P | null;
    if (!p) throw notFound('Plat introuvable.');
    const r = (await this.restaurants.findOne({ _id: p.restaurantId, ...VISIBLE }, { draft: 0 }).lean()) as R | null;
    if (!r) throw notFound('Plat introuvable.');
    const cat = await this.categories.findOne({ restaurantId: r._id, _id: p.menuCategoryId, active: true }).lean();
    if (!cat) throw notFound('Plat introuvable.');
    const [card] = await this.cards([r]);
    return { product: this.productDto(p, await this.promotions.activeFor(r._id)), restaurant: card };
  }

  /** Recherche globale : restaurants et plats (des seuls restaurants visibles). */
  async search(q: string) {
    const restaurants = await this.listRestaurants({ q, sort: 'popular', limit: 20 });
    const visibleIds = (await this.restaurants.find(VISIBLE, { _id: 1 }).lean()).map((r) => r._id);
    const prods = (await this.products
      .find({ restaurantId: { $in: visibleIds }, status: 'PUBLISHED', searchText: containsRegex(q) })
      .setOptions({ crossTenant: true }).limit(30).lean()) as P[];
    const owners = (await this.restaurants.find({ _id: { $in: prods.map((p) => p.restaurantId) } }, { name: 1, slug: 1 }).lean());
    const oMap = new Map(owners.map((o) => [String(o._id), o]));
    return {
      restaurants,
      products: prods.map((p) => ({ ...this.productDto(p), restaurantName: oMap.get(String(p.restaurantId))?.name ?? '', restaurantSlug: oMap.get(String(p.restaurantId))?.slug ?? '' })),
    };
  }

  /** Accueil composé des sections administrées (ou d'un accueil par défaut si aucune n'est configurée). */
  async home() {
    const sections = await this.growth.activeSections();
    const list = sections.length ? sections : [
      { type: 'CUISINES', title: 'Catégories populaires', restaurantIds: [] as Types.ObjectId[] },
      { type: 'POPULAR_RESTAURANTS', title: 'Restaurants', restaurantIds: [] as Types.ObjectId[] },
    ];
    const out: unknown[] = [];
    for (const s of list) {
      if (s.type === 'CUISINES') out.push({ type: s.type, title: s.title, cuisines: (await this.cuisines.list(true)).map(({ id, name, slug, imageUrl, emoji }) => ({ id, name, slug, imageUrl, emoji })) });
      else if (s.type === 'BANNERS') {
        const ads = await this.growth.activeAds('BANNER');
        const rs = (await this.restaurants.find({ _id: { $in: ads.map((a) => a.restaurantId) }, ...VISIBLE }, { slug: 1, name: 1, coverPublicId: 1 }).lean());
        const bySlug = new Map(rs.map((r) => [String(r._id), r]));
        const banners = ads.flatMap((a) => { const r = bySlug.get(String(a.restaurantId)); return r ? [{ id: String(a._id), title: a.title || r.name, imageUrl: imageUrl(a.imagePublicId ?? r.coverPublicId, 900), restaurantSlug: r.slug, sponsored: true }] : []; });
        if (banners.length) out.push({ type: s.type, title: s.title, banners });
      } else if (s.type === 'FEATURED_DISHES') {
        const ads = await this.growth.activeAds('FEATURED_PRODUCT');
        const items: unknown[] = [];
        for (const a of ads.slice(0, 10)) {
          try { const p = await this.product(a.productId!); items.push({ ...p, sponsored: true }); } catch { /* plat ou restaurant indisponible : ignoré */ }
        }
        if (items.length) out.push({ type: s.type, title: s.title, dishes: items });
      } else {
        const sort = s.type === 'NEW_RESTAURANTS' ? 'new' : 'popular';
        let restaurants = await this.listRestaurants({ sort, limit: 12 });
        if (s.type === 'RECOMMENDED_RESTAURANTS') restaurants = restaurants.filter((r) => s.restaurantIds.some((id) => String(id) === r.id));
        if (s.type === 'PROMOTIONS') {
          const withPromo: typeof restaurants = [];
          for (const r of restaurants) if ((await this.promotions.activeFor(r.id)).length) withPromo.push(r);
          restaurants = withPromo;
        }
        if (restaurants.length) out.push({ type: s.type, title: s.title, restaurants });
      }
    }
    return { sections: out, configured: sections.length > 0 };
  }
}
