'use client';
import { useState } from 'react';
import { AD_LABELS, AD_PLACEMENTS, HOME_SECTION_LABELS, HOME_SECTION_TYPES, PublicRestaurantDetail } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { date, inputCls, Table, Tabs, toInputDate, useRunner } from '@/components/console/kit';
import { Button, Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface Resto { _id: string; name: string; slug: string; status: string }
interface Coupon { id: string; code: string; description: string; type: 'PERCENT' | 'FIXED'; value: number; maxDiscount: number | null; minItemsSubtotal: number; startsAt: string; endsAt: string; maxUses: number | null; uses: number; perUserLimit: number; restaurantIds: string[]; active: boolean }
interface Plan { id: string; code: string; name: string; monthlyPrice: number; maxProducts: number | null; features: string[]; active: boolean }
interface Sub { id: string; restaurantId: string; planId: string; startsAt: string; monthlyPrice: number }
interface Ad { id: string; restaurantId: string; restaurantName: string; placement: (typeof AD_PLACEMENTS)[number]; productId: string | null; title: string; startsAt: string; endsAt: string; price: number; paid: boolean; active: boolean }
interface Section { id: string; type: (typeof HOME_SECTION_TYPES)[number]; typeLabel: string; title: string; sort: number; active: boolean; restaurantIds: string[] }

type Tab = 'coupons' | 'plans' | 'ads' | 'home';
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\D/g, '')));
const today = () => toInputDate(new Date());
const inMonth = () => toInputDate(new Date(Date.now() + 30 * 86_400_000));
const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex flex-col gap-1 text-sm">{label}{children}</label>;

/** Outils commerciaux : aucune valeur par défaut n'est inventée, chaque montant est saisi par l'équipe. */
export default function CommercialPage() {
  const { me } = useSession();
  const can = (p: string) => !!me?.platformPermissions.includes(p);
  const items = ([['coupons', 'Codes promo', 'commercial.coupons.manage'], ['plans', 'Abonnements', 'commercial.plans.manage'], ['ads', 'Publicités', 'commercial.ads.manage'], ['home', 'Accueil', 'admin.content.manage']] as const)
    .filter(([, , p]) => can(p)).map(([k, l]) => [k, l] as [Tab, string]);
  const [tab, setTab] = useState<Tab>('coupons');
  const restaurants = useApi<Resto[]>('/admin/restaurants?status=ACTIVE');
  const active = (restaurants.data ?? []).filter((r) => r.status === 'ACTIVE');
  const current = items.find(([k]) => k === tab)?.[0] ?? items[0]?.[0];
  return (
    <>
      <PageTitle title="Commercial">Codes promo financés par la plateforme, abonnements, emplacements sponsorisés et contenu de l’accueil.</PageTitle>
      <Tabs value={current ?? 'coupons'} onChange={setTab} items={items} />
      {current === 'coupons' && <Coupons restaurants={active} />}
      {current === 'plans' && <Plans restaurants={active} />}
      {current === 'ads' && <Ads restaurants={active} />}
      {current === 'home' && <Home restaurants={active} />}
    </>
  );
}

function RestaurantPicker({ restaurants, value, onChange, label }: { restaurants: Resto[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <fieldset className="text-sm">
      <legend className="mb-1">{label}</legend>
      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
        {restaurants.map((r) => {
          const on = value.includes(r._id);
          return <button key={r._id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== r._id) : [...value, r._id])} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{r.name}</button>;
        })}
      </div>
    </fieldset>
  );
}

