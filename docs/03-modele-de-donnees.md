# 3. Modèle de données

> **MongoDB** ([ADR 0001](adr/0001-mongodb-et-cloudinary.md)) : chaque « table » ci-dessous est une **collection**, avec des identifiants `ObjectId`. Les montants restent des entiers FCFA. Ce qui était prévu en RLS est assuré par `tenantScopedPlugin` ; les triggers d'ajout seul sont assurés par `appendOnlyPlugin` et par le rôle MongoDB `appRole`. Les lignes de commande embarquent leurs instantanés (sous-documents).

Conventions :
- Clés primaires en UUID v7, triables par date.
- Colonnes `created_at` et `updated_at` sur toutes les tables.
- Montants en `integer` FCFA.
- Suppression **logique** (`archived_at`) pour toute entité référencée par l'historique. Une ligne de commande, une transaction ou une entrée d'audit ne sont jamais supprimées.

## 3.1 Identité et accès
| Table | Champs clés | Contraintes / index |
|---|---|---|
| `users` | full_name, phone (E.164), email?, password_hash, phone_verified_at, status (ACTIVE/SUSPENDED), avatar_key | `UNIQUE(phone)`, `UNIQUE(lower(email))` |
| `sessions` | user_id, token_hash, ip, user_agent, expires_at, revoked_at | index (user_id) |
| `otp_codes` | phone, purpose, code_hash, attempts, expires_at, consumed_at | limite de tentatives |
| `roles` | code, scope_type (PLATFORM/RESTAURANT), is_system | `UNIQUE(code, scope_type, restaurant_id)` |
| `permissions` | code, description | `UNIQUE(code)` |
| `role_permissions` | role_id, permission_id | PK composite |
| `platform_staff` | user_id, role_id, status | |
| `restaurant_employees` | restaurant_id, user_id, role_id, status, invited_by | `UNIQUE(restaurant_id, user_id)` ; RLS |

## 3.2 Géographie et zones
| Table | Champs clés |
|---|---|
| `cities` | name, is_active |
| `communes` | city_id, name, is_active |
| `neighborhoods` (quartiers) | commune_id, name, lat?, lng?, is_active |
| `delivery_zones` | name, is_active, description |
| `delivery_zone_neighborhoods` | zone_id, neighborhood_id |
| `delivery_fee_rules` | from_zone_id, to_zone_id, customer_fee, courier_pay, valid_from, valid_to | grille **versionnée** (jamais modifiée sur place) |

## 3.3 Restaurants et catalogue
| Table | Champs clés | Remarques |
|---|---|---|
| `restaurants` | slug, name, description, logo_key, cover_key, phone, whatsapp, email, address, neighborhood_id, lat?, lng?, status (APPLICATION/PENDING_REVIEW/ACTIVE/SUSPENDED/REJECTED), accepting_orders, avg_prep_minutes, scheduled_orders_enabled, rating_avg, rating_count | `UNIQUE(slug)` ; note recalculée à partir des avis |
| `restaurant_documents` | restaurant_id, type, file_key, status | stockage privé |
| `restaurant_contracts` | restaurant_id, commission_rate_bps, fixed_fee, plan_id, valid_from, valid_to, approved_by | taux en points de base ; **versionné** |
| `restaurant_opening_hours` | restaurant_id, weekday, opens_at, closes_at | plusieurs plages par jour |
| `restaurant_closures` | restaurant_id, date_from, date_to, reason | jours de fermeture exceptionnels |
| `restaurant_delivery_zones` | restaurant_id, zone_id | zones desservies |
| `cuisine_categories` | name, slug, icon_key, sort, is_active | catégories de la marketplace, administrables |
| `restaurant_cuisines` | restaurant_id, cuisine_category_id | |
| `menu_categories` | restaurant_id, name, sort, is_active | RLS |
| `products` | restaurant_id, menu_category_id, name, description, base_price, is_available, status (DRAFT/PUBLISHED/ARCHIVED), allergens[], tags[] | index (restaurant_id, status) ; recherche plein texte (`tsvector` + `unaccent`) |
| `product_images` | product_id, file_key, sort | |
| `product_variants` | product_id, group_name (ex. « Taille »), name, price_delta, is_default | |
| `product_addon_groups` | product_id, name, min_select, max_select | ex. « Suppléments » (0 à 3) |
| `product_addons` | group_id, name, price, is_available | |

Les modifications de menu sont publiées immédiatement. L'aperçu avant publication s'applique au **profil** de l'établissement :
- le restaurant modifie un brouillon `restaurant_profile_drafts` ;
- il visualise l'aperçu ;
- il publie, ce qui copie le brouillon sur `restaurants` et l'inscrit dans l'audit.

## 3.4 Clients
| Table | Champs clés |
|---|---|
| `customer_addresses` | user_id, label, city_id, commune_id, neighborhood_id, street_landmark, instructions, lat?, lng?, is_default |
| `favorites` | user_id, restaurant_id? / product_id? |
| `carts` | user_id?, guest_token?, restaurant_id, updated_at |
| `cart_items` | cart_id, product_id, variant_id?, quantity, addon_ids[], instructions |

Le panier est conservé côté serveur et peut exister **sans compte** (jeton invité) : la connexion n'est demandée qu'à la validation. Un panier est lié à **un seul restaurant**. Si le client ajoute un plat d'un autre restaurant, l'interface lui propose de vider le panier ou de le conserver séparément. Chaque panier produit sa propre commande.

