# Marketplace multi-restaurants avec livraison — Cotonou

> Nom commercial à définir (décision D5).

**Statut : phases 5 (finances, Mobile Money FedaPay) et 6 (administration et commercial) livrées — voir le journal dans le plan.** Voir le [tableau de suivi](docs/06-plan-de-realisation.md#63-tableau-de-suivi-des-fonctionnalités).

## Stack
- `apps/api` : NestJS 11, Mongoose 8, **MongoDB Atlas** (replica set), sessions par cookie httpOnly, CSRF, Argon2id, permissions par rôle, journal d'audit.
- `apps/web` : Next.js 15, Tailwind 4. **Espace client conçu uniquement pour mobile**, d'après les maquettes fournies.
- `packages/contracts` : schémas Zod, catalogue des permissions et des rôles, paramètres, partagés entre l'API et le front.
- Images : **Cloudinary** (téléversement direct signé par l'API).
- Décisions : [ADR 0001 — MongoDB et Cloudinary](docs/adr/0001-mongodb-et-cloudinary.md).

## Démarrer en local
Prérequis : Node.js 22 ou plus récent.

1. Installer les dépendances : `npm install`
2. Créer `apps/api/.env` en copiant `.env.example`, puis renseigner `MONGODB_URI` (Atlas) et les clés Cloudinary.
   - Sans Atlas : lancer `npm run dev:db` pour un MongoDB local en replica set.
3. Créer le premier super-administrateur. Le mot de passe est demandé au clavier ou lu dans `SUPERADMIN_PASSWORD` :
   `npm run create-superadmin -- --phone 0197000000 --name "Prénom Nom"`
4. Lancer l'API : `npm run dev:api` (http://localhost:4000/api, documentation sur `/api/docs`).
5. Lancer le front : `npm run dev:web` (http://localhost:3000 ; autre port avec `WEB_PORT=3100 npm run dev:web`).

## Vérifications
- `npm run typecheck` : types de tous les paquets.
- `npm test` : 151 tests (contrats, plus API sur un vrai MongoDB en mémoire ; Atlas n'est jamais touché).
- `npm run build` : build de production.
- La CI (`.github/workflows/ci.yml`) exécute ces étapes avec `npm audit`.

## Écrans
### Client (mobile uniquement, d'après les maquettes fournies)
| URL | Maquette | Données |
|---|---|---|
| `/` | Maquette 1, écran 1 (ouverture) | Photo fournie par le porteur de projet (`public/brand/`) |
| `/accueil` | Maquette 1, écran 2 | API (catégories, restaurants, filtres) |
| `/recherche` | — | API (restaurants, plats, tri, état vide) |
| `/restaurants/[slug]` | Maquette 2 | API (vitrine publiée) |
| `/plats/[id]` | Maquette 1, écran 3 + allergènes | API (variantes, suppléments, prix calculé) |
| `/panier`, `/paiement` | Maquette 3 | API : panier serveur, devis, code promo, espèces ou Mobile Money (FedaPay) |
| `/commandes`, `/commandes/[id]` | Maquette 3 « Order details » | API : suivi en temps réel |
| `/compte/adresses`, `/notifications`, `/aide` | — | API (assistance) |
| `/inscription`, `/connexion`, `/compte`, `/devenir-partenaire` | Style maquette 1 | API |

### Professionnels (ordinateur et mobile)
| URL | Espace |
|---|---|
| `/livreur`, `/livreur/inscription` | Application livreur (mobile) |
| `/operations` | Opérations : dispatch, commandes, carte, incidents |
| `/cuisine/[id]` | Écran cuisine (tablette) |
| `/pro`, `/pro/[id]` | Restaurant : tableau de bord, commandes en direct, promotions, avis, finances (exports), profil et vitrine, horaires et zones, menu et plats, personnel |
| `/admin` | Plateforme : vue d'ensemble, finances, restaurants, livreurs et performance, clients, assistance, avis, commercial (coupons, abonnements, publicités, accueil), zones, catégories, paramètres, personnel, journal d'audit |

### Données de démonstration
`npm run seed:demo -w @plateforme/api -- --owner-phone <numéro d'un compte existant>` crée 4 restaurants **Démo** (mention visible à l'écran) avec leurs photos sur Cloudinary ; `-- --reset` les supprime. Refusé en production. Les photos proviennent des maquettes et doivent être remplacées avant la mise en ligne.

## Paiement Mobile Money (FedaPay)
- Renseigner dans `apps/api/.env` : `FEDAPAY_ENV` (`sandbox` ou `live`), `FEDAPAY_SECRET_KEY` et, obligatoire en production, `FEDAPAY_WEBHOOK_SECRET`. Jamais dans le code.
- Dans le tableau de bord FedaPay, déclarer le webhook `https://<domaine>/api/payments/fedapay/webhook`.
- Sans clé, le Mobile Money n'apparaît pas. Une commande n'est transmise au restaurant qu'après confirmation vérifiée auprès de FedaPay.

## Production
`infra/` contient les Dockerfiles, `docker-compose.yml`, le Caddyfile (HTTPS) et `mongo/init-app-user.js`. Ce dernier crée un utilisateur MongoDB à privilèges minimaux, sans droit de modification sur le journal d'audit.

## Documents de conception
1. [Analyse et architecture](docs/01-analyse-et-architecture.md)
2. [Rôles et permissions](docs/02-roles-et-permissions.md)
3. [Modèle de données](docs/03-modele-de-donnees.md)
4. [Commandes, livraison et statuts](docs/04-commandes-livraison-statuts.md)
5. [Finances et paiements](docs/05-finances-et-paiements.md)
6. [Plan de réalisation et suivi](docs/06-plan-de-realisation.md)

## Principes non négociables (§28)
- Le serveur est la seule source de vérité pour les prix, les totaux, les statuts et les montants.
- Isolation stricte entre restaurants, vérifiée côté serveur et dans la couche d'accès aux données.
- Aucune transaction n'est modifiée ; aucun paiement ni aucune livraison n'est simulé.
- Aucune valeur commerciale n'est écrite dans le code : tous les paramètres sont `null` (non configurés) par défaut.

## Ouvrir la prise de commande (à faire dans /admin)
Aucune valeur commerciale n'est fixée dans le code : tant que ces éléments manquent, la commande est refusée avec un message explicite.
1. **Paramètres** : délai de réponse des restaurants, frais de service (0 accepté) ; pour les livraisons : plafond d'espèces des livreurs, durée des offres, délai d'alerte « prête sans livreur ».
2. **Zones et frais** : zones de livraison et grille des frais (client et livreur).
3. **Restaurants → Commission** : taux contractuel de chaque restaurant.
4. Côté restaurant (`/pro`) : horaires, zones desservies, puis « Commandes acceptées ».
