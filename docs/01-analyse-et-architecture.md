# 1. Analyse et architecture

> **Mise à jour du 2026-11-11** : la base de données est **MongoDB (Atlas)** et les images sont stockées sur **Cloudinary** (décision du porteur de projet). Voir [ADR 0001](adr/0001-mongodb-et-cloudinary.md). Les mentions de PostgreSQL, RLS, Prisma et S3 ci-dessous sont remplacées par les mesures décrites dans cet ADR.

## 1.1 Rapport d'analyse (ÉTAPE 1)

### Existant
- **Aucun code existant** pour ce projet : on part d'un dossier vide. Rien ne sera donc écrasé.
- Les maquettes fournies servent de **références visuelles** : accueil, vitrine restaurant, fiche plat, carte bilingue avec allergènes, panier, paiement et suivi de commande. Elles ne seront pas recopiées. Nous en retenons les principes :
  - cartes arrondies avec photo dominante ;
  - en-tête en dégradé orange ;
  - catégories en pastilles horizontales défilantes ;
  - étiquettes « Populaire », « Végétarien », « Recommandé par le chef » ;
  - sélecteur de quantité −/+ ;
  - champ coupon ;
  - liste des moyens de paiement, avec le paiement à la livraison présélectionné ;
  - suivi de commande sous forme de chronologie cochée ;
  - bloc allergènes ;
  - bouton d'action principal fixé en bas de l'écran sur mobile.
