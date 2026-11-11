'use client';
import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { MediaPurpose, uploadImage } from '@/lib/upload';
import { Spinner } from '../ui';

/** Sélection + téléversement Cloudinary d'une image ; renvoie le public_id. */
export function ImageInput({ label, purpose, restaurantId, url, onChange, aspect = 'aspect-video', privateFile = false }: {
  label: string; purpose: MediaPurpose; restaurantId?: string; url: string | null; onChange: (v: { publicId: string; url: string } | null) => void; aspect?: string;
  /** Fichier privé (documents livreur) : pas d'aperçu public, seulement une confirmation d'envoi. */
  privateFile?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      onChange(await uploadImage(file, purpose, restaurantId));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Téléversement impossible.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{label}</p>
      <div className={`relative grid ${aspect} w-full max-w-sm place-items-center overflow-hidden rounded-[14px] border border-dashed border-line bg-canvas`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? (privateFile ? <span className="text-sm font-semibold text-success">✓ Document envoyé (privé)</span> : <img src={url} alt="" className="h-full w-full object-cover" />) : <span className="text-sm text-ink-muted">Aucun fichier</span>}
        {busy && <span className="absolute inset-0 grid place-items-center bg-white/70 text-brand"><Spinner /></span>}
      </div>
      <div className="flex gap-3 text-sm font-semibold">
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="text-brand">{url ? 'Remplacer' : 'Choisir une image'}</button>
        {url && <button type="button" onClick={() => onChange(null)} className="text-ink-muted">Retirer</button>}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
