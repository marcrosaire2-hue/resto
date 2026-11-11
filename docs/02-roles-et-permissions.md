# 2. Rôles et permissions

## 2.1 Principe
- Le système fonctionne par **permissions**. Un rôle n'est qu'un ensemble de permissions.
- Le code vérifie toujours une permission (`orders.accept`), jamais un nom de rôle.
- Une permission s'applique dans un **périmètre** :
  - `platform` : salariés de la plateforme ;
  - `restaurant:{id}` : employés d'un restaurant ;
  - `self` : client ou livreur sur ses propres données.
- Un même utilisateur peut cumuler plusieurs périmètres. Exemple : un gérant de restaurant peut aussi commander comme client.
- **Aucune permission n'est donnée par défaut.** Un nouvel employé n'obtient que ce que son rôle prévoit, jamais les droits du propriétaire.

## 2.2 Isolation des restaurants (multi-tenant)
Trois couches de protection indépendantes :
1. **Guard NestJS** : le `restaurantId` de la route doit appartenir aux affectations actives de l'utilisateur, avec la permission demandée. Sinon la réponse est `404`, ce qui évite de révéler qu'une ressource existe.
2. **Couche service** : chaque requête sur des données d'un restaurant inclut `restaurant_id = :tenant`. Les dépôts de données ne proposent aucune méthode « sans tenant » ; les accès plateforme passent par des dépôts distincts et audités.
3. **Row Level Security PostgreSQL** :
   - au début de chaque transaction, la connexion déclare `app.tenant_id` et `app.scope` ;
   - les politiques RLS sur `orders`, `order_items`, `products`, `restaurant_employees`, `ledger_entries`, etc. refusent toute ligne d'un autre restaurant ;
   - un oubli dans le code ne peut donc pas provoquer de fuite.

Ce que **le public** voit d'un restaurant : la vitrine (nom, logo, menu publié, horaires, note, avis modérés, zones desservies).

Ce qui reste **privé** : commandes, données clients, finances, employés, contrat et taux de commission, documents.

## 2.3 Catalogue des permissions (extrait structurant)

| Domaine | Permissions |
|---|---|
| Établissement | `restaurant.profile.view`, `restaurant.profile.edit`, `restaurant.hours.edit`, `restaurant.zones.edit`, `restaurant.open_toggle` |
| Menu | `menu.view`, `menu.edit`, `menu.publish`, `menu.availability.toggle`, `promotions.manage` |
| Commandes | `orders.view`, `orders.view_customer_contact`, `orders.accept`, `orders.reject`, `orders.prepare`, `orders.mark_ready`, `orders.request_courier`, `orders.report_issue` |
| Cuisine | `kitchen.view`, `kitchen.update` |
| Finances restaurant | `finance.restaurant.view`, `payouts.view` |
| Personnel | `staff.view`, `staff.manage`, `staff.audit.view` |
| Avis | `reviews.reply` |
| Plateforme : opérations | `ops.orders.view_all`, `ops.dispatch.assign`, `ops.dispatch.reassign`, `ops.incidents.manage`, `ops.map.view`, `ops.orders.cancel` |
| Plateforme : finances | `finance.ledger.view`, `finance.refunds.approve`, `finance.payouts.execute`, `finance.reports.export`, `finance.courier_cash.reconcile` |
| Plateforme : commercial | `commercial.commissions.edit`, `commercial.plans.manage`, `commercial.coupons.manage`, `commercial.ads.manage` |
| Plateforme : administration | `admin.restaurants.review`, `admin.restaurants.suspend`, `admin.couriers.review`, `admin.users.manage`, `admin.staff.manage`, `admin.settings.edit`, `admin.zones.manage`, `admin.content.manage`, `admin.audit.view`, `admin.reviews.moderate` |
| Support | `support.tickets.manage`, `support.customers.view` |

## 2.4 Rôles des restaurants (par défaut, ajustables par le propriétaire dans la limite de ses propres droits)

| Permission | Propriétaire | Gérant | Resp. commandes | Cuisinier | Caissier |
|---|:-:|:-:|:-:|:-:|:-:|
| Profil, horaires, zones | ✅ | ✅ | — | — | — |
| Menu et promotions | ✅ | ✅ | — | — | — |
| Disponibilité d'un plat | ✅ | ✅ | ✅ | ✅ | — |
| Voir les commandes | ✅ | ✅ | ✅ | ✅ (sans contact client) | ✅ |
| Contact client (téléphone, adresse) | ✅ | ✅ | ✅ | — | — |
| Accepter ou refuser | ✅ | ✅ | ✅ | — | — |
| Préparation et « prête » | ✅ | ✅ | ✅ | ✅ | — |
| Demander un livreur | ✅ | ✅ | ✅ | — | — |
| Finances et versements | ✅ | ✅ (lecture) | — | — | ✅ (lecture) |
| Personnel | ✅ | — | — | — | — |
| Journal d'actions | ✅ | ✅ | — | — | — |

Règle : seul le propriétaire gère le personnel. Il ne peut pas se retirer lui-même son rôle s'il est le dernier propriétaire.

## 2.5 Rôles de la plateforme

| Domaine | Super-admin | Resp. opérations | Agent financier | Resp. commercial | Agent support | Resp. marketing |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Commandes : voir, filtrer | ✅ | ✅ | ✅ (lecture) | — | ✅ | — |
| Dispatch et incidents | ✅ | ✅ | — | — | incidents (lecture) | — |
| Annuler une commande | ✅ | ✅ | — | — | — | — |
| Grand livre, remboursements, versements | ✅ | — | ✅ | — | — | — |
| Commissions, abonnements | ✅ | — | lecture | ✅ | — | — |
| Coupons, publicités, contenu de l'accueil | ✅ | — | — | ✅ | — | ✅ |
| Validation des restaurants et des livreurs | ✅ | livreurs | — | restaurants | — | — |
| Zones et frais de livraison | ✅ | ✅ | — | — | — | — |
| Salariés, paramètres, audit | ✅ | — | — | — | — | — |
| Tickets clients | ✅ | ✅ | — | — | ✅ | — |

Règle de **double validation** (configurable) : un remboursement au-delà d'un seuil, une modification de commission ou un versement exigent une approbation par un second salarié habilité.

## 2.6 Client et livreur
- **Client** : uniquement ses propres commandes, adresses, avis et notifications.
- **Livreur** :
  - avant d'accepter une course, il ne voit que les informations nécessaires (zones, distance, rémunération) ;
  - après acceptation, il voit le nom du client, son téléphone et son adresse ;
  - après la livraison, le téléphone du client est masqué ;
  - il ne voit jamais les données d'un autre livreur.

## 2.7 Comptes suspendus
- Un compte suspendu (client, livreur, employé ou restaurant) perd immédiatement ses sessions actives.
- Un restaurant suspendu disparaît de la marketplace. Ses commandes en cours sont signalées aux opérations.