- La palette demandée (#F15A24 / #A93226) est cohérente avec ces références.

### Contraintes propres au marché de Cotonou
| Contrainte | Conséquence sur la conception |
|---|---|
| Adresses souvent informelles (quartier + repère) | Adresse = commune + quartier + repère + indications ; GPS **facultatif**. Les zones et frais de livraison reposent sur les **quartiers**, pas sur des polygones GPS. |
| Majorité de smartphones Android d'entrée de gamme, data coûteuse | PWA légère, images optimisées (AVIF/WebP, tailles multiples), pages publiques rendues côté serveur, peu de JavaScript côté client. |
| Connexion instable | Reconnexion automatique du temps réel avec resynchronisation. Les actions critiques sont idempotentes (une double soumission ne crée pas de doublon). |
| Paiement à la livraison dominant au départ | L'espèce est un moyen de paiement à part entière. Il faut suivre l'**argent liquide détenu par chaque livreur** et son reversement. |
| Mobile Money (MTN, Moov) | Couche d'abstraction des prestataires. L'intégration réelle dépend des accès marchands (voir les décisions à prendre). |
| Protection des données (Code du numérique du Bénin, autorité APDP) | Minimisation des données, journal d'audit, masquage du téléphone client après livraison, déclaration à prévoir côté juridique. |

### Risques techniques et métier
| Risque | Gravité | Mitigation |
|---|---|---|
| Fuite de données entre restaurants | Critique | Filtrage par `restaurant_id` dans chaque requête de service + RLS PostgreSQL + tests d'isolation automatisés sur l'API |
| Fraude sur l'espèce (livreur qui ne reverse pas) | Élevée | Solde « espèces détenues » par livreur, plafond configurable au-delà duquel il ne reçoit plus de courses, rapprochement quotidien |
| Fausse confirmation de livraison | Élevée | Code OTP à 4 chiffres remis par le client, une seule validation possible, géolocalisation enregistrée si elle est autorisée |
| Délais d'obtention des accès Mobile Money (KYC marchand) | Élevée | Lancer la démarche dès maintenant ; MVP fonctionnel en espèces |
| Restaurants qui ne répondent pas | Moyenne | Délai de réponse configurable, alerte aux opérations, annulation automatique optionnelle |
| Périmètre très large (6 espaces) | Élevée | Livraison par phases ; un MVP strict défini au document 6 |
| Coût des SMS (OTP, notifications) | Moyenne | Canal SMS réservé aux événements critiques ; notifications dans l'application et push web d'abord |
| Positions GPS absentes ou fausses | Moyenne | Aucune position n'est inventée. La carte n'affiche que les positions réellement reçues, avec leur horodatage. |

## 1.2 Architecture proposée (ÉTAPE 2)

### Vue d'ensemble

```
 Navigateurs (client, livreur PWA, restaurant, cuisine, opérations, admin)
        │  HTTPS (cookies httpOnly)          │  WebSocket (Socket.IO)
        ▼                                    ▼
 ┌──────────────────┐   API REST   ┌──────────────────────────────────┐
 │ apps/web          │ ───────────► │ apps/api (NestJS)                │
 │ Next.js (SSR/PWA) │              │  modules : auth, catalog, cart,  │
 └──────────────────┘              │  orders, dispatch, finance, ...  │
                                    │  Guards RBAC + contexte tenant   │
                                    └───┬─────────────┬─────────┬──────┘
                                        │             │         │
                              ┌─────────▼──┐  ┌───────▼───┐  ┌──▼────────────────┐
                              │ PostgreSQL │  │ Redis      │  │ Stockage objet S3 │
                              │ + RLS      │  │ files      │  │ (images, docs)    │
                              └────────────┘  │ BullMQ +   │  └───────────────────┘
                                              │ pub/sub WS │
                                              └─────┬──────┘
                                                    │ workers
                          ┌─────────────────────────┼──────────────────────────┐
                          ▼                         ▼                          ▼
                  Notifications             Paiements (webhooks,        Tâches planifiées
             (SMS, WhatsApp, e-mail, push)   rapprochement)          (délais, versements)
```

### Choix techniques et justification

| Besoin | Choix recommandé | Pourquoi | Alternatives écartées |
|---|---|---|---|
| Langage | **TypeScript** partout | Un seul langage pour l'API, le front et les règles métier partagées (calcul de prix, machine à états), avec un typage fort jusqu'aux contrats d'API | Laravel/PHP : très bon et le vivier de développeurs est large au Bénin, mais sans partage de types avec le front. C'est l'alternative la plus sérieuse (voir les décisions à prendre). |
| API | **NestJS** | Architecture modulaire imposée, guards pour les permissions, intercepteurs pour l'audit, WebSocket et files intégrés, documentation OpenAPI générée automatiquement | Express nu : trop peu structuré pour une équipe |
| Front | **Next.js (App Router)** en PWA | Rendu serveur pour le référencement des vitrines `/restaurants/[slug]`, une seule base pour tous les espaces via des groupes de routes, installable sur Android ; déjà maîtrisé dans vos projets | Applications natives : prévues plus tard, la PWA suffit au MVP |
| Base de données | **PostgreSQL 16** | Données fortement relationnelles, transactions ACID indispensables pour la finance, Row Level Security pour l'isolation des restaurants | Base documentaire : peu adaptée au grand livre comptable |
| Accès aux données | **Prisma** + SQL brut pour la RLS et les rapports | Migrations versionnées, typage ; la RLS est activée par migration SQL | — |
| Files et temps réel | **Redis** + **BullMQ** + adaptateur Socket.IO | Notifications sans doublon (identifiant de tâche = clé d'idempotence), délais de réponse, webhooks rejoués, diffusion WebSocket sur plusieurs instances | — |
| Validation | **Zod** (paquet `contracts` partagé) | Mêmes schémas pour les formulaires et l'API | — |
| Fichiers | Stockage compatible S3 (Cloudflare R2 ou MinIO auto-hébergé) | Images redimensionnées côté serveur ; documents des livreurs dans un espace privé avec URL signées | Stockage sur le disque du serveur |
| Cartes | **Leaflet + OpenStreetMap** | Aucun coût de licence ; affichage uniquement des positions réelles | Google Maps : payant, envisageable plus tard |
| Exports | PDF (Playwright/HTML→PDF), Excel (ExcelJS) | Rapports financiers | — |
| Tests | Vitest (règles métier), Supertest (API, isolation, permissions), Playwright (parcours complets, responsive), k6 (charge) | Couvre les 8 scénarios du §24 | — |

### Monnaie
- Tous les montants sont des **entiers en FCFA (XOF)**, sans décimales ni nombres flottants.
- Les arrondis suivent une règle unique et documentée : arrondi au franc le plus proche, la moitié arrondie vers le haut. Le calcul est fait une seule fois, côté serveur.

### Arborescence du dépôt (monorepo pnpm + Turborepo)

```
plateforme/
├─ apps/
│  ├─ api/                 NestJS
│  │  └─ src/modules/      auth, users, restaurants, catalog, zones, cart, orders,
│  │                       kitchen, couriers, dispatch, payments, finance, promotions,
│  │                       reviews, notifications, incidents, support, admin, audit, settings
│  └─ web/                 Next.js
│     └─ app/
│        ├─ (public)/      accueil, recherche, restaurants/[slug]
│        ├─ (client)/      compte, adresses, panier, commande, suivi, historique
│        ├─ restaurant/    tableau de bord du restaurant (tenant)
│        ├─ cuisine/       écran de cuisine (tablette)
│        ├─ livreur/       PWA livreur
│        ├─ operations/    dispatch, carte, incidents
│        └─ admin/         super-administration
├─ packages/
│  ├─ domain/              règles métier pures et testées : prix, promotions, machine à états, finance
│  ├─ contracts/           schémas Zod et types des DTO
│  ├─ db/                  schéma Prisma, migrations, politiques RLS, données de démonstration
│  ├─ ui/                  design system : jetons de couleurs, composants
│  └─ config/              eslint, tsconfig, prettier
├─ infra/                  docker-compose, Caddy (HTTPS), scripts de sauvegarde et restauration
└─ docs/                   conception, API, manuels des salariés
```

Les **données de démonstration** sont marquées `is_demo = true`, affichées avec un bandeau « Démo » et impossibles à charger en production (règle 28.1).

### Temps réel
- Les clients WebSocket rejoignent des « salons » attribués **par le serveur** selon leurs droits : `restaurant:{id}`, `order:{id}`, `courier:{id}`, `ops`, `user:{id}`.
- Chaque événement porte un numéro de séquence. À la reconnexion, le client demande « tout ce qui s'est passé depuis la séquence N » ; si l'écart est trop grand, il recharge l'état via l'API REST.
- L'écran de cuisine et la PWA livreur affichent un indicateur « Hors ligne » et bloquent les actions qui ne peuvent pas être mises en file de façon sûre.

### Sécurité (résumé ; détails au document 2)
- **Mots de passe** : hachés en Argon2id. **Sessions** : stockées en base, cookie httpOnly, Secure, SameSite=Lax, avec rotation à la connexion ; jeton CSRF pour les requêtes qui modifient des données.
- **Limitation de débit** sur la connexion, l'OTP et la création de commande ; verrouillage progressif après plusieurs échecs.
- **Clé d'idempotence** obligatoire sur la création de commande, les paiements, les validations de livraison et les versements.
- **Journal d'audit** (qui, quoi, quand, adresse IP, valeur avant/après) en écriture seule, sur toutes les actions sensibles.
- **Secrets** uniquement dans des variables d'environnement, avec un fichier `.env.example` sans valeur réelle. Aucune clé de paiement côté navigateur.
- **Fichiers téléversés** : contrôle du type réel du fichier, taille maximale, renommage, stockage hors de la racine web, URL signées pour les documents privés.

### Déploiement cible (ÉTAPE 6, préparé dès le début)
- Conteneurs Docker sur un VPS (ou un PaaS) proche de l'Afrique de l'Ouest. PostgreSQL managé ou sauvegardé avec pgBackRest : sauvegarde complète chaque jour, archivage continu des journaux de transactions, **test de restauration mensuel**.
- Caddy pour le HTTPS automatique. Sentry pour les erreurs, journaux structurés JSON, sonde de disponibilité.
- Intégration continue : lint, typage, tests et build à chaque modification. Les migrations de base sont réversibles. Une mise en production se fait par image versionnée ; le retour arrière consiste à redéployer l'image précédente.
