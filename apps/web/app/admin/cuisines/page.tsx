'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { ImageInput } from '@/components/console/image-input';
import { Button, Card, Field, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';

interface C { id: string; name: string; emoji: string | null; imagePublicId: string | null; imageUrl: string | null; sort: number; active: boolean }
const EMPTY = { id: null as string | null, name: '', emoji: '', imagePublicId: null as string | null, imageUrl: null as string | null, sort: 0, active: true };

/** Catégories de la marketplace affichées sur l'accueil client. */
export default function CuisinesAdmin() {
  const list = useApi<C[]>('/admin/cuisines');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try {
      const body = { name: form.name, emoji: form.emoji || null, imagePublicId: form.imagePublicId, sort: Number(form.sort) || 0, active: form.active };
      await api(form.id ? `/admin/cuisines/${form.id}` : '/admin/cuisines', { method: form.id ? 'PUT' : 'POST', body });
      setForm(null);
      list.reload();
      setMsg({ tone: 'success', text: 'Catégorie enregistrée.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Catégories de cuisine" actions={<Button size="sm" onClick={() => setForm({ ...EMPTY })}>+ Catégorie</Button>} />
      <Notice msg={msg} />
      {form && (
        <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Emoji (si pas d’image)" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          <Field label="Ordre d’affichage" type="number" value={String(form.sort)} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} />
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Visible sur l’accueil</label>
          <ImageInput label="Image ronde" purpose="cuisine_image" aspect="aspect-square" url={form.imageUrl} onChange={(img) => setForm({ ...form, imagePublicId: img?.publicId ?? null, imageUrl: img?.url ?? null })} />
          <div className="flex items-end gap-2"><Button loading={busy} disabled={form.name.trim().length < 2} onClick={save}>Enregistrer</Button><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button></div>
        </Card>
      )}
      {list.loading ? <div className="grid place-items-center py-10 text-brand"><Spinner /></div> : (
        <Card className="divide-y divide-line">
          {list.data?.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.imageUrl ? <img src={c.imageUrl} alt="" className="size-10 rounded-full object-cover" /> : <span className="grid size-10 place-items-center rounded-full bg-canvas text-xl">{c.emoji ?? '🍽️'}</span>}
              <span className={`flex-1 font-semibold ${c.active ? '' : 'opacity-50'}`}>{c.name}</span>
              <span className="text-xs text-ink-muted">ordre {c.sort}</span>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => setForm({ id: c.id, name: c.name, emoji: c.emoji ?? '', imagePublicId: c.imagePublicId, imageUrl: c.imageUrl, sort: c.sort, active: c.active })}>Modifier</button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