function Coupons({ restaurants }: { restaurants: Resto[] }) {
  const list = useApi<Coupon[]>('/admin/coupons');
  const { msg, run } = useRunner(list.reload);
  const empty = { id: '', code: '', description: '', type: 'PERCENT' as 'PERCENT' | 'FIXED', value: '', maxDiscount: '', minItemsSubtotal: '0', startsAt: today(), endsAt: inMonth(), maxUses: '', perUserLimit: '1', restaurantIds: [] as string[], active: true };
  const [f, setF] = useState(empty);
  const body = () => ({ code: f.code, description: f.description, type: f.type, value: Number(f.value), maxDiscount: num(f.maxDiscount), minItemsSubtotal: Number(f.minItemsSubtotal || 0), startsAt: f.startsAt, endsAt: `${f.endsAt}T23:59:59+01:00`, maxUses: num(f.maxUses), perUserLimit: Number(f.perUserLimit || 1), restaurantIds: f.restaurantIds, active: f.active });
  const save = () => run(() => api(f.id ? `/admin/coupons/${f.id}` : '/admin/coupons', { method: f.id ? 'PUT' : 'POST', body: body() }), f.id ? 'Code mis à jour.' : 'Code créé.').then((ok) => ok && setF(empty));
  return (
    <div className="space-y-4">
      <Notice msg={msg} />
      <Card className="space-y-3 p-4">
        <p className="font-bold">{f.id ? `Modifier ${f.code}` : 'Nouveau code promo'}</p>
        <p className="text-xs text-ink-muted">La réduction est à la charge de la plateforme : la commission du restaurant reste calculée sur son sous-total.</p>
        <div className="flex flex-wrap gap-3">
          <L label="Code"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className={`${inputCls} w-36 uppercase`} /></L>
          <L label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as 'PERCENT' | 'FIXED' })} className={inputCls}><option value="PERCENT">Pourcentage</option><option value="FIXED">Montant fixe</option></select></L>
          <L label={f.type === 'PERCENT' ? 'Valeur (%)' : 'Valeur (FCFA)'}><input inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-28`} /></L>
          {f.type === 'PERCENT' && <L label="Plafond (FCFA, facultatif)"><input inputMode="numeric" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-32`} /></L>}
          <L label="Minimum d’achat (FCFA)"><input inputMode="numeric" value={f.minItemsSubtotal} onChange={(e) => setF({ ...f, minItemsSubtotal: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-32`} /></L>
          <L label="Utilisations max (facultatif)"><input inputMode="numeric" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-32`} /></L>
          <L label="Par client"><input inputMode="numeric" value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-20`} /></L>
          <L label="Début"><input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} className={inputCls} /></L>
          <L label="Fin"><input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} className={inputCls} /></L>
        </div>
        <L label="Description (facultatif)"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={120} className={inputCls} /></L>
        <RestaurantPicker label="Restaurants concernés (aucun = tous)" restaurants={restaurants} value={f.restaurantIds} onChange={(v) => setF({ ...f, restaurantIds: v })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Actif</label>
        <div className="flex gap-2"><Button size="sm" disabled={f.code.length < 3 || !Number(f.value)} onClick={save}>{f.id ? 'Enregistrer' : 'Créer'}</Button>{f.id && <Button size="sm" variant="ghost" onClick={() => setF(empty)}>Annuler</Button>}</div>
      </Card>
      {!list.data ? <Spinner /> : (
        <Table head={['Code', 'Réduction', 'Validité', 'Utilisations', 'État', '']} empty={list.data.length === 0}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 font-mono font-semibold">{c.code}</td>
              <td className="px-3 py-2">{c.type === 'PERCENT' ? `${c.value} %${c.maxDiscount ? ` (max ${fcfa(c.maxDiscount)})` : ''}` : fcfa(c.value)}{c.minItemsSubtotal ? ` dès ${fcfa(c.minItemsSubtotal)}` : ''}</td>
              <td className="px-3 py-2">{date(c.startsAt)} → {date(c.endsAt)}</td>
              <td className="px-3 py-2 tabular-nums">{c.uses}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
              <td className="px-3 py-2">{c.active ? 'Actif' : 'Inactif'}{c.restaurantIds.length ? ` · ${c.restaurantIds.length} restaurant(s)` : ''}</td>
              <td className="px-3 py-2"><button type="button" className="text-brand" onClick={() => setF({ id: c.id, code: c.code, description: c.description, type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '', minItemsSubtotal: String(c.minItemsSubtotal), startsAt: toInputDate(c.startsAt), endsAt: toInputDate(c.endsAt), maxUses: c.maxUses ? String(c.maxUses) : '', perUserLimit: String(c.perUserLimit), restaurantIds: c.restaurantIds, active: c.active })}>Modifier</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Plans({ restaurants }: { restaurants: Resto[] }) {
  const plans = useApi<Plan[]>('/admin/plans');
  const subs = useApi<Sub[]>('/admin/subscriptions');
  const { msg, run } = useRunner(() => { plans.reload(); subs.reload(); });
  const empty = { id: '', code: '', name: '', monthlyPrice: '', maxProducts: '', features: '', active: true };
  const [f, setF] = useState(empty);
  const [assign, setAssign] = useState({ restaurantId: '', planId: '' });
  const planName = (id: string) => plans.data?.find((p) => p.id === id)?.name ?? '—';
  const save = () => run(() => api(f.id ? `/admin/plans/${f.id}` : '/admin/plans', { method: f.id ? 'PUT' : 'POST', body: { code: f.code, name: f.name, monthlyPrice: Number(f.monthlyPrice), maxProducts: num(f.maxProducts), features: f.features.split('\n').map((x) => x.trim()).filter(Boolean), active: f.active } }), 'Formule enregistrée.').then((ok) => ok && setF(empty));
  return (
    <div className="space-y-4">
      <Notice msg={msg} />
      <Card className="space-y-3 p-4">
        <p className="font-bold">{f.id ? `Modifier ${f.name}` : 'Nouvelle formule'}</p>
        <div className="flex flex-wrap gap-3">
          <L label="Code"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} className={`${inputCls} w-32`} /></L>
          <L label="Nom"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${inputCls} w-40`} /></L>
          <L label="Prix mensuel (FCFA)"><input inputMode="numeric" value={f.monthlyPrice} onChange={(e) => setF({ ...f, monthlyPrice: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-32`} /></L>
          <L label="Plats max (vide = illimité)"><input inputMode="numeric" value={f.maxProducts} onChange={(e) => setF({ ...f, maxProducts: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-32`} /></L>
        </div>
        <L label="Avantages (un par ligne)"><textarea rows={3} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} className="rounded-[10px] border border-line p-2 text-sm" /></L>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Proposée</label>
        <div className="flex gap-2"><Button size="sm" disabled={f.code.length < 2 || f.name.length < 2 || f.monthlyPrice === ''} onClick={save}>{f.id ? 'Enregistrer' : 'Créer'}</Button>{f.id && <Button size="sm" variant="ghost" onClick={() => setF(empty)}>Annuler</Button>}</div>
      </Card>
      {plans.data && (
        <Table head={['Formule', 'Prix mensuel', 'Plats max', 'État', '']} empty={plans.data.length === 0}>
          {plans.data.map((p) => <tr key={p.id}><td className="px-3 py-2">{p.name} <span className="font-mono text-xs text-ink-muted">{p.code}</span></td><td className="px-3 py-2">{fcfa(p.monthlyPrice)}</td><td className="px-3 py-2">{p.maxProducts ?? 'Illimité'}</td><td className="px-3 py-2">{p.active ? 'Proposée' : 'Retirée'}</td>
            <td className="px-3 py-2"><button type="button" className="text-brand" onClick={() => setF({ id: p.id, code: p.code, name: p.name, monthlyPrice: String(p.monthlyPrice), maxProducts: p.maxProducts ? String(p.maxProducts) : '', features: p.features.join('\n'), active: p.active })}>Modifier</button></td></tr>)}
        </Table>
      )}
      <Card className="p-4 text-sm">
        <p className="font-bold">Abonner un restaurant</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select aria-label="Restaurant" value={assign.restaurantId} onChange={(e) => setAssign({ ...assign, restaurantId: e.target.value })} className={inputCls}><option value="">Restaurant…</option>{restaurants.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select>
          <select aria-label="Formule" value={assign.planId} onChange={(e) => setAssign({ ...assign, planId: e.target.value })} className={inputCls}><option value="">Formule…</option>{plans.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <Button size="sm" disabled={!assign.restaurantId || !assign.planId} onClick={() => run(() => api(`/admin/restaurants/${assign.restaurantId}/subscription`, { method: 'POST', body: { planId: assign.planId } }), 'Abonnement enregistré.')}>Abonner</Button>
        </div>
        {subs.data && subs.data.length > 0 && <div className="mt-3 space-y-1">{subs.data.map((s) => <p key={s.id}>{restaurants.find((r) => r._id === s.restaurantId)?.name ?? s.restaurantId} — {planName(s.planId)} ({fcfa(s.monthlyPrice)} / mois) depuis le {date(s.startsAt)}</p>)}</div>}
      </Card>
    </div>
  );
}

function Ads({ restaurants }: { restaurants: Resto[] }) {
  const list = useApi<Ad[]>('/admin/ads');
  const { msg, run } = useRunner(list.reload);
  const empty = { id: '', restaurantId: '', placement: 'TOP_LIST' as Ad['placement'], productId: '', title: '', startsAt: today(), endsAt: inMonth(), price: '', paid: false, active: true };
  const [f, setF] = useState(empty);
  const slug = restaurants.find((r) => r._id === f.restaurantId)?.slug;
  const menu = useApi<PublicRestaurantDetail>(f.placement === 'FEATURED_PRODUCT' && slug ? `/catalog/restaurants/${slug}` : null);
  const save = () => run(() => api(f.id ? `/admin/ads/${f.id}` : '/admin/ads', { method: f.id ? 'PUT' : 'POST', body: { restaurantId: f.restaurantId, placement: f.placement, productId: f.placement === 'FEATURED_PRODUCT' ? f.productId : null, title: f.title, startsAt: f.startsAt, endsAt: `${f.endsAt}T23:59:59+01:00`, price: Number(f.price), paid: f.paid, active: f.active } }), 'Campagne enregistrée.').then((ok) => ok && setF(empty));
  return (
    <div className="space-y-4">
      <Notice msg={msg} />
      <Card className="space-y-3 p-4">
        <p className="font-bold">{f.id ? 'Modifier la campagne' : 'Nouvelle campagne'}</p>
        <p className="text-xs text-ink-muted">L’étiquette « Sponsorisé » est toujours affichée aux clients.</p>
        <div className="flex flex-wrap gap-3">
          <L label="Restaurant"><select value={f.restaurantId} onChange={(e) => setF({ ...f, restaurantId: e.target.value, productId: '' })} className={inputCls}><option value="">Choisir…</option>{restaurants.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></L>
          <L label="Emplacement"><select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as Ad['placement'] })} className={inputCls}>{AD_PLACEMENTS.map((p) => <option key={p} value={p}>{AD_LABELS[p]}</option>)}</select></L>
          {f.placement === 'FEATURED_PRODUCT' && <L label="Plat"><select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} className={inputCls}><option value="">Choisir…</option>{menu.data?.menu.flatMap((c) => c.products).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></L>}
          {f.placement === 'BANNER' && <L label="Titre de la bannière"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} className={inputCls} /></L>}
          <L label="Début"><input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} className={inputCls} /></L>
          <L label="Fin"><input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} className={inputCls} /></L>
          <L label="Prix (FCFA)"><input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-28`} /></L>
        </div>
        <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> Payée</label><label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label></div>
        <div className="flex gap-2"><Button size="sm" disabled={!f.restaurantId || f.price === '' || (f.placement === 'FEATURED_PRODUCT' && !f.productId)} onClick={save}>{f.id ? 'Enregistrer' : 'Créer'}</Button>{f.id && <Button size="sm" variant="ghost" onClick={() => setF(empty)}>Annuler</Button>}</div>
      </Card>
      {list.data && (
        <Table head={['Restaurant', 'Emplacement', 'Période', 'Prix', 'État', '']} empty={list.data.length === 0}>
          {list.data.map((a) => <tr key={a.id}><td className="px-3 py-2">{a.restaurantName}</td><td className="px-3 py-2">{AD_LABELS[a.placement]}{a.title ? ` — ${a.title}` : ''}</td><td className="px-3 py-2">{date(a.startsAt)} → {date(a.endsAt)}</td><td className="px-3 py-2">{fcfa(a.price)} {a.paid ? '· payée' : '· non payée'}</td><td className="px-3 py-2">{a.active ? 'Active' : 'Arrêtée'}</td>
            <td className="px-3 py-2"><button type="button" className="text-brand" onClick={() => setF({ id: a.id, restaurantId: a.restaurantId, placement: a.placement, productId: a.productId ?? '', title: a.title, startsAt: toInputDate(a.startsAt), endsAt: toInputDate(a.endsAt), price: String(a.price), paid: a.paid, active: a.active })}>Modifier</button></td></tr>)}
        </Table>
      )}
    </div>
  );
}

function Home({ restaurants }: { restaurants: Resto[] }) {
  const list = useApi<Section[]>('/admin/home-sections');
  const { msg, run } = useRunner(list.reload);
  const empty = { id: '', type: 'POPULAR_RESTAURANTS' as Section['type'], title: '', sort: '0', active: true, restaurantIds: [] as string[] };
  const [f, setF] = useState(empty);
  const save = () => run(() => api(f.id ? `/admin/home-sections/${f.id}` : '/admin/home-sections', { method: f.id ? 'PUT' : 'POST', body: { type: f.type, title: f.title, sort: Number(f.sort || 0), active: f.active, restaurantIds: f.restaurantIds } }), 'Section enregistrée.').then((ok) => ok && setF(empty));
  return (
    <div className="space-y-4">
      <Notice msg={msg} />
      <p className="text-sm text-ink-muted">Sans section configurée, l’accueil affiche les catégories puis les restaurants. Une section sans contenu réel n’est pas affichée.</p>
      <Card className="space-y-3 p-4">
        <p className="font-bold">{f.id ? 'Modifier la section' : 'Nouvelle section'}</p>
        <div className="flex flex-wrap gap-3">
          <L label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Section['type'], title: f.title || HOME_SECTION_LABELS[e.target.value as Section['type']] })} className={inputCls}>{HOME_SECTION_TYPES.map((t) => <option key={t} value={t}>{HOME_SECTION_LABELS[t]}</option>)}</select></L>
          <L label="Titre affiché"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={60} className={inputCls} /></L>
          <L label="Ordre"><input inputMode="numeric" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-20`} /></L>
        </div>
        {f.type === 'RECOMMENDED_RESTAURANTS' && <RestaurantPicker label="Restaurants recommandés" restaurants={restaurants} value={f.restaurantIds} onChange={(v) => setF({ ...f, restaurantIds: v })} />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible</label>
        <div className="flex gap-2"><Button size="sm" disabled={f.title.trim().length < 2} onClick={save}>{f.id ? 'Enregistrer' : 'Ajouter'}</Button>{f.id && <Button size="sm" variant="ghost" onClick={() => setF(empty)}>Annuler</Button>}</div>
      </Card>
      {list.data && (
        <Table head={['Ordre', 'Section', 'Type', 'État', '']} empty={list.data.length === 0}>
          {list.data.map((s) => <tr key={s.id}><td className="px-3 py-2">{s.sort}</td><td className="px-3 py-2">{s.title}</td><td className="px-3 py-2">{s.typeLabel}</td><td className="px-3 py-2">{s.active ? 'Visible' : 'Masquée'}</td>
            <td className="space-x-3 px-3 py-2"><button type="button" className="text-brand" onClick={() => setF({ id: s.id, type: s.type, title: s.title, sort: String(s.sort), active: s.active, restaurantIds: s.restaurantIds })}>Modifier</button>
              <button type="button" className="text-danger" onClick={() => run(() => api(`/admin/home-sections/${s.id}`, { method: 'DELETE' }), 'Section supprimée.')}>Supprimer</button></td></tr>)}
        </Table>
      )}
    </div>
  );
}
