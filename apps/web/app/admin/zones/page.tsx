'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fcfa, useApi } from '@/lib/use-api';

interface Hood { id: string; name: string; active: boolean }
interface Geo {
  tree: { id: string; name: string; active: boolean; communes: { id: string; name: string; active: boolean; neighborhoods: Hood[] }[] }[];
  zones: { id: string; name: string; active: boolean; neighborhoodIds: string[] }[];
  feeRules: { id: string; fromZoneId: string; toZoneId: string; customerFee: number; courierPay: number; validFrom: string }[];
}

/** Villes, communes, quartiers, zones de livraison et grille de frais (versionnée). Aucune valeur par défaut. */
export default function ZonesAdmin() {
  const geo = useApi<Geo>('/admin/geo');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [zoneForm, setZoneForm] = useState<{ id: string | null; name: string; neighborhoodIds: string[]; active: boolean } | null>(null);
  const [fee, setFee] = useState({ fromZoneId: '', toZoneId: '', customerFee: '', courierPay: '' });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); geo.reload(); setMsg({ tone: 'success', text: ok }); return true; }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); return false; }
  }
  const add = (path: string, q: string, parentId?: string) => {
    const name = window.prompt(q);
    if (name?.trim()) void run(() => api(`/admin/geo/${path}`, { method: 'POST', body: { name: name.trim(), ...(parentId ? { parentId } : {}) } }), 'Ajouté.');
  };
  const toggle = (kind: string, id: string, active: boolean) => run(() => api(`/admin/geo/${kind}/${id}`, { method: 'PATCH', body: { active: !active } }), active ? 'Désactivé.' : 'Activé.');

  if (geo.loading || !geo.data) return <div className="grid place-items-center py-20 text-brand"><Spinner /></div>;
  const { tree, zones, feeRules } = geo.data;
  const hoods = tree.flatMap((c) => c.communes.flatMap((m) => m.neighborhoods.map((n) => ({ ...n, label: `${n.name} (${m.name})` }))));
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? '?';

  return (
    <>
      <PageTitle title="Zones et frais de livraison" />
      <Notice msg={msg} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><p className="font-bold">Géographie</p><button type="button" className="text-sm font-semibold text-brand" onClick={() => add('cities', 'Nom de la ville')}>+ Ville</button></div>
          {tree.length === 0 && <p className="text-sm text-ink-muted">Aucune ville. Commencez par en ajouter une.</p>}
          {tree.map((c) => (
            <div key={c.id} className="mb-4">
              <div className="flex items-center gap-2"><span className="font-semibold">{c.name}</span>
                <button type="button" className="text-xs text-ink-muted" onClick={() => toggle('city', c.id, c.active)}>{c.active ? 'désactiver' : 'activer'}</button>
                <button type="button" className="ml-auto text-sm font-semibold text-brand" onClick={() => add('communes', `Nouvelle commune de ${c.name}`, c.id)}>+ Commune</button></div>
              {c.communes.map((m) => (
                <div key={m.id} className="ml-3 mt-2 rounded-[12px] bg-canvas p-3">
                  <div className="flex items-center gap-2 text-sm"><span className={`font-semibold ${m.active ? '' : 'line-through opacity-50'}`}>{m.name}</span>
                    <button type="button" className="text-xs text-ink-muted" onClick={() => toggle('commune', m.id, m.active)}>{m.active ? 'désactiver' : 'activer'}</button>
                    <button type="button" className="ml-auto font-semibold text-brand" onClick={() => add('neighborhoods', `Nouveau quartier de ${m.name}`, m.id)}>+ Quartier</button></div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.neighborhoods.map((n) => <button key={n.id} type="button" title={n.active ? 'Cliquer pour désactiver' : 'Cliquer pour activer'} onClick={() => toggle('neighborhood', n.id, n.active)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${n.active ? 'border-line bg-surface' : 'border-dashed text-ink-muted line-through'}`}>{n.name}</button>)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><p className="font-bold">Zones de livraison</p>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => setZoneForm({ id: null, name: '', neighborhoodIds: [], active: true })}>+ Zone</button></div>
            {zones.map((z) => (
              <div key={z.id} className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-0">
                <span className={`flex-1 font-semibold ${z.active ? '' : 'opacity-50'}`}>{z.name} <span className="font-normal text-ink-muted">· {z.neighborhoodIds.length} quartier(s)</span></span>
                <button type="button" className="font-semibold text-brand" onClick={() => setZoneForm({ id: z.id, name: z.name, neighborhoodIds: z.neighborhoodIds, active: z.active })}>Modifier</button>
              </div>
            ))}
            {zoneForm && (
              <div className="mt-4 space-y-3 rounded-[12px] bg-canvas p-3">
                <input aria-label="Nom de la zone" placeholder="Nom de la zone" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} className="h-10 w-full rounded-[8px] border border-line px-2" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={zoneForm.active} onChange={(e) => setZoneForm({ ...zoneForm, active: e.target.checked })} /> Zone active</label>
                <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                  {hoods.map((h) => {
                    const on = zoneForm.neighborhoodIds.includes(h.id);
                    return <button key={h.id} type="button" aria-pressed={on} onClick={() => setZoneForm({ ...zoneForm, neighborhoodIds: on ? zoneForm.neighborhoodIds.filter((x) => x !== h.id) : [...zoneForm.neighborhoodIds, h.id] })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-surface'}`}>{h.label}</button>;
                  })}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { const body = { name: zoneForm.name, active: zoneForm.active, neighborhoodIds: zoneForm.neighborhoodIds };
                    if (await run(() => api(zoneForm.id ? `/admin/geo/zones/${zoneForm.id}` : '/admin/geo/zones', { method: zoneForm.id ? 'PUT' : 'POST', body }), 'Zone enregistrée.')) setZoneForm(null); }}>Enregistrer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setZoneForm(null)}>Annuler</Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="font-bold">Grille des frais de livraison</p>
            <p className="mb-3 text-sm text-ink-muted">Une modification crée une nouvelle version ; l’ancienne est conservée et clôturée.</p>
            {feeRules.length === 0 && <p className="text-sm text-ink-muted">Aucun tarif défini : la livraison ne pourra pas être facturée tant qu’une règle n’existe pas.</p>}
            <ul className="mb-4 space-y-1 text-sm">
              {feeRules.map((r) => <li key={r.id} className="flex justify-between rounded-[8px] bg-canvas px-3 py-2"><span>{zoneName(r.fromZoneId)} → {zoneName(r.toZoneId)}</span><span>client {fcfa(r.customerFee)} · livreur {fcfa(r.courierPay)}</span></li>)}
            </ul>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <select aria-label="Zone de départ" value={fee.fromZoneId} onChange={(e) => setFee({ ...fee, fromZoneId: e.target.value })} className="h-10 rounded-[8px] border border-line px-2"><option value="">Départ…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
              <select aria-label="Zone d’arrivée" value={fee.toZoneId} onChange={(e) => setFee({ ...fee, toZoneId: e.target.value })} className="h-10 rounded-[8px] border border-line px-2"><option value="">Arrivée…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
              <input aria-label="Frais client (FCFA)" placeholder="Frais client (FCFA)" type="number" min={0} value={fee.customerFee} onChange={(e) => setFee({ ...fee, customerFee: e.target.value })} className="h-10 rounded-[8px] border border-line px-2" />
              <input aria-label="Rémunération livreur (FCFA)" placeholder="Rémunération livreur (FCFA)" type="number" min={0} value={fee.courierPay} onChange={(e) => setFee({ ...fee, courierPay: e.target.value })} className="h-10 rounded-[8px] border border-line px-2" />
            </div>
            <Button className="mt-3" size="sm" disabled={!fee.fromZoneId || !fee.toZoneId || fee.customerFee === '' || fee.courierPay === ''}
              onClick={async () => { if (await run(() => api('/admin/geo/fee-rules', { method: 'POST', body: { fromZoneId: fee.fromZoneId, toZoneId: fee.toZoneId, customerFee: Math.round(Number(fee.customerFee)), courierPay: Math.round(Number(fee.courierPay)) } }), 'Tarif enregistré (nouvelle version).')) setFee({ fromZoneId: '', toZoneId: '', customerFee: '', courierPay: '' }); }}>Enregistrer le tarif</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
