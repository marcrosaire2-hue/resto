// Crée l'utilisateur applicatif MongoDB avec le principe du moindre privilège.
// Les collections en ajout seul (journal d'audit, puis historique des statuts et grand livre)
// n'accordent PAS update/remove : même un bug applicatif ne peut pas les modifier.
//
// Usage (Atlas : préférer l'interface « Database Access » > Custom Role en reprenant ces privilèges) :
//   mongosh "<uri admin>" --file infra/mongo/init-app-user.js
// Variables : APP_DB (défaut plateforme), APP_USER, APP_PASSWORD (obligatoire, jamais dans le code).
const dbName = process.env.APP_DB || 'plateforme';
const user = process.env.APP_USER || 'plateforme_app';
const pwd = process.env.APP_PASSWORD;
if (!pwd) throw new Error('APP_PASSWORD est requis');

// Collections modifiables. Toute nouvelle collection doit être ajoutée ici explicitement.
const MUTABLE = [
  'users', 'sessions', 'password_reset_tokens', 'restaurants', 'restaurant_employees',
  'platform_staff', 'platform_settings',
  // Phase 1
  'cities', 'communes', 'neighborhoods', 'delivery_zones', 'cuisine_categories', 'menu_categories', 'products',
  // Grille de frais : seule la clôture (validTo) est modifiée par le code ; les montants ne le sont jamais.
  'delivery_fee_rules',
  // Phase 2
  'customer_addresses', 'carts', 'orders', 'notifications',
  // Phase 3
  'promotions', 'order_issues',
  // Phase 4
  'couriers', 'deliveries', 'incidents',
  // Contrats : seule la clôture (validTo) est modifiée.
  'restaurant_contracts',
  // Phase 5 : finances et paiement en ligne
  'courier_cash_remittances', 'payouts', 'refunds', 'payments',
  // Phase 6 : commercial, avis, assistance
  'coupons', 'coupon_redemptions', 'subscription_plans', 'restaurant_subscriptions', 'ad_campaigns', 'home_sections',
  'reviews', 'support_tickets',
  // Codes de vérification par e-mail (supprimés automatiquement après expiration)
  'email_codes',
];
// payment_events : notifications brutes du prestataire, conservées telles quelles.
const APPEND_ONLY = ['audit_logs', 'order_status_history', 'ledger_transactions', 'payment_events'];

const target = db.getSiblingDB(dbName);
const privileges = [
  ...MUTABLE.map((c) => ({ resource: { db: dbName, collection: c }, actions: ['find', 'insert', 'update', 'remove', 'createIndex', 'listIndexes', 'createCollection'] })),
  ...APPEND_ONLY.map((c) => ({ resource: { db: dbName, collection: c }, actions: ['find', 'insert', 'createIndex', 'listIndexes', 'createCollection'] })),
  { resource: { db: dbName, collection: '' }, actions: ['listCollections'] },
];

if (target.getRole('appRole')) target.updateRole('appRole', { privileges, roles: [] });
else target.createRole({ role: 'appRole', privileges, roles: [] });

if (target.getUser(user)) target.updateUser(user, { pwd, roles: [{ role: 'appRole', db: dbName }] });
else target.createUser({ user, pwd, roles: [{ role: 'appRole', db: dbName }] });

print(`Utilisateur ${user} prêt sur ${dbName} (audit_logs en ajout seul).`);
