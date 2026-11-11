'use client';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ALLERGENS, PRODUCT_TAGS, productSchema } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Select, TextArea } from '@/components/console/form';
import { ImageInput } from '@/components/console/image-input';
import { Button, Card, Field, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useProRestaurant } from '@/lib/pro';
import type { ProMenu, ProProduct } from '@/lib/pro-types';
import { useApi } from '@/lib/use-api';

type VG = { id?: string; name: string; options: { id?: string; name: string; priceDelta: number }[] };
type AG = { id?: string; name: string; min: number; max: number; options: { id?: string; name: string; price: number; available: boolean }[] };
interface Form { menuCategoryId: string; name: string; description: string; basePrice: number; prepMinutes: number | null; allergens: string[]; tags: string[]; images: { publicId: string; url: string }[]; variantGroups: VG[]; addonGroups: AG[] }

const EMPTY: Form = { menuCategoryId: '', name: '', description: '', basePrice: 0, prepMinutes: null, allergens: [], tags: [], images: [], variantGroups: [], addonGroups: [] };
const fromProduct = (p: ProProduct): Form => ({
  menuCategoryId: p.menuCategoryId, name: p.name, description: p.description, basePrice: p.basePrice, prepMinutes: p.prepMinutes,
  allergens: p.allergens, tags: p.tags, images: p.images.map((publicId, i) => ({ publicId, url: p.imageUrls[i] ?? '' })),
  variantGroups: p.variantGroups, addonGroups: p.addonGroups,
});
const num = (v: string) => (v === '' ? 0 : Math.round(Number(v)));

