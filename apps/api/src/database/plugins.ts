import type { Aggregate, Query, Schema } from 'mongoose';

const QUERY_OPS = [
  'find', 'findOne', 'countDocuments', 'updateOne', 'updateMany', 'findOneAndUpdate',
  'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne', 'distinct',
] as const;

/**
 * Isolation multi-restaurants au niveau de l'accès aux données.
 * Toute requête sur une collection « tenant » DOIT filtrer sur restaurantId.
 * Une requête transversale légitime (ex. « mes restaurants » d'un utilisateur, rapports plateforme)
 * doit le déclarer explicitement avec `.setOptions({ crossTenant: true })`, ce qui la rend visible en revue de code.
 */
export function tenantScopedPlugin(schema: Schema) {
  for (const op of QUERY_OPS) {
    schema.pre(op, async function (this: Query<unknown, unknown>) {
      if ((this.getOptions() as { crossTenant?: boolean }).crossTenant === true) return;
      const filter = this.getFilter() as Record<string, unknown>;
      if (filter?.restaurantId == null) {
        throw new Error(`TENANT_FILTER_MISSING: ${op} sur ${this.model.collection.collectionName} sans restaurantId`);
      }
    });
  }
  schema.pre('aggregate', async function (this: Aggregate<unknown>) {
    if ((this.options as { crossTenant?: boolean }).crossTenant === true) return;
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (first?.$match?.restaurantId == null) {
      throw new Error('TENANT_FILTER_MISSING: aggregate sans $match restaurantId en première étape');
    }
  });
}

const MUTATING_OPS = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
] as const;

/**
 * Collection en ajout seul (audit, historique de statuts, grand livre).
 * Doublé au niveau MongoDB par un rôle sans droit update/remove (infra/mongo/init-app-user.js).
 */
export function appendOnlyPlugin(schema: Schema) {
  for (const op of MUTATING_OPS) {
    schema.pre(op, async function () {
      throw new Error(`APPEND_ONLY: ${op} interdit sur cette collection`);
    });
  }
  schema.pre('save', async function () {
    if (!this.isNew) throw new Error('APPEND_ONLY: modification interdite sur cette collection');
  });
}
