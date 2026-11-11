import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, db, platformUser, registeredClient, startApp, TestEnv } from './helpers';

let t: TestEnv;
let admin: Client;
let neighborhoodId = '';
let cuisineId = '';
let zoneA = '';

const HOURS = { openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '00:00', closes: '23:59' })), closures: [] };

async function applyRestaurant(name: string) {
  const owner = await registeredClient(t.app, `Propriétaire ${name}`);
  const r = await owner.client.post('/api/restaurant-applications', {
    name, phone: owner.phone, neighborhoodId, address: 'Carrefour de test', cuisineIds: [cuisineId], description: `Cuisine maison ${name}`,
  });
  expect(r.status).toBe(201);
  return { id: r.body.id as string, slug: r.body.slug as string, owner };
}

async function activeRestaurant(name: string) {
  const R = await applyRestaurant(name);
  await R.owner.client.put(`/api/restaurants/${R.id}/hours`, HOURS).expect(200);
  await R.owner.client.post(`/api/restaurants/${R.id}/profile/publish`).expect(201);
  await admin.post(`/api/admin/restaurants/${R.id}/review`, { decision: 'approve' }).expect(201);
  return R;
}

const PRODUCT = (menuCategoryId: string) => ({
  menuCategoryId, name: 'Riz au poulet bicyclette', description: 'Poulet braisé, riz parfumé', basePrice: 2500,
  allergens: ['Arachides'], tags: ['Populaire'],
  variantGroups: [{ name: 'Taille', options: [{ name: 'Normale', priceDelta: 0 }, { name: 'Grande', priceDelta: 1000 }] }],
  addonGroups: [{ name: 'Suppléments', min: 0, max: 2, options: [{ name: 'Alloco', price: 500 }, { name: 'Œuf', price: 300 }] }],
});

beforeAll(async () => {
  t = await startApp();
  admin = (await platformUser(t.app, 'super_admin')).client;
  const city = await admin.post('/api/admin/geo/cities', { name: 'Cotonou' });
  const commune = await admin.post('/api/admin/geo/communes', { parentId: city.body.id, name: 'Cotonou' });
  const hood = await admin.post('/api/admin/geo/neighborhoods', { parentId: commune.body.id, name: 'Cadjèhoun' });
  neighborhoodId = hood.body.id;
  const zone = await admin.post('/api/admin/geo/zones', { name: 'Zone Ouest', neighborhoodIds: [neighborhoodId] });
  zoneA = zone.body.id;
  const cuisine = await admin.post('/api/admin/cuisines', { name: 'Cuisine africaine', emoji: '🍲' });
  cuisineId = cuisine.body.id;
});
afterAll(async () => {
  await t?.close();
});

describe('Zones et grille de frais', () => {
  it('expose la géographie active publiquement', async () => {
    const c = await new Client(t.app).init();
    const r = await c.get('/api/catalog/zones');
    expect(r.body[0].communes[0].neighborhoods[0].name).toBe('Cadjèhoun');
  });

  it("refuse qu'un quartier appartienne à deux zones", async () => {
    const r = await admin.post('/api/admin/geo/zones', { name: 'Zone doublon', neighborhoodIds: [neighborhoodId] });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('NEIGHBORHOOD_IN_OTHER_ZONE');
  });

  it('versionne la grille : une nouvelle règle clôture la précédente sans la modifier', async () => {
    await admin.post('/api/admin/geo/fee-rules', { fromZoneId: zoneA, toZoneId: zoneA, customerFee: 800, courierPay: 600 }).expect(201);
    await admin.post('/api/admin/geo/fee-rules', { fromZoneId: zoneA, toZoneId: zoneA, customerFee: 1000, courierPay: 700 }).expect(201);
    const all = await db(t).collection('delivery_fee_rules').find().sort({ createdAt: 1 }).toArray();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ customerFee: 800, courierPay: 600 });
    expect(all[0].validTo).toBeInstanceOf(Date);
    expect(all[1].validTo).toBeNull();
    const view = await admin.get('/api/admin/geo');
    expect(view.body.feeRules).toEqual([expect.objectContaining({ customerFee: 1000, courierPay: 700 })]);
  });

  it("un client ne peut pas gérer les zones", async () => {
    const { client } = await registeredClient(t.app);
    expect((await client.post('/api/admin/geo/cities', { name: 'Porto-Novo' })).status).toBe(403);
  });
});

