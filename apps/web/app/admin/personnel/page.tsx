'use client';
import { useState } from 'react';
import { PLATFORM_ROLES } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { inputCls, Table, useRunner } from '@/components/console/kit';
import { Button, Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface S { id: string; userId: string; roleCode: string; status: 'ACTIVE' | 'DISABLED'; fullName: string; phone: string | null }
const roleLabel = (c: string) => PLATFORM_ROLES.find((r) => r.code === c)?.label ?? c;

/** Salariés de la plateforme : le compte doit exister (inscription par téléphone), puis un rôle lui est attribué. */
export default function StaffPage() {
  const { me } = useSession();
  const list = useApi<S[]>('/admin/staff');
  const { msg, run } = useRunner(list.reload);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<string>(PLATFORM_ROLES[1]?.code ?? 'support_agent');
  return (
    <>
      <PageTitle title="Personnel de la plateforme">Chaque changement de rôle ou de statut est inscrit au journal d’audit.</PageTitle>
      <Notice msg={msg} />
      <Card className="mb-4 p-4 text-sm">
        <p className="font-bold">Ajouter un salarié</p>
        <p className="text-ink-muted">La personne doit d’abord créer son compte avec ce numéro.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">Téléphone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 97 00 00 00" className={inputCls} /></label>
          <label className="flex flex-col gap-1">Rôle<select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>{PLATFORM_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select></label>
          <Button size="sm" disabled={phone.replace(/\D/g, '').length < 8} onClick={() => run(() => api('/admin/staff', { method: 'POST', body: { phone, roleCode: role } }), 'Salarié ajouté.').then((ok) => ok && setPhone(''))}>Ajouter</Button>
        </div>
      </Card>
      {!list.data ? <Spinner /> : (
        <Table head={['Nom', 'Téléphone', 'Rôle', 'Statut', '']} empty={list.data.length === 0}>
          {list.data.map((s) => {
            const self = s.userId === me?.id;
            return (
              <tr key={s.id}>
                <td className="px-3 py-2">{s.fullName}{self && <span className="text-ink-muted"> (vous)</span>}</td>
                <td className="px-3 py-2">{s.phone}</td>
                <td className="px-3 py-2">
                  <select aria-label={`Rôle de ${s.fullName}`} disabled={self} value={s.roleCode} onChange={(e) => run(() => api(`/admin/staff/${s.id}`, { method: 'PATCH', body: { roleCode: e.target.value } }), 'Rôle modifié.')} className={inputCls}>
                    {PLATFORM_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">{s.status === 'ACTIVE' ? 'Actif' : <span className="text-danger">Désactivé</span>}</td>
                <td className="px-3 py-2">{!self && (s.status === 'ACTIVE'
                  ? <Button size="sm" variant="outline" onClick={() => run(() => api(`/admin/staff/${s.id}`, { method: 'PATCH', body: { status: 'DISABLED' } }), `Accès de ${s.fullName} désactivé.`)}>Désactiver</Button>
                  : <Button size="sm" onClick={() => run(() => api(`/admin/staff/${s.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } }), `Accès de ${s.fullName} réactivé (${roleLabel(s.roleCode)}).`)}>Réactiver</Button>)}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
