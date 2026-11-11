'use client';
import { FormEvent, useState } from 'react';
import { addressSchema } from '@plateforme/contracts';
import { Select, TextArea } from '@/components/console/form';
import { Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { flattenNeighborhoods, GeoTree } from '@/lib/pro';
import { useApi } from '@/lib/use-api';

export interface SavedAddress { id: string; label: string; neighborhoodId: string; streetLandmark: string; instructions: string; isDefault: boolean; neighborhood: string | null; commune: string | null }

/** Formulaire d'adresse : quartier (liste administrée), rue ou repère, indications. GPS facultatif (plus tard). */
export function AddressForm({ initial, onSaved, onCancel }: { initial?: SavedAddress; onSaved: (id: string) => void; onCancel?: () => void }) {
  const geo = useApi<GeoTree>('/catalog/zones');
  const [v, setV] = useState({ label: initial?.label ?? 'Maison', neighborhoodId: initial?.neighborhoodId ?? '', streetLandmark: initial?.streetLandmark ?? '', instructions: initial?.instructions ?? '', isDefault: initial?.isDefault ?? false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(addressSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setErr(null);
    try {
      if (initial) { await api(`/me/addresses/${initial.id}`, { method: 'PUT', body: v }); onSaved(initial.id); }
      else onSaved((await api<{ id: string }>('/me/addresses', { method: 'POST', body: v })).id);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="flex gap-2">
        {['Maison', 'Bureau', 'Autre'].map((l) => (
          <button key={l} type="button" aria-pressed={v.label === l} onClick={() => setV({ ...v, label: l })}
            className={`rounded-full border px-3 py-1.5 text-sm ${v.label === l ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{l}</button>
        ))}
      </div>
      <Select label="Quartier" value={v.neighborhoodId} onChange={(e) => setV({ ...v, neighborhoodId: e.target.value })} error={errors.neighborhoodId}>
        <option value="">Choisir…</option>
        {flattenNeighborhoods(geo.data).map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
      </Select>
      <Field label="Rue ou repère" placeholder="Ex. 2e von après la pharmacie, portail bleu" value={v.streetLandmark} onChange={(e) => setV({ ...v, streetLandmark: e.target.value })} error={errors.streetLandmark} />
      <TextArea label="Indications pour le livreur (facultatif)" value={v.instructions} maxLength={300} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--color-brand)]" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} /> Adresse par défaut</label>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>Enregistrer l’adresse</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>}
      </div>
    </form>
  );
}