describe('Candidature, validation et publication de la vitrine', () => {
  it("n'apparaît au public qu'après validation ET publication", async () => {
    const pub = await new Client(t.app).init();
    const R = await applyRestaurant('Chez Tantie Rose');
    expect((await pub.get(`/api/catalog/restaurants/${R.slug}`)).status).toBe(404);

    const noHours = await R.owner.client.post(`/api/restaurants/${R.id}/profile/publish`);
    expect(noHours.status).toBe(422);
    expect(noHours.body.error).toBe('HOURS_REQUIRED');

    await R.owner.client.put(`/api/restaurants/${R.id}/hours`, HOURS).expect(200);
    await R.owner.client.post(`/api/restaurants/${R.id}/profile/publish`).expect(201);
    expect((await pub.get(`/api/catalog/restaurants/${R.slug}`)).status).toBe(404); // toujours en attente

    const refuse = await admin.post(`/api/admin/restaurants/${R.id}/review`, { decision: 'reject' });
    expect(refuse.status).toBe(400); // motif obligatoire
    await admin.post(`/api/admin/restaurants/${R.id}/review`, { decision: 'approve' }).expect(201);
    const visible = await pub.get(`/api/catalog/restaurants/${R.slug}`);
    expect(visible.status).toBe(200);
    expect(visible.body).toMatchObject({ name: 'Chez Tantie Rose', neighborhood: 'Cadjèhoun', isOpen: true, isDemo: false });
    // Aucune donnée privée dans la réponse publique
    expect(JSON.stringify(visible.body)).not.toMatch(/draft|searchText|createdBy|statusReason/);
  });

  it("le brouillon reste privé jusqu'à sa publication (aperçu)", async () => {
    const R = await activeRestaurant('Maquis du Lac');
    const pub = await new Client(t.app).init();
    const draft = { name: 'Maquis du Lac Nokoué', description: 'Poissons braisés', phone: R.owner.phone, address: 'Bord du lac', neighborhoodId, cuisineIds: [cuisineId], avgPrepMinutes: 25 };
    const saved = await R.owner.client.put(`/api/restaurants/${R.id}/profile/draft`, draft);
    expect(saved.status).toBe(200);
    expect(saved.body.preview.name).toBe('Maquis du Lac Nokoué');
    expect((await pub.get(`/api/catalog/restaurants/${R.slug}`)).body.name).toBe('Maquis du Lac');
    const published = await R.owner.client.post(`/api/restaurants/${R.id}/profile/publish`);
    expect(published.body.slug).toBe('maquis-du-lac-nokoue');
    expect((await pub.get('/api/catalog/restaurants/maquis-du-lac-nokoue')).body.description).toBe('Poissons braisés');
  });

  it('refuse un logo téléversé dans le dossier d’un autre restaurant', async () => {
    const A = await activeRestaurant('Resto Logo A');
    const B = await activeRestaurant('Resto Logo B');
    const r = await A.owner.client.put(`/api/restaurants/${A.id}/profile/draft`, {
      name: 'Resto Logo A', phone: A.owner.phone, address: 'Rue du test', neighborhoodId, cuisineIds: [cuisineId], avgPrepMinutes: 20,
      logoPublicId: `plateforme/test/restaurants/${B.id}/logo/vol`,
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('INVALID_IMAGE');
  });

  it("ne peut pas recevoir de commandes avant d'être validé", async () => {
    const R = await applyRestaurant('Resto Pressé');
    const r = await R.owner.client.patch(`/api/restaurants/${R.id}/accepting-orders`, { acceptingOrders: true });
    expect(r.status).toBe(422);
  });
});

describe('Menu : un restaurant validé publie un plat visible sur sa vitrine', () => {
  it('cycle complet brouillon → publié → indisponible → archivé', async () => {
    const R = await activeRestaurant('Le Bon Riz');
    const pub = await new Client(t.app).init();
    const cat = await R.owner.client.post(`/api/restaurants/${R.id}/menu/categories`, { name: 'Plats principaux' });
    const created = await R.owner.client.post(`/api/restaurants/${R.id}/menu/products`, PRODUCT(cat.body.id));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    const pid = created.body.id;
    expect((await pub.get(`/api/catalog/products/${pid}`)).status).toBe(404);

    await R.owner.client.post(`/api/restaurants/${R.id}/menu/products/${pid}/publish`).expect(201);
    const vitrine = await pub.get(`/api/catalog/restaurants/${R.slug}`);
    const product = vitrine.body.menu[0].products[0];
    expect(product).toMatchObject({ name: 'Riz au poulet bicyclette', basePrice: 2500, available: true });
    expect(product.variantGroups[0].options[1]).toMatchObject({ name: 'Grande', priceDelta: 1000, id: expect.stringMatching(/^[a-f0-9]{24}$/) });

    // Les identifiants d'options sont conservés lors d'une modification
    const update = PRODUCT(cat.body.id);
    update.variantGroups[0] = { ...update.variantGroups[0], id: product.variantGroups[0].id, options: update.variantGroups[0].options.map((o, i) => ({ ...o, id: product.variantGroups[0].options[i].id })) } as never;
    update.basePrice = 2700;
    const updated = await R.owner.client.put(`/api/restaurants/${R.id}/menu/products/${pid}`, update);
    expect(updated.body.variantGroups[0].options[1].id).toBe(product.variantGroups[0].options[1].id);
    expect((await pub.get(`/api/catalog/products/${pid}`)).body.product.basePrice).toBe(2700);

    await R.owner.client.patch(`/api/restaurants/${R.id}/menu/products/${pid}/availability`, { available: false }).expect(200);
    expect((await pub.get(`/api/catalog/products/${pid}`)).body.product.available).toBe(false);

    await R.owner.client.post(`/api/restaurants/${R.id}/menu/products/${pid}/archive`).expect(201);
    expect((await pub.get(`/api/catalog/products/${pid}`)).status).toBe(404);
    expect(await db(t).collection('products').countDocuments({ name: 'Riz au poulet bicyclette' })).toBe(1); // jamais supprimé
    const delCat = await R.owner.client.agent.delete(`/api/restaurants/${R.id}/menu/categories/${cat.body.id}`).set('x-csrf-token', R.owner.client.csrf);
    expect(delCat.status).toBe(204); // vide hors plats archivés
  });

  it('refuse une catégorie non vide et des prix décimaux', async () => {
    const R = await activeRestaurant('Resto Règles');
    const cat = await R.owner.client.post(`/api/restaurants/${R.id}/menu/categories`, { name: 'Grillades' });
    await R.owner.client.post(`/api/restaurants/${R.id}/menu/products`, PRODUCT(cat.body.id)).expect(201);
    const del = await R.owner.client.agent.delete(`/api/restaurants/${R.id}/menu/categories/${cat.body.id}`).set('x-csrf-token', R.owner.client.csrf);
    expect(del.status).toBe(422);
    const bad = await R.owner.client.post(`/api/restaurants/${R.id}/menu/products`, { ...PRODUCT(cat.body.id), basePrice: 99.5 });
    expect(bad.status).toBe(400);
  });

  it('le cuisinier change la disponibilité mais ne modifie ni ne publie le menu', async () => {
    const R = await activeRestaurant('Resto Cuisinier');
    const cat = await R.owner.client.post(`/api/restaurants/${R.id}/menu/categories`, { name: 'Plats' });
    const p = await R.owner.client.post(`/api/restaurants/${R.id}/menu/products`, PRODUCT(cat.body.id));
    const cook = await registeredClient(t.app, 'Cuisinier');
    await R.owner.client.post(`/api/restaurants/${R.id}/staff`, { phone: cook.phone, roleCode: 'cook' }).expect(201);
    expect((await cook.client.patch(`/api/restaurants/${R.id}/menu/products/${p.body.id}/availability`, { available: false })).status).toBe(200);
    expect((await cook.client.put(`/api/restaurants/${R.id}/menu/products/${p.body.id}`, PRODUCT(cat.body.id))).status).toBe(403);
    expect((await cook.client.post(`/api/restaurants/${R.id}/menu/products/${p.body.id}/publish`)).status).toBe(403);
    expect((await cook.client.put(`/api/restaurants/${R.id}/profile/draft`, {})).status).toBe(403);
  });
});

describe('Scénario 4 — isolation des menus entre restaurants (API)', () => {
  it("le restaurant B ne peut ni lire ni modifier le menu de A, même avec les bons identifiants", async () => {
    const A = await activeRestaurant('Isolation A');
    const B = await activeRestaurant('Isolation B');
    const catA = await A.owner.client.post(`/api/restaurants/${A.id}/menu/categories`, { name: 'Plats A' });
    const pA = await A.owner.client.post(`/api/restaurants/${A.id}/menu/products`, PRODUCT(catA.body.id));
    const catB = await B.owner.client.post(`/api/restaurants/${B.id}/menu/categories`, { name: 'Plats B' });

    expect((await B.owner.client.get(`/api/restaurants/${A.id}/menu`)).status).toBe(404);
    expect((await B.owner.client.get(`/api/restaurants/${A.id}/profile`)).status).toBe(404);
    expect((await B.owner.client.post(`/api/restaurants/${A.id}/menu/products/${pA.body.id}/publish`)).status).toBe(404);
    // Via sa propre URL, B ne trouve pas le plat de A
    expect((await B.owner.client.post(`/api/restaurants/${B.id}/menu/products/${pA.body.id}/publish`)).status).toBe(404);
    expect((await B.owner.client.put(`/api/restaurants/${B.id}/menu/products/${pA.body.id}`, PRODUCT(catB.body.id))).status).toBe(404);
    // B ne peut pas rattacher un plat à une catégorie de A
    expect((await B.owner.client.post(`/api/restaurants/${B.id}/menu/products`, PRODUCT(catA.body.id))).status).toBe(422);
    // Le plat de A est intact
    const menuA = await A.owner.client.get(`/api/restaurants/${A.id}/menu`);
    expect(menuA.body.products[0]).toMatchObject({ status: 'DRAFT', name: 'Riz au poulet bicyclette' });
  });
});

describe('Catalogue public', () => {
  it('recherche sans accents, filtre par cuisine et ignore les caractères spéciaux', async () => {
    const R = await activeRestaurant('Saveurs de Ouidah');
    const cat = await R.owner.client.post(`/api/restaurants/${R.id}/menu/categories`, { name: 'Plats' });
    const p = await R.owner.client.post(`/api/restaurants/${R.id}/menu/products`, { ...PRODUCT(cat.body.id), name: 'Amiwo au poulet épicé' });
    await R.owner.client.post(`/api/restaurants/${R.id}/menu/products/${p.body.id}/publish`).expect(201);
    const pub = await new Client(t.app).init();
    const s = await pub.get('/api/catalog/search?q=EPICE');
    expect(s.body.products.map((x: { name: string }) => x.name)).toContain('Amiwo au poulet épicé');
    const list = await pub.get(`/api/catalog/restaurants?cuisine=${cuisineId}&sort=new`);
    expect(list.body[0].name).toBe('Saveurs de Ouidah');
    const weird = await pub.get('/api/catalog/search?q=' + encodeURIComponent('.*(['));
    expect(weird.status).toBe(200);
    expect(weird.body.products).toEqual([]);
  });

  it('liste les catégories de cuisine actives', async () => {
    const pub = await new Client(t.app).init();
    const r = await pub.get('/api/catalog/cuisines');
    expect(r.body).toEqual([expect.objectContaining({ name: 'Cuisine africaine', emoji: '🍲' })]);
  });
});
