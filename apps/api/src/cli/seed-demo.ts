/**
 * Données de DÉMONSTRATION pour le développement (jamais en production).
 * Crée la géographie de base, les catégories de cuisine et 4 restaurants « Démo » (isDemo = true,
 * affichés avec la mention Démo), avec leurs photos téléversées sur Cloudinary.
 *
 *   npm run seed:demo -- --owner-phone 0197000000     (le compte doit exister : il devient propriétaire)
 *   npm run seed:demo -- --reset                       (supprime les restaurants de démo)
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Model, Types } from 'mongoose';
import { normalizePhone } from '@plateforme/contracts';
import { AppModule } from '../app.module';
import { env } from '../common/env';
import { searchText } from '../common/search';
import { CuisineCategory } from '../modules/cuisines/cuisine.schema';
import { City, Commune, DeliveryZone, Neighborhood } from '../modules/geo/geo.schemas';
import { cloudinaryConfig } from '../modules/media/cloudinary';
import { MediaService } from '../modules/media/media.service';
import { MenuCategory, Product } from '../modules/menu/menu.schemas';
import { RestaurantEmployee } from '../modules/rbac/restaurant-employee.schema';
import { Restaurant } from '../modules/restaurants/restaurant.schema';
import { User } from '../modules/users/user.schema';

const ASSETS = resolve(__dirname, '../../../web/public/demo');
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const id = () => new Types.ObjectId().toHexString();

const GEO = { city: 'Cotonou', communes: { Cotonou: ['Cadjèhoun', 'Haie Vive', 'Fidjrossè', 'Akpakpa', 'Gbégamey'], 'Abomey-Calavi': ['Godomey', 'Zogbadjè'] } };
const CUISINES = [
  { name: 'Cuisine africaine', emoji: '🍲', image: 'cat-1.jpg' }, { name: 'Pâtes', emoji: '🍝', image: 'cat-2.jpg' },
  { name: 'Pizzas', emoji: '🍕', image: 'cat-3.jpg' }, { name: 'Burgers', emoji: '🍔', image: 'cat-4.jpg' },
  { name: 'Grillades', emoji: '🍢', image: null }, { name: 'Pâtisseries', emoji: '🥐', image: null },
  { name: 'Boissons', emoji: '🥤', image: null }, { name: 'Desserts', emoji: '🍰', image: null },
];
const RESTOS = [
  { name: 'Le Bol du Chef', description: 'Bols équilibrés et frais, préparés à la minute.', cuisine: 'Cuisine africaine', hood: 'Cadjèhoun', cover: 'resto-1.jpg', prep: 20 },
  { name: 'Saveurs du Marché', description: 'Les saveurs équilibrées du marché, chaque jour.', cuisine: 'Pâtes', hood: 'Haie Vive', cover: 'resto-2.jpg', prep: 25 },
  { name: 'Poulet Croustillant', description: 'Poulet épicé et croustillant, sauces maison.', cuisine: 'Cuisine africaine', hood: 'Fidjrossè', cover: 'resto-3.jpg', prep: 15 },
  { name: 'BBQ Burger', description: 'Burgers grillés au feu de bois.', cuisine: 'Burgers', hood: 'Akpakpa', cover: 'resto-4.jpg', prep: 20 },
];
const MENU = [
  { cat: 'Entrées', name: 'Bruschetta à la tomate', description: 'Pain grillé, tomates fraîches, basilic et huile d’olive.', price: 1500, image: 'menu-1.jpg', tags: ['Populaire'], allergens: ['Gluten'] },
  { cat: 'Entrées', name: 'Salade caprese', description: 'Mozzarella, tomates, basilic, vinaigre balsamique.', price: 2000, image: 'menu-2.jpg', tags: ['Végétarien'], allergens: ['Lait'] },
  { cat: 'Entrées', name: 'Jambon et melon', description: 'Jambon de pays et melon bien sucré.', price: 2500, image: 'menu-3.jpg', tags: ['Recommandé par le chef'], allergens: [] },
  { cat: 'Plats', name: 'Nouilles aux crevettes', description: 'Nouilles sautées aux crevettes, légumes croquants et sauce savoureuse, servies bien chaudes.', price: 3500, image: 'plat-detail.jpg', tags: ['Populaire'], allergens: ['Crustacés', 'Soja'], options: true },
  { cat: 'Plats', name: 'Soupe de la mer', description: 'Soupe de fruits de mer à l’ail et aux herbes fraîches.', price: 3000, image: 'plat-zuppa.jpg', tags: [], allergens: ['Crustacés', 'Poisson', 'Mollusques'] },
  { cat: 'Plats', name: 'Menu burger frites', description: 'Burger grillé, frites maison et sauce.', price: 3000, image: 'commande.jpg', tags: [], allergens: ['Gluten', 'Lait'], options: true },
  { cat: 'Desserts', name: 'Beignets sucrés', description: 'Beignets dorés au sucre, servis tièdes.', price: 1000, image: 'panier-1.jpg', tags: [], allergens: ['Gluten', 'Œufs'] },
];

async function main() {
  if (env().NODE_ENV === 'production') throw new Error('Refusé : les données de démonstration sont interdites en production.');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const m = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
  const restaurants = m<Restaurant>(Restaurant.name);
  const employees = m<RestaurantEmployee>(RestaurantEmployee.name);
  const categories = m<MenuCategory>(MenuCategory.name);
  const products = m<Product>(Product.name);
  try {
    if (process.argv.includes('--reset')) {
      const demo = await restaurants.find({ isDemo: true }, { _id: 1 }).lean();
      for (const r of demo) {
        await products.deleteMany({ restaurantId: r._id });
        await categories.deleteMany({ restaurantId: r._id });
        await employees.deleteMany({ restaurantId: r._id });
      }
      await restaurants.deleteMany({ isDemo: true });
      console.log(`${demo.length} restaurant(s) de démo supprimé(s).`);
      return;
    }
    const phone = normalizePhone(arg('owner-phone') ?? '');
    if (!phone.ok) throw new Error('Usage : --owner-phone <numéro d’un compte existant>');
    const owner = await m<User>(User.name).findOne({ phone: phone.e164 });
    if (!owner) throw new Error('Aucun compte avec ce numéro : créez-le d’abord depuis /inscription.');
    const cfg = cloudinaryConfig();
    if (!cfg) throw new Error('Cloudinary doit être configuré (CLOUDINARY_* dans .env).');
    cloudinary.config({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret });
    const media = app.get(MediaService);
    const upload = async (file: string, folder: string) => {
      const path = resolve(ASSETS, file);
      if (!existsSync(path)) throw new Error(`Image manquante : ${path}`);
      const r = await cloudinary.uploader.upload(path, { folder, overwrite: false, unique_filename: true, resource_type: 'image' });
      return r.public_id as string;
    };

    // Géographie
    const cities = m<City>(City.name), communes = m<Commune>(Commune.name), hoods = m<Neighborhood>(Neighborhood.name);
    const city = (await cities.findOne({ name: GEO.city })) ?? (await cities.create({ name: GEO.city }));
    const hoodIds = new Map<string, Types.ObjectId>();
    for (const [cName, list] of Object.entries(GEO.communes)) {
      const c = (await communes.findOne({ cityId: city._id, name: cName })) ?? (await communes.create({ cityId: city._id, name: cName }));
      for (const h of list) {
        const n = (await hoods.findOne({ communeId: c._id, name: h })) ?? (await hoods.create({ communeId: c._id, cityId: city._id, name: h }));
        hoodIds.set(h, n._id);
      }
    }
    const zones = m<DeliveryZone>(DeliveryZone.name);
    if (!(await zones.exists({ name: 'Cotonou' }))) {
      const cot = [...GEO.communes.Cotonou].map((h) => hoodIds.get(h)!);
      const taken = await zones.exists({ neighborhoodIds: { $in: cot } });
      if (!taken) await zones.create({ name: 'Cotonou', neighborhoodIds: cot });
    }

    // Cuisines
    const cuisines = m<CuisineCategory>(CuisineCategory.name);
    const cuisineIds = new Map<string, Types.ObjectId>();
    for (const [i, c] of CUISINES.entries()) {
      let doc = await cuisines.findOne({ name: c.name });
      if (!doc) {
        const imagePublicId = c.image ? await upload(c.image, media.folderFor('cuisine_image', { userId: String(owner._id) })) : null;
        doc = await cuisines.create({ name: c.name, slug: searchText(c.name).replace(/[^a-z0-9]+/g, '-'), emoji: c.emoji, imagePublicId, sort: i });
      }
      cuisineIds.set(c.name, doc._id);
    }

    // Restaurants de démo
    const zoneDocs = await zones.find({ active: true }, { _id: 1 }).lean();
    for (const r of RESTOS) {
      const slug = searchText(r.name).replace(/[^a-z0-9]+/g, '-');
      if (await restaurants.exists({ slug })) { console.log(`Déjà présent : ${r.name}`); continue; }
      const rid = new Types.ObjectId();
      const coverPublicId = await upload(r.cover, media.folderFor('restaurant_cover', { userId: String(owner._id), restaurantId: String(rid) }));
      await restaurants.create({
        _id: rid, name: r.name, slug, status: 'ACTIVE', createdBy: owner._id, description: r.description, phone: owner.phone,
        address: `${r.hood}, Cotonou`, neighborhoodId: hoodIds.get(r.hood), cuisineIds: [cuisineIds.get(r.cuisine)], avgPrepMinutes: r.prep,
        coverPublicId, logoPublicId: null, acceptingOrders: false, publishedAt: new Date(), isDemo: true,
        openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '10:00', closes: '23:00' })),
        zoneIds: zoneDocs.map((z) => z._id), searchText: searchText(r.name, r.description, r.hood, r.cuisine),
      });
      await employees.create({ restaurantId: rid, userId: owner._id, roleCode: 'owner', createdBy: owner._id });
      const catIds = new Map<string, Types.ObjectId>();
      for (const [i, name] of ['Entrées', 'Plats', 'Desserts'].entries()) {
        const c = await categories.create({ restaurantId: rid, name, sort: i });
        catIds.set(name, c._id);
      }
      for (const [i, p] of MENU.entries()) {
        const image = await upload(p.image, media.folderFor('product_image', { userId: String(owner._id), restaurantId: String(rid) }));
        await products.create({
          restaurantId: rid, menuCategoryId: catIds.get(p.cat), name: p.name, description: p.description, basePrice: p.price,
          images: [image], status: 'PUBLISHED', publishedAt: new Date(), allergens: p.allergens, tags: p.tags, sort: i,
          variantGroups: p.options ? [{ id: id(), name: 'Taille', options: [{ id: id(), name: 'Normale', priceDelta: 0 }, { id: id(), name: 'Grande', priceDelta: 1000 }] }] : [],
          addonGroups: p.options ? [{ id: id(), name: 'Suppléments', min: 0, max: 2, options: [{ id: id(), name: 'Alloco', price: 500, available: true }, { id: id(), name: 'Œuf', price: 300, available: true }] }] : [],
          searchText: searchText(p.name, p.description, ...p.tags),
        });
      }
      console.log(`Créé (Démo) : ${r.name}`);
    }
    console.log(`Terminé. Propriétaire des restaurants de démo : ${owner.fullName}.`);
  } finally {
    await app.close();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