## 3.5 Commandes (cœur du système)
| Table | Champs clés | Remarques |
|---|---|---|
| `orders` | number (ex. `CT-251111-4821`), customer_id, restaurant_id, status, payment_method, payment_status, idempotency_key, **instantanés** : delivery_address_snapshot (JSON), customer_name, customer_phone, **montants** : items_subtotal, restaurant_discount, platform_discount, delivery_fee, service_fee, total, **finance figée** : commission_rate_bps, commission_amount, restaurant_net, courier_pay, contract_id, fee_rule_id ; delivery_otp_hash, scheduled_for?, accept_deadline_at | `UNIQUE(number)`, `UNIQUE(customer_id, idempotency_key)` ; index (restaurant_id, status, created_at) ; RLS |
| `order_items` | order_id, product_id, **product_name_snapshot**, **description_snapshot**, variant_name_snapshot, unit_price_snapshot, addons_snapshot (JSON nom + prix), quantity, line_total, instructions | aucune clé étrangère bloquante vers un produit archivé |
| `order_status_history` | order_id, from_status, to_status, actor_user_id, actor_role, reason, created_at | ajout uniquement |
| `order_issues` | order_id, type, description, reported_by | |

## 3.6 Livraison
| Table | Champs clés |
|---|---|
| `couriers` | user_id, status (PENDING_REVIEW/ACTIVE/SUSPENDED/REJECTED), vehicle_type, plate?, is_online, last_lat?, last_lng?, last_position_at?, cash_held, cash_limit, payout_method (JSON chiffré) |
| `courier_documents` | courier_id, type (CNI, permis…), file_key, status, reviewed_by |
| `deliveries` | order_id (UNIQUE pour la tentative active), courier_id?, status, offered_at, assigned_at, arrived_pickup_at, picked_up_at, delivered_at, failed_reason, distance_km?, attempt_no |
| `delivery_offers` | delivery_id, courier_id, status (OFFERED/ACCEPTED/DECLINED/EXPIRED), expires_at | verrou d'acceptation |
| `courier_positions` | courier_id, lat, lng, accuracy, recorded_at | conservation limitée (ex. 30 jours) |

## 3.7 Paiements et finances (détails au document 5)
| Table | Rôle |
|---|---|
| `payments` | une tentative de paiement : order_id, method, provider, provider_ref, amount, status (PENDING/SUCCEEDED/FAILED/EXPIRED), idempotency_key |
| `payment_events` | webhooks et rappels bruts reçus : provider_event_id **UNIQUE**, signature_valid, payload, processed_at |
| `refunds` | order_id, payment_id, amount, reason, status (REQUESTED/APPROVED/REJECTED/PROCESSING/COMPLETED/FAILED), requested_by, approved_by, provider_ref |
| `ledger_transactions` | groupe d'écritures équilibrées : type, reference (order, refund, payout…), created_by |
| `ledger_entries` | transaction_id, account (ex. `restaurant_payable:{id}`), debit, credit | ajout uniquement, la somme des débits égale la somme des crédits (vérifiée par un trigger) |
| `restaurant_payouts` | restaurant_id, period, amount, status, method, reference, executed_by |
| `courier_payouts` | courier_id, period, amount, status |
| `courier_cash_remittances` | courier_id, amount, received_by, received_at |

## 3.8 Commercial, engagement, support
| Table | Champs clés |
|---|---|
| `promotions` | restaurant_id, type (PERCENT/FIXED), value, starts_at, ends_at, product_ids[], min_order, status | RLS |
| `coupons` | code UNIQUE, funded_by (PLATFORM/RESTAURANT), type, value, max_uses, per_user_limit, valid dates, restaurant_id? |
| `coupon_redemptions` | coupon_id, user_id, order_id |
| `subscription_plans` | name, monthly_price, features (JSON), limits (JSON) |
| `restaurant_subscriptions` | restaurant_id, plan_id, period, status |
| `ad_campaigns` | restaurant_id, placement (TOP_LIST/FEATURED_PRODUCT/BANNER), starts_at, ends_at, price, status | étiquette « Sponsorisé » obligatoire à l'affichage |
| `home_sections` | type, title, config (JSON), sort, is_active | contenu de l'accueil administrable |
| `reviews` | order_id **UNIQUE**, customer_id, restaurant_id, rating 1–5, comment, status (VISIBLE/HIDDEN), reply, replied_at |
| `notifications` | user_id, event_key, channel, title, body, data, read_at, `UNIQUE(user_id, event_key, channel)` | anti-doublon |
| `notification_deliveries` | notification_id, provider, status, attempts, last_error |
| `support_tickets` / `ticket_messages` | auteur, sujet, order_id?, statut, assigné à |
| `incidents` / `incident_events` | order_id?, type, status (OPEN/IN_PROGRESS/RESOLVED/CLOSED), owner_id, resolution |
| `audit_logs` | actor_user_id, scope, action, entity, entity_id, before, after, ip, created_at | ajout uniquement ; partitionnée par mois |
| `platform_settings` | key, value (JSON), updated_by | ex. délai de réponse des restaurants, plafond d'espèces, politique d'annulation, frais de service |

## 3.9 Intégrité
- Les contraintes `CHECK` interdisent les montants négatifs et les notes hors de l'intervalle 1–5.
- Un trigger refuse tout `UPDATE` ou `DELETE` sur `ledger_entries`, `order_status_history` et `audit_logs`.
- Le statut d'une commande ne change **que** par la fonction de transition du domaine (document 4). Elle utilise un verrou optimiste : `UPDATE … WHERE id = $1 AND status = $ancien`. Si aucune ligne n'est modifiée, un conflit est renvoyé.
