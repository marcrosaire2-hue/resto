# 07 — Déploiement sur Vercel

Le projet se déploie en **deux projets Vercel** depuis le même dépôt GitHub :

| Projet Vercel | Dossier racine (Root Directory) | Rôle |
|---|---|---|
| `resto-api` | `apps/api` | API NestJS, exécutée en fonction sans serveur (`api/index.js` → `dist/serverless.js`) |
| `resto-web` | `apps/web` | Site Next.js ; il relaie `/api/*` vers `resto-api` (le cookie de session reste sur le domaine du site) |

Les réglages de build sont dans `apps/api/vercel.json` et `apps/web/vercel.json` : rien à saisir à la main pour l'installation et la construction.

## Différences avec un serveur permanent

- **Tâches de fond** : sans serveur permanent, la minuterie interne de 30 s est remplacée par **Vercel Cron, chaque minute** (`BACKGROUND_JOBS=cron`, automatique sur Vercel) :
  - `/api/internal/cron/orders` : restaurant sans réponse → alerte, puis annulation automatique si le paramètre est configuré ;
  - `/api/internal/cron/ops` : commande prête sans livreur → alerte aux opérations.
  Ces routes exigent `Authorization: Bearer <CRON_SECRET>` (Vercel l'envoie automatiquement quand la variable `CRON_SECRET` existe). Sans `CRON_SECRET`, elles répondent 503 et l'API refuse de démarrer en production.
  **Une exécution par minute nécessite l'offre Vercel Pro** (l'offre Hobby limite les crons à une fois par jour).
- **Temps réel** : pas de Socket.IO sur Vercel. Avec `NEXT_PUBLIC_REALTIME=off`, le site ne tente pas de connexion et recharge les écrans périodiquement (30 à 60 s).
- Le `render.yaml` (Render) reste utilisable tel quel : sur un serveur permanent, rien ne change (`BACKGROUND_JOBS=interval` par défaut hors Vercel).

## 1. Préparer MongoDB Atlas

Atlas → **Network Access** → autoriser `0.0.0.0/0` (les fonctions Vercel n'ont pas d'adresse IP fixe).

## 2. Projet `resto-api`

Vercel → **Add New → Project** → dépôt `marcrosaire2-hue/resto` → **Root Directory : `apps/api`** (laisser « Include files outside the root directory » activé).

Variables d'environnement (Production) :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | URI Atlas (base `resto`) |
| `WEB_ORIGIN` | URL du site, ex. `https://resto-web.vercel.app` |
| `APP_PUBLIC_URL` | même URL que `WEB_ORIGIN` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `1` |
| `CRON_SECRET` | longue chaîne aléatoire (`openssl rand -hex 32`) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | compte Cloudinary |
| `MEDIA_FOLDER_PREFIX` | `plateforme` |
| `FEDAPAY_ENV` | `live` |
| `FEDAPAY_SECRET_KEY`, `FEDAPAY_PUBLIC_KEY` | clés FedaPay live |
| `FEDAPAY_WEBHOOK_SECRET` | voir étape 4 |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Brevo |
| `GOOGLE_CLIENT_ID` | si la connexion Google est utilisée |

Après le déploiement : `https://<resto-api>.vercel.app/api/health` doit répondre `{"status":"ok","mongo":"up",…}`.

## 3. Projet `resto-web`

Nouveau projet depuis le même dépôt → **Root Directory : `apps/web`**.

| Variable | Valeur |
|---|---|
| `API_INTERNAL_URL` | URL du projet API, ex. `https://resto-api.vercel.app` (sans `/api`) |
| `NEXT_PUBLIC_REALTIME` | `off` |

`API_INTERNAL_URL` et `NEXT_PUBLIC_*` sont lues **à la construction** : après les avoir modifiées, relancer un déploiement (Redeploy).

Ensuite, reporter l'URL définitive du site dans `WEB_ORIGIN` et `APP_PUBLIC_URL` du projet API, puis redéployer l'API.

## 4. Webhook FedaPay

Tableau de bord FedaPay → Webhooks → URL `https://<resto-api>.vercel.app/api/payments/fedapay/webhook`.
Copier la clé secrète générée dans `FEDAPAY_WEBHOOK_SECRET` (projet API), puis redéployer.

## 5. Vérifications

1. `/api/health` de l'API répond `ok`.
2. Le site s'ouvre, la connexion admin mène à `/admin`.
3. Vercel → projet API → **Settings → Cron Jobs** : les deux tâches apparaissent et s'exécutent (onglet Logs).
4. Un paiement Mobile Money de faible montant est confirmé automatiquement (webhook).
5. Après quelques connexions depuis des réseaux différents, vérifier qu'aucun utilisateur n'est bloqué par la limite de tentatives de connexion (`THROTTLE_AUTH_LIMIT_PER_MIN`) : l'adresse IP vue par l'API doit être celle du visiteur, pas celle du site.
