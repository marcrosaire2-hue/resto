'use client';
import { useState } from 'react';
import { promotionSchema } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Select } from '@/components/console/form';
import { Button, Card, Field, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useProRestaurant } from '@/lib/pro';
import type { ProMenu } from '@/lib/pro-types';
import { fcfa, useApi } from '@/lib/use-api';

interface Promo { id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number; productIds: string[]; startsAt: string; endsAt: string; minItemsSubtotal: number; active: boolean }
const local = (iso: string) => new Date(new Date(iso).getTime() + 60 * 60_000).toISOString().slice(0, 16); // heure du Bénin
const toIso = (v: string) => new Date(`${v}:00+01:00`).toISOString();
const today = () => local(new Date().toISOString());
const empty = () => ({ id: null as string | null, name: '', type: 'PERCENT' as 'PERCENT' | 'FIXED', value: 10, productIds: [] as string[], startsAt: today(), endsAt: local(new Date(Date.now() + 7 * 86_400_000).toISOString()), minItemsSubtotal: 0, active: true });

/** Promotions : pourcentage ou montant fixe, période, plats concernés, minimum de commande. Calculées par le serveur. */
export default function PromotionsPage() {
  const { rid } = useProRestaurant();
  const list = useApi<Promo[]>(`/restaurants/${rid}/promotions`);
  const menu = useApi<ProMenu>(`/restaurants/${rid}/menu`);
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(f: ReturnType<typeof empty>) {
    const body = { name: f.name, type: f.type, value: Math.round(Number(f.value)), productIds: f.productIds, startsAt: toIso(f.startsAt), endsAt: toIso(f.endsAt), minItemsSubtotal: Math.round(Number(f.minItemsSubtotal)) || 0, active: f.active };
    const r = validate(promotionSchema, body);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      await api(f.id ? `/restaurants/${rid}/promotions/${f.id}` : `/restaurants/${rid}/promotions`, { method: f.id ? 'PUT' : 'POST', body });
      setForm(null); list.reload(); setMsg({ tone: 'success', text: 'Promotion enregistrée. Elle s’applique automatiquement pendant sa période.' });
    } catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { setBusy(false); }
  }
  const status = (p: Promo) => !p.active ? 'Désactivée' : new Date(p.endsAt) < new Date() ? 'Terminée' : new Date(p.startsAt) > new Date() ? 'Programmée' : 'En cours';
  const products = menu.data?.products.filter((p) => p.status !== 'ARCHIVED') ?? [];

  return (
    <>
      <PageTitle title="Promotions" actions={!form ? <Button size="sm" onClick={() => setForm(empty())}>+ Nouvelle promotion</Button> : undefined}>
        Une seule promotion s’applique par article (la plus avantageuse pour le client). La réduction est à la charge du restaurant.
      </PageTitle>
      <Notice msg={msg} />
      {form && (
        <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nom affiché au client" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENT' | 'FIXED' })}>
              <option value="PERCENT">Pourcentage</option><option value="FIXED">Montant fixe</option>
            </Select>
            <Field label={form.type === 'PERCENT' ? 'Réduction (%)' : 'Réduction (FCFA)'} type="number" min={1} value={String(form.value)} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} error={errors.value} />
          </div>
          <Field label="Début" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <Field label="Fin" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} error={errors.endsAt} />
          <Field label="Minimum de commande (FCFA, 0 = aucun)" type="number" min={0} value={String(form.minItemsSubtotal)} onChange={(e) => setForm({ ...form, minItemsSubtotal: Number(e.target.value) })} />
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold">Plats concernés <span className="font-normal text-ink-muted">(aucun sélectionné = toute la carte)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {products.map((p) => {
                const on = form.productIds.includes(p.id);
                return <button key={p.id} type="button" aria-pressed={on} onClick={() => setForm({ ...form, productIds: on ? form.productIds.filter((x) => x !== p.id) : [...form.productIds, p.id] })}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{p.name}</button>;
              })}
            </div>
          </fieldset>
          <div className="flex gap-2 sm:col-span-2"><Button loading={busy} onClick={() => save(form)}>Enregistrer</Button><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button></div>
        </Card>
      )}
      {list.loading ? <div className="grid place-items-center py-10 text-brand"><Spinner /></div> : list.data?.length === 0 ? <p className="text-sm text-ink-muted">Aucune promotion.</p> : (
        <Card className="divide-y divide-line">
          {list.data?.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name} <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand">{p.type === 'PERCENT' ? `−${p.value} %` : `−${fcfa(p.value)}`}</span></p>
                <p className="text-xs text-ink-muted">{new Date(p.startsAt).toLocaleString('fr-FR')} → {new Date(p.endsAt).toLocaleString('fr-FR')} · {p.productIds.length ? `${p.productIds.length} plat(s)` : 'toute la carte'}{p.minItemsSubtotal ? ` · dès ${fcfa(p.minItemsSubtotal)}` : ''}</p>
              </div>
              <span className="text-xs font-semibold">{status(p)}</span>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => setForm({ id: p.id, name: p.name, type: p.type, value: p.value, productIds: p.productIds, startsAt: local(p.startsAt), endsAt: local(p.endsAt), minItemsSubtotal: p.minItemsSubtotal, active: p.active })}>Modifier</button>
              <button type="button" className="text-sm font-semibold text-ink-muted" onClick={() => save({ id: p.id, name: p.name, type: p.type, value: p.value, productIds: p.productIds, startsAt: local(p.startsAt), endsAt: local(p.endsAt), minItemsSubtotal: p.minItemsSubtotal, active: !p.active })}>{p.active ? 'Désactiver' : 'Activer'}</button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
