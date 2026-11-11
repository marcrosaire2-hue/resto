'use client';
import { useState } from 'react';
import { RESTAURANT_ROLES } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Select } from '@/components/console/form';
import { Button, Card, Field, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import { useApi } from '@/lib/use-api';

interface Staff { id: string; fullName: string; phone: string | null; roleCode: string; status: 'ACTIVE' | 'DISABLED'; permissions: string[] }
const label = (c: string) => RESTAURANT_ROLES.find((r) => r.code === c)?.label ?? c;

/** Personnel du restaurant. Seul le propriétaire peut ajouter, modifier ou désactiver un salarié. */
export default function StaffPage() {
  const { rid, can } = useProRestaurant();
  const staff = useApi<Staff[]>(`/restaurants/${rid}/staff`);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('cook');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const manage = can('staff.manage');
  const [invite, setInvite] = useState({ fullName: '', phone: '', roleCode: 'cook' });
  const [link, setLink] = useState<{ who: string; url: string } | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try { await fn(); staff.reload(); setMsg({ tone: 'success', text: ok }); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageTitle title="Personnel">Chaque rôle donne des permissions limitées. Aucun salarié n’obtient automatiquement les droits du propriétaire.</PageTitle>
      <Notice msg={msg} />
      {manage && (
        <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <Field label="Téléphone du salarié (compte existant)" type="tel" placeholder="01 97 00 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value)}>
            {RESTAURANT_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
          <Button loading={busy === 'add'} disabled={phone.length < 8} onClick={() => run('add', async () => { await api(`/restaurants/${rid}/staff`, { method: 'POST', body: { phone, roleCode: role } }); setPhone(''); }, 'Salarié ajouté.')}>Ajouter</Button>
        </Card>
      )}
      {manage && (
        <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end">
          <Field label="Nom du nouveau salarié" value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} />
          <Field label="Son téléphone (sans compte)" type="tel" placeholder="01 97 00 00 00" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} />
          <Select label="Rôle" value={invite.roleCode} onChange={(e) => setInvite({ ...invite, roleCode: e.target.value })}>
            {RESTAURANT_ROLES.filter((r) => r.code !== 'owner').map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
          <Button loading={busy === 'invite'} disabled={invite.fullName.trim().length < 2 || invite.phone.length < 8}
            onClick={() => run('invite', async () => {
              const r = await api<{ activationLink: string }>(`/restaurants/${rid}/staff/invite`, { method: 'POST', body: invite });
              setLink({ who: invite.fullName, url: r.activationLink });
              setInvite({ fullName: '', phone: '', roleCode: 'cook' });
            }, 'Compte créé.')}>Créer le compte</Button>
        </Card>
      )}
      {link && (
        <Card className="mb-6 space-y-2 border border-brand p-4 text-sm">
          <p className="font-semibold">Lien d’activation pour {link.who} (valable 72 h, usage unique)</p>
          <p className="text-ink-muted">Transmettez-le uniquement à cette personne : il lui permet de choisir son mot de passe. L’envoi automatique par SMS sera activé avec le fournisseur SMS.</p>
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="h-10 w-full rounded-[8px] border border-line px-2 text-xs" aria-label="Lien d’activation" />
          <div className="flex flex-wrap gap-3 font-semibold">
            <button type="button" className="text-brand" onClick={() => navigator.clipboard?.writeText(link.url)}>Copier</button>
            <a className="text-success" href={`https://wa.me/?text=${encodeURIComponent(`Bonjour, activez votre compte : ${link.url}`)}`} target="_blank" rel="noreferrer">Envoyer par WhatsApp</a>
            <button type="button" className="text-ink-muted" onClick={() => setLink(null)}>Masquer</button>
          </div>
        </Card>
      )}
      {staff.loading ? <div className="grid place-items-center py-10 text-brand"><Spinner /></div> : (
        <Card className="divide-y divide-line">
          {staff.data?.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1"><p className="font-semibold">{s.fullName}</p><p className="text-sm text-ink-muted">{s.phone} · {s.permissions.length} permissions</p></div>
              {manage ? (
                <select aria-label={`Rôle de ${s.fullName}`} value={s.roleCode} onChange={(e) => run(`r-${s.id}`, () => api(`/restaurants/${rid}/staff/${s.id}`, { method: 'PATCH', body: { roleCode: e.target.value } }), 'Rôle modifié.')} className="h-10 rounded-[10px] border border-line px-2 text-sm">
                  {RESTAURANT_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              ) : <span className="text-sm">{label(s.roleCode)}</span>}
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.status === 'ACTIVE' ? 'bg-success-50 text-success' : 'bg-black/5 text-ink-muted'}`}>{s.status === 'ACTIVE' ? 'Actif' : 'Désactivé'}</span>
              {manage && s.roleCode !== 'owner' && <button type="button" className="text-sm font-semibold text-brand" onClick={() => run(`ra-${s.id}`, async () => {
                const r = await api<{ activationLink: string }>(`/restaurants/${rid}/staff/${s.id}/reset-access`, { method: 'POST' });
                setLink({ who: s.fullName, url: r.activationLink });
              }, 'Accès réinitialisé : les sessions de ce salarié ont été fermées.')}>Réinitialiser l’accès</button>}
              {manage && <button type="button" className="text-sm font-semibold text-ink-muted" onClick={() => run(`s-${s.id}`, () => api(`/restaurants/${rid}/staff/${s.id}`, { method: 'PATCH', body: { status: s.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } }), 'Statut modifié.')}>{s.status === 'ACTIVE' ? 'Désactiver' : 'Réactiver'}</button>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
