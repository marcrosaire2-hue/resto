'use client';
import { useEffect, useState } from 'react';
import { hoursSchema, WEEKDAYS_FR, type OpeningSlot } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import type { ProProfile } from '@/lib/pro-types';
import { useApi } from '@/lib/use-api';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Horaires hebdomadaires, fermetures exceptionnelles et zones desservies. */
export default function HoursPage() {
  const { rid, can } = useProRestaurant();
  const profile = useApi<ProProfile>(`/restaurants/${rid}/profile`);
  const zones = useApi<{ id: string; name: string }[]>('/catalog/delivery-zones');
  const [slots, setSlots] = useState<OpeningSlot[] | null>(null);
  const [closures, setClosures] = useState<{ from: string; to: string; reason: string }[]>([]);
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data && !slots) {
      setSlots(profile.data.openingHours);
      setClosures(profile.data.closures.map((c) => ({ from: c.from.slice(0, 10), to: c.to.slice(0, 10), reason: c.reason ?? '' })));
      setZoneIds(profile.data.zoneIds);
    }
  }, [profile.data, slots]);
  if (!slots) return <div className="grid place-items-center py-20 text-brand"><Spinner /></div>;

  async function saveHours() {
    const body = {
      openingHours: slots,
      closures: closures.map((c) => ({ from: `${c.from}T00:00:00+01:00`, to: `${c.to}T23:59:59+01:00`, reason: c.reason || undefined })),
    };
    const r = hoursSchema.safeParse(body);
    if (!r.success) return setMsg({ tone: 'danger', text: r.error.issues[0].message });
    setBusy('hours');
    try {
      await api(`/restaurants/${rid}/hours`, { method: 'PUT', body });
      setMsg({ tone: 'success', text: 'Horaires enregistrés.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' });
    } finally {
      setBusy(null);
    }
  }
  async function saveZones() {
    setBusy('zones');
    try {
      await api(`/restaurants/${rid}/zones`, { method: 'PUT', body: { zoneIds } });
      setMsg({ tone: 'success', text: 'Zones desservies enregistrées.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' });
    } finally {
      setBusy(null);
    }
  }
  const update = (i: number, patch: Partial<OpeningSlot>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <>
      <PageTitle title="Horaires et zones">Heure du Bénin. Un créneau qui se termine après minuit (ex. 18:00 → 02:00) est accepté.</PageTitle>
      <Notice msg={msg} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 font-bold">Horaires d’ouverture</p>
          <ul className="space-y-3">
            {ORDER.map((d) => {
              const daySlots = slots.map((s, i) => ({ s, i })).filter((x) => x.s.weekday === d);
              return (
                <li key={d} className="rounded-[12px] bg-canvas p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{WEEKDAYS_FR[d]}</span>
                    {can('restaurant.hours.edit') && <button type="button" className="text-sm font-semibold text-brand" onClick={() => setSlots([...slots, { weekday: d, opens: '11:00', closes: '22:00' }])}>+ Créneau</button>}
                  </div>
                  {daySlots.length === 0 && <p className="text-sm text-ink-muted">Fermé</p>}
                  {daySlots.map(({ s, i }) => (
                    <div key={i} className="mt-2 flex items-center gap-2 text-sm">
                      <input type="time" aria-label="Ouverture" value={s.opens} onChange={(e) => update(i, { opens: e.target.value })} className="h-10 rounded-[8px] border border-line px-2" />
                      <span>→</span>
                      <input type="time" aria-label="Fermeture" value={s.closes} onChange={(e) => update(i, { closes: e.target.value })} className="h-10 rounded-[8px] border border-line px-2" />
                      <button type="button" aria-label="Supprimer le créneau" className="ml-auto text-danger" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
          <p className="mb-2 mt-5 font-bold">Fermetures exceptionnelles</p>
          {closures.map((c, i) => (
            <div key={i} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <input type="date" aria-label="Du" value={c.from} onChange={(e) => setClosures(closures.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className="h-10 rounded-[8px] border border-line px-2" />
              <input type="date" aria-label="Au" value={c.to} onChange={(e) => setClosures(closures.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className="h-10 rounded-[8px] border border-line px-2" />
              <input placeholder="Motif" value={c.reason} onChange={(e) => setClosures(closures.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} className="h-10 flex-1 rounded-[8px] border border-line px-2" />
              <button type="button" aria-label="Supprimer" className="text-danger" onClick={() => setClosures(closures.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => { const d = new Date().toISOString().slice(0, 10); setClosures([...closures, { from: d, to: d, reason: '' }]); }}>+ Ajouter une fermeture</button>
          {can('restaurant.hours.edit') && <Button className="mt-5" onClick={saveHours} loading={busy === 'hours'}>Enregistrer les horaires</Button>}
        </Card>
        <Card className="p-5">
          <p className="mb-1 font-bold">Zones desservies</p>
          <p className="mb-3 text-sm text-ink-muted">Les zones et les frais de livraison sont définis par la plateforme.</p>
          {zones.data?.length === 0 && <p className="text-sm text-ink-muted">Aucune zone n’est encore ouverte.</p>}
          <ul className="space-y-2">
            {zones.data?.map((z) => (
              <li key={z.id}>
                <label className="flex items-center gap-3 rounded-[12px] bg-canvas p-3 text-sm font-semibold">
                  <input type="checkbox" className="size-5 accent-[var(--color-brand)]" disabled={!can('restaurant.zones.edit')} checked={zoneIds.includes(z.id)}
                    onChange={(e) => setZoneIds(e.target.checked ? [...zoneIds, z.id] : zoneIds.filter((x) => x !== z.id))} />
                  {z.name}
                </label>
              </li>
            ))}
          </ul>
          {can('restaurant.zones.edit') && <Button className="mt-5" variant="secondary" onClick={saveZones} loading={busy === 'zones'}>Enregistrer les zones</Button>}
        </Card>
      </div>
    </>
  );
}
