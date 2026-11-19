// Fonction Vercel : délègue toutes les requêtes à l'application NestJS compilée (npm run build → dist/).
// Le code est compilé par tsc (et non par Vercel) car NestJS a besoin des métadonnées de décorateurs.
module.exports = require('../dist/serverless.js').default;
