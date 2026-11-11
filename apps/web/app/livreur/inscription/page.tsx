'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { COURIER_DOC_LABELS, COURIER_DOC_TYPES, courierApplicationSchema, VEHICLE_LABELS, VEHICLE_TYPES } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { ImageInput } from '@/components/console/image-input';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

/** Inscription livreur : véhicule, versements, documents (privés). Le compte reste en attente jusqu'à validation. */
export default function CourierApplyPage() {
  const router = useRouter();
  const { me, loading } = useSession();
  const [v, setV] = useState({ vehicleType: 'MOTO' as (typeof VEHICLE_TYPES)[number], plate: '', provider: 'MTN_MOMO', number: '' });
  const [docs, setDocs] = useState<Partial<Record<(typeof COURIER_DOC_TYPES)[number], string>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && !me) router.replace('/connexion?suite=/livreur/inscription'); }, [loading, me, router]);
  useEffect(() => { if (me && !v.number) setV((x) => ({ ...x, number: me.phone })); }, [me, v.number]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      vehicleType: v.vehicleType, plate: v.plate, payout: { provider: v.provider, number: v.number },
      documents: Object.entries(docs).filter(([, p]) => p).map(([type, publicId]) => ({ type, publicId })),
    };
    const r = validate(courierApplicationSchema, body);
    if (!r.ok) { setErrors(r.errors); setMsg(Object.values(r.errors)[0] ?? null); return; }
    setErrors({});
    setBusy(true);
    setMsg(null);
    try { await api('/courier/application', { method: 'POST', body }); router.replace('/livreur'); }
    catch (err) { setMsg(err instanceof ApiError ? err.message : 'Envoi impossible.'); }
    finally { setBusy(false); }
  }

  const needsLicense = v.vehicleType === 'MOTO' || v.vehicleType === 'CAR';
  return (
    <AuthShell title="Devenir livreur" subtitle="Votre dossier sera vérifié par notre équipe avant votre première course." backHref="/livreur">
      <form onSubmit={submit} noValidate className="space-y-4">
        {msg && <Alert tone="danger">{msg}</Alert>}
        <fieldset>
          <legend className="text-sm font-semibold">Véhicule</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {VEHICLE_TYPES.map((t) => <button key={t} type="button" aria-pressed={v.vehicleType === t} onClick={() => setV({ ...v, vehicleType: t })}
              className={`h-11 rounded-[12px] border text-sm font-semibold ${v.vehicleType === t ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{VEHICLE_LABELS[t]}</button>)}
          </div>
        </fieldset>
        {needsLicense && <Field label="Immatriculation" value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} />}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Versements
            <select value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value })} className="h-12 rounded-[12px] border border-line px-2 font-normal">
              <option value="MTN_MOMO">MTN Mobile Money</option><option value="MOOV_MONEY">Moov Money</option>
            </select>
          </label>
          <Field label="Numéro Mobile Money" type="tel" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} error={errors['payout.number']} />
        </div>
        <p className="text-sm font-semibold">Documents <span className="font-normal text-ink-muted">(photos nettes, visibles uniquement par l’équipe de validation)</span></p>
        <div className="grid grid-cols-2 gap-3">
          {COURIER_DOC_TYPES.filter((t) => t !== 'DRIVING_LICENSE' || needsLicense).map((t) => (
            <ImageInput key={t} privateFile label={`${COURIER_DOC_LABELS[t]}${t === 'ID_CARD' || (t === 'DRIVING_LICENSE' && needsLicense) ? ' *' : ''}`} purpose="courier_document" aspect="aspect-[4/3]"
              url={docs[t] ? 'ok' : null} onChange={(img) => setDocs({ ...docs, [t]: img?.publicId })} />
          ))}
        </div>
        <Button type="submit" block size="lg" loading={busy}>Envoyer mon dossier</Button>
      </form>
    </AuthShell>
  );
}
