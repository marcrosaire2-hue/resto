'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { restaurantApplicationSchema, type PublicCuisine } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { Select, TextArea } from '@/components/console/form';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { flattenNeighborhoods, GeoTree } from '@/lib/pro';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

/** Candidature d'un restaurant (compte requis). Le restaurant reste invisible jusqu'à sa validation. */
export default function ApplyPage() {
  const router = useRouter();
  const { me, loading, refresh } = useSession();
  const geo = useApi<GeoTree>('/catalog/zones');
  const cuisines = useApi<PublicCuisine[]>('/catalog/cuisines');
  const [v, setV] = useState({ name: '', phone: '', neighborhoodId: '', address: '', cuisineIds: [] as string[], description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && !me) router.replace('/connexion?suite=/devenir-partenaire'); }, [loading, me, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(restaurantApplicationSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      const res = await api<{ id: string }>('/restaurant-applications', { method: 'POST', body: v });
      await refresh();
      router.replace(`/pro/${res.id}`);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fieldErrors()); setFormError(err.issues.length ? null : err.message); }
    } finally {
      setBusy(false);
    }
  }

  const hoods = flattenNeighborhoods(geo.data);
  return (
    <AuthShell title="Inscrire mon restaurant" subtitle="Votre établissement sera visible après validation par notre équipe." backHref="/pro">
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Nom du restaurant" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} />
        <Field label="Téléphone du restaurant" type="tel" placeholder="01 97 00 00 00" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} error={errors.phone} />
        <Select label="Quartier" value={v.neighborhoodId} onChange={(e) => setV({ ...v, neighborhoodId: e.target.value })} error={errors.neighborhoodId}>
          <option value="">Choisir…</option>
          {hoods.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </Select>
        {geo.data && hoods.length === 0 && <p className="text-sm text-warning">Aucun quartier n’est encore ouvert. Réessayez plus tard.</p>}
        <Field label="Adresse ou repère" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} error={errors.address} />
        <fieldset>
          <legend className="text-sm font-semibold">Type de cuisine (1 à 3)</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisines.data?.map((c) => {
              const on = v.cuisineIds.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setV({ ...v, cuisineIds: on ? v.cuisineIds.filter((x) => x !== c.id) : [...v.cuisineIds, c.id].slice(0, 3) })}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{c.emoji} {c.name}</button>
              );
            })}
          </div>
          {errors.cuisineIds && <p className="mt-1 text-sm text-danger">{errors.cuisineIds}</p>}
        </fieldset>
        <TextArea label="Présentation (facultatif)" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={600} />
        <Button type="submit" block size="lg" loading={busy}>Envoyer ma candidature</Button>
      </form>
    </AuthShell>
  );
}
