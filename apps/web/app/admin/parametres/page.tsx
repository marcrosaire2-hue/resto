'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface S { key: string; label: string; value: number | null; configured: boolean; updatedAt: string | null }

/** Paramètres de la plateforme. Aucun n'a de valeur par défaut : la prise de commande reste fermée tant qu'ils ne sont pas renseignés. */
export default function SettingsAdmin() {
  const { me } = useSession();
  const canEdit = !!me?.platformPermissions.includes('admin.settings.edit');
  const list = useApi<S[]>('/admin/settings');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(s: S) {
    const raw = draft[s.key];
    const value = raw === '' ? null : Number(raw);
    setBusy(s.key);
    setMsg(null);
    try { await api(`/admin/settings/${s.key}`, { method: 'PUT', body: { value } }); list.reload(); setMsg({ tone: 'success', text: `« ${s.label} » enregistré.` }); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageTitle title="Paramètres de la plateforme">Chaque modification est tracée dans le journal d’audit. Pour ouvrir les commandes : frais de service (0 accepté) et délai de réponse des restaurants.</PageTitle>
      <Notice msg={msg} />
      {list.loading ? <div className="grid place-items-center py-10 text-brand"><Spinner /></div> : (
        <Card className="divide-y divide-line">
          {list.data?.map((s) => (
            <div key={s.key} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-ink-muted">{s.configured ? `Valeur actuelle : ${s.value}` : 'Non configuré'}</p>
              </div>
              {canEdit && <>
                <input aria-label={s.label} type="number" min={0} placeholder={s.value != null ? String(s.value) : '—'} value={draft[s.key] ?? ''} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} className="h-10 w-32 rounded-[10px] border border-line px-2" />
                <Button size="sm" disabled={draft[s.key] === undefined} loading={busy === s.key} onClick={() => save(s)}>Enregistrer</Button>
              </>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
