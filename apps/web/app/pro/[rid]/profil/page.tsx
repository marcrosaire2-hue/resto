'use client';
import { FormEvent, useEffect, useState } from 'react';
import { restaurantProfileSchema, type PublicCuisine } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Select, StatusPill, TextArea } from '@/components/console/form';
import { ImageInput } from '@/components/console/image-input';
import { Button, Card, Field, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { flattenNeighborhoods, GeoTree, useProRestaurant } from '@/lib/pro';
import type { ProfileFields, ProProfile } from '@/lib/pro-types';
import { useApi } from '@/lib/use-api';

type Form = Omit<ProfileFields, 'phone' | 'whatsapp' | 'email' | 'address' | 'neighborhoodId'> & { phone: string; whatsapp: string; email: string; address: string; neighborhoodId: string };
const toForm = (p: ProfileFields): Form => ({ ...p, phone: p.phone ?? '', whatsapp: p.whatsapp ?? '', email: p.email ?? '', address: p.address ?? '', neighborhoodId: p.neighborhoodId ?? '' });

/** Profil de l'établissement : brouillon → aperçu → publication. */
export default function ProfilePage() {
  const { rid, can } = useProRestaurant();
  const editable = can('restaurant.profile.edit');
  const profile = useApi<ProProfile>(`/restaurants/${rid}/profile`);
  const geo = useApi<GeoTree>('/catalog/zones');
  const cuisines = useApi<PublicCuisine[]>('/catalog/cuisines');
  const [v, setV] = useState<Form | null>(null);
  const [urls, setUrls] = useState<{ logo: string | null; cover: string | null }>({ logo: null, cover: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);

  useEffect(() => {
    if (profile.data && !v) {
      setV(toForm(profile.data.draft ?? profile.data.live));
      setUrls({ logo: profile.data.preview.logoUrl, cover: profile.data.preview.coverUrl });
    }
  }, [profile.data, v]);

  if (profile.loading || !v || !profile.data) return <div className="grid place-items-center py-20 text-brand"><Spinner /></div>;
  const p = profile.data;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const body = { ...v!, avgPrepMinutes: Number(v!.avgPrepMinutes) };
    const r = validate(restaurantProfileSchema, body);
    if (!r.ok) { setErrors(r.errors); return false; }
    setErrors({});
    setBusy('save');
    try {
      await api(`/restaurants/${rid}/profile/draft`, { method: 'PUT', body });
      profile.reload();
      setMsg({ tone: 'info', text: 'Brouillon enregistré. Vérifiez l’aperçu puis publiez pour mettre à jour votre vitrine.' });
      return true;
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fieldErrors()); setMsg({ tone: 'danger', text: err.message }); }
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!(await save())) return;
    setBusy('publish');
    try {
      await api(`/restaurants/${rid}/profile/publish`, { method: 'POST' });
      profile.reload();
      setMsg({ tone: 'success', text: p.status === 'ACTIVE' ? 'Vitrine publiée : les visiteurs voient vos modifications.' : 'Profil prêt. Il sera visible dès la validation de votre restaurant.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Erreur.' });
    } finally {
      setBusy(null);
    }
  }

  const set = <K extends keyof Form>(k: K, val: Form[K]) => setV({ ...v!, [k]: val });
  return (
    <>
      <PageTitle title="Profil et vitrine" actions={<StatusPill status={p.status} />}>
        {p.hasDraft ? 'Des modifications non publiées sont en cours.' : p.publishedAt ? 'Votre vitrine est à jour.' : 'Votre vitrine n’a jamais été publiée.'}
      </PageTitle>
      <Notice msg={msg} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
            <fieldset disabled={!editable} className="contents">
              <Field className="sm:col-span-2" label="Nom" value={v.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
              <TextArea className="sm:col-span-2" label="Description" value={v.description} maxLength={600} onChange={(e) => set('description', e.target.value)} error={errors.description} />
              <Field label="Téléphone" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
              <Field label="WhatsApp (facultatif)" type="tel" value={v.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} error={errors.whatsapp} />
              <Field label="E-mail (facultatif)" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
              <Field label="Temps de préparation moyen (min)" type="number" inputMode="numeric" value={String(v.avgPrepMinutes)} onChange={(e) => set('avgPrepMinutes', Number(e.target.value))} error={errors.avgPrepMinutes} />
              <Select label="Quartier" value={v.neighborhoodId} onChange={(e) => set('neighborhoodId', e.target.value)} error={errors.neighborhoodId}>
                <option value="">Choisir…</option>
                {flattenNeighborhoods(geo.data).map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </Select>
              <Field label="Adresse ou repère" value={v.address} onChange={(e) => set('address', e.target.value)} error={errors.address} />
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-semibold">Types de cuisine (1 à 3)</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cuisines.data?.map((c) => {
                    const on = v.cuisineIds.includes(c.id);
                    return <button key={c.id} type="button" aria-pressed={on} onClick={() => set('cuisineIds', on ? v.cuisineIds.filter((x) => x !== c.id) : [...v.cuisineIds, c.id].slice(0, 3))}
                      className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{c.emoji} {c.name}</button>;
                  })}
                </div>
                {errors.cuisineIds && <p className="mt-1 text-sm text-danger">{errors.cuisineIds}</p>}
              </fieldset>
              <ImageInput label="Logo" purpose="restaurant_logo" restaurantId={rid} aspect="aspect-square" url={urls.logo}
                onChange={(img) => { set('logoPublicId', img?.publicId ?? null); setUrls({ ...urls, logo: img?.url ?? null }); }} />
              <ImageInput label="Photo de couverture" purpose="restaurant_cover" restaurantId={rid} url={urls.cover}
                onChange={(img) => { set('coverPublicId', img?.publicId ?? null); setUrls({ ...urls, cover: img?.url ?? null }); }} />
            </fieldset>
            {editable && (
              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <Button type="submit" variant="secondary" loading={busy === 'save'}>Enregistrer le brouillon</Button>
                <Button type="button" onClick={publish} loading={busy === 'publish'}>Publier</Button>
              </div>
            )}
          </form>
        </Card>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-muted">Aperçu mobile</p>
          <div className="overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-card)]">
            {urls.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls.cover} alt="" className="h-32 w-full object-cover" />
            ) : <div className="h-32 bg-peach" />}
            <div className="flex items-center gap-3 p-4">
              {urls.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls.logo} alt="" className="size-12 rounded-full object-cover" />
              )}
              <div className="min-w-0"><p className="truncate text-lg font-bold">{v.name || 'Nom du restaurant'}</p><p className="text-xs text-ink-muted">~{v.avgPrepMinutes} min</p></div>
            </div>
            <p className="px-4 pb-4 text-sm text-ink-muted">{v.description || 'Description de votre établissement.'}</p>
          </div>
        </div>
      </div>
    </>
  );
}