/** Création / modification d'un plat : photos, prix, variantes, suppléments, allergènes. */
export default function ProductEditor() {
  const { rid, can } = useProRestaurant();
  const { pid } = useParams<{ pid: string }>();
  const router = useRouter();
  const isNew = pid === 'nouveau';
  const menu = useApi<ProMenu>(`/restaurants/${rid}/menu`);
  const [v, setV] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!menu.data || v) return;
    if (isNew) setV({ ...EMPTY, menuCategoryId: menu.data.categories[0]?.id ?? '' });
    else {
      const p = menu.data.products.find((x) => x.id === pid);
      if (p) setV(fromProduct(p));
    }
  }, [menu.data, v, isNew, pid]);

  if (menu.loading) return <div className="grid place-items-center py-20 text-brand"><Spinner /></div>;
  if (!v) return <p className="text-sm text-ink-muted">Plat introuvable.</p>;
  const set = <K extends keyof Form>(k: K, val: Form[K]) => setV({ ...v, [k]: val });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...v!, images: v!.images.map((i) => i.publicId) };
    const r = validate(productSchema, body);
    if (!r.ok) { setErrors(r.errors); setMsg({ tone: 'danger', text: 'Vérifiez les champs signalés.' }); return; }
    setErrors({});
    setBusy(true);
    try {
      if (isNew) {
        await api(`/restaurants/${rid}/menu/products`, { method: 'POST', body });
        router.push(`/pro/${rid}/menu`);
      } else {
        await api(`/restaurants/${rid}/menu/products/${pid}`, { method: 'PUT', body });
        setMsg({ tone: 'success', text: 'Plat enregistré. S’il est publié, la vitrine est déjà à jour.' });
      }
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fieldErrors()); setMsg({ tone: 'danger', text: err.message }); }
    } finally {
      setBusy(false);
    }
  }

  const toggle = (k: 'allergens' | 'tags', x: string) => set(k, v[k].includes(x) ? v[k].filter((y) => y !== x) : [...v[k], x]);
  return (
    <>
      <PageTitle title={isNew ? 'Nouveau plat' : 'Modifier le plat'}>{isNew ? 'Le plat est créé en brouillon : publiez-le depuis le menu.' : undefined}</PageTitle>
      <Notice msg={msg} />
      <form onSubmit={submit} noValidate className="space-y-5">
        <fieldset disabled={!can('menu.edit')} className="space-y-5">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Nom du plat" value={v.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
            <TextArea className="sm:col-span-2" label="Description" maxLength={500} value={v.description} onChange={(e) => set('description', e.target.value)} />
            <Field label="Prix (FCFA)" type="number" inputMode="numeric" min={0} step={1} value={String(v.basePrice)} onChange={(e) => set('basePrice', num(e.target.value))} error={errors.basePrice} />
            <Select label="Catégorie" value={v.menuCategoryId} onChange={(e) => set('menuCategoryId', e.target.value)} error={errors.menuCategoryId}>
              {menu.data!.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Field label="Préparation (min, facultatif)" type="number" inputMode="numeric" value={v.prepMinutes == null ? '' : String(v.prepMinutes)} onChange={(e) => set('prepMinutes', e.target.value === '' ? null : num(e.target.value))} />
          </Card>

          <Card className="p-5">
            <p className="mb-3 font-bold">Photos (5 maximum)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {v.images.map((img, i) => (
                <ImageInput key={img.publicId} label={`Photo ${i + 1}`} purpose="product_image" restaurantId={rid} url={img.url}
                  onChange={(n) => set('images', n ? v.images.map((x, j) => (j === i ? n : x)) : v.images.filter((_, j) => j !== i))} />
              ))}
              {v.images.length < 5 && <ImageInput label="Ajouter une photo" purpose="product_image" restaurantId={rid} url={null} onChange={(n) => n && set('images', [...v.images, n])} />}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><p className="font-bold">Variantes (ex. Taille)</p>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => set('variantGroups', [...v.variantGroups, { name: 'Taille', options: [{ name: 'Normale', priceDelta: 0 }, { name: 'Grande', priceDelta: 0 }] }])}>+ Variante</button></div>
            {v.variantGroups.length === 0 && <p className="text-sm text-ink-muted">Aucune variante : le client commande le plat tel quel.</p>}
            {v.variantGroups.map((g, gi) => (
              <div key={gi} className="mb-3 rounded-[12px] bg-canvas p-3">
                <div className="flex gap-2"><input aria-label="Nom de la variante" value={g.name} onChange={(e) => set('variantGroups', v.variantGroups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))} className="h-10 flex-1 rounded-[8px] border border-line px-2 font-semibold" />
                  <button type="button" className="text-sm text-danger" onClick={() => set('variantGroups', v.variantGroups.filter((_, j) => j !== gi))}>Retirer</button></div>
                {g.options.map((o, oi) => (
                  <div key={oi} className="mt-2 flex items-center gap-2 text-sm">
                    <input aria-label="Option" value={o.name} onChange={(e) => set('variantGroups', v.variantGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, name: e.target.value } : y)) } : x)))} className="h-10 flex-1 rounded-[8px] border border-line px-2" />
                    <input aria-label="Supplément de prix" type="number" value={o.priceDelta} onChange={(e) => set('variantGroups', v.variantGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, priceDelta: num(e.target.value) } : y)) } : x)))} className="h-10 w-28 rounded-[8px] border border-line px-2" />
                    <span className="text-ink-muted">FCFA</span>
                    <button type="button" aria-label="Retirer l’option" disabled={g.options.length <= 2} className="text-danger disabled:opacity-30" onClick={() => set('variantGroups', v.variantGroups.map((x, j) => (j === gi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x)))}>✕</button>
                  </div>
                ))}
                <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => set('variantGroups', v.variantGroups.map((x, j) => (j === gi ? { ...x, options: [...x.options, { name: '', priceDelta: 0 }] } : x)))}>+ Option</button>
              </div>
            ))}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><p className="font-bold">Suppléments</p>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => set('addonGroups', [...v.addonGroups, { name: 'Suppléments', min: 0, max: 1, options: [{ name: '', price: 0, available: true }] }])}>+ Groupe</button></div>
            {v.addonGroups.length === 0 && <p className="text-sm text-ink-muted">Aucun supplément.</p>}
            {v.addonGroups.map((g, gi) => (
              <div key={gi} className="mb-3 rounded-[12px] bg-canvas p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <input aria-label="Nom du groupe" value={g.name} onChange={(e) => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))} className="h-10 flex-1 rounded-[8px] border border-line px-2 font-semibold" />
                  <label>min <input type="number" min={0} value={g.min} onChange={(e) => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, min: num(e.target.value) } : x)))} className="h-10 w-16 rounded-[8px] border border-line px-2" /></label>
                  <label>max <input type="number" min={1} value={g.max} onChange={(e) => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, max: num(e.target.value) } : x)))} className="h-10 w-16 rounded-[8px] border border-line px-2" /></label>
                  <button type="button" className="text-danger" onClick={() => set('addonGroups', v.addonGroups.filter((_, j) => j !== gi))}>Retirer</button>
                </div>
                {g.options.map((o, oi) => (
                  <div key={oi} className="mt-2 flex items-center gap-2 text-sm">
                    <input aria-label="Supplément" value={o.name} onChange={(e) => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, name: e.target.value } : y)) } : x)))} className="h-10 flex-1 rounded-[8px] border border-line px-2" />
                    <input aria-label="Prix" type="number" min={0} value={o.price} onChange={(e) => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, price: num(e.target.value) } : y)) } : x)))} className="h-10 w-24 rounded-[8px] border border-line px-2" />
                    <label className="flex items-center gap-1"><input type="checkbox" checked={o.available} onChange={(e) => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, available: e.target.checked } : y)) } : x)))} /> dispo</label>
                    <button type="button" aria-label="Retirer" disabled={g.options.length <= 1} className="text-danger disabled:opacity-30" onClick={() => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x)))}>✕</button>
                  </div>
                ))}
                <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => set('addonGroups', v.addonGroups.map((x, j) => (j === gi ? { ...x, options: [...x.options, { name: '', price: 0, available: true }] } : x)))}>+ Supplément</button>
              </div>
            ))}
            {Object.entries(errors).filter(([k]) => k.startsWith('addonGroups') || k.startsWith('variantGroups')).slice(0, 3).map(([k, m]) => <p key={k} className="text-sm text-danger">{m}</p>)}
          </Card>

          <Card className="grid gap-5 p-5 sm:grid-cols-2">
            <div><p className="mb-2 font-bold">Allergènes</p><div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => <button key={a} type="button" aria-pressed={v.allergens.includes(a)} onClick={() => toggle('allergens', a)} className={`rounded-full border px-3 py-1 text-sm ${v.allergens.includes(a) ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{a}</button>)}
            </div></div>
            <div><p className="mb-2 font-bold">Étiquettes (3 max)</p><div className="flex flex-wrap gap-2">
              {PRODUCT_TAGS.map((a) => <button key={a} type="button" aria-pressed={v.tags.includes(a)} onClick={() => toggle('tags', a)} className={`rounded-full border px-3 py-1 text-sm ${v.tags.includes(a) ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{a}</button>)}
            </div>{errors.tags && <p className="mt-1 text-sm text-danger">{errors.tags}</p>}</div>
          </Card>
        </fieldset>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={() => router.push(`/pro/${rid}/menu`)}>Retour au menu</Button>
          {can('menu.edit') && <Button type="submit" loading={busy}>{isNew ? 'Créer le plat' : 'Enregistrer'}</Button>}
        </div>
      </form>
    </>
  );
}
