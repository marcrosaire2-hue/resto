# ADR 0001 — MongoDB (Atlas) et Cloudinary

- **Date** : 2026-11-11
- **Statut** : accepté (décision du porteur de projet)

## Contexte
La conception initiale recommandait PostgreSQL avec Row Level Security et un stockage S3. Le porteur de projet a retenu **MongoDB** (cluster MongoDB Atlas) pour la base et **Cloudinary** pour les images.

## Conséquences et mesures compensatoires

| Exigence du cahier des charges | Avec PostgreSQL (prévu) | Avec MongoDB (retenu) |
|---|---|---|
| Transactions (commande + écritures financières) | Natives | Transactions multi-documents : **replica set obligatoire** (Atlas en est un ; en local, `npm run dev:db`) |
| Isolation des restaurants « au niveau de la base » | RLS | 1) garde NestJS ; 2) **plugin Mongoose `tenantScopedPlugin`** qui rejette toute requête sans `restaurantId` (exception explicite `crossTenant: true`) ; 3) tests d'isolation sur l'API. MongoDB n'a pas d'équivalent à la RLS : c'est une différence assumée. |
| Historique, audit, grand livre non modifiables | Triggers | 1) **plugin `appendOnlyPlugin`** ; 2) **rôle MongoDB `appRole`** sans `update`/`remove` sur ces collections (`infra/mongo/init-app-user.js`) |
| Contraintes d'intégrité | Clés étrangères, CHECK | Validation Mongoose + index uniques. Les références sont vérifiées dans les services. Les montants sont des entiers validés. |
| Images | S3 + redimensionnement serveur | **Téléversement direct signé** navigateur → Cloudinary. Le secret reste sur le serveur, le dossier est imposé par l'API selon les permissions, les formats autorisés sont signés. Diffusion via `f_auto,q_auto` et largeur bornée. |

## Règles pour les développeurs
- Toute collection appartenant à un restaurant porte `restaurantId` et applique `tenantScopedPlugin`.
- Toute nouvelle collection doit être ajoutée à `infra/mongo/init-app-user.js` (modifiable ou en ajout seul).
- En production, l'API se connecte avec l'utilisateur `plateforme_app` (rôle `appRole`), **jamais** avec un compte administrateur Atlas.
- Le mode développement et les scripts de l'API sont compilés avec `tsc` : NestJS et Mongoose exigent les métadonnées de décorateurs, que `tsx`/esbuild ne génèrent pas.
