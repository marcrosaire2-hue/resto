'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressForm, SavedAddress } from '@/components/client/address-form';
import { PlainHeader } from '@/components/client/plain-header';
import { LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

/** Carnet d'adresses : domicile, bureau, autre ; une adresse par défaut. */
export default function AddressesPage() {
  const { me, loading } = useSession();
  const router = useRouter();
  useEffect(() => { if (!loading && !me) router.replace('/connexion?suite=/compte/adresses'); }, [loading, me, router]);
  const list = useApi<SavedAddress[]>(me ? '/me/addresses' : null);
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Mes adresses" backHref="/compte" />
      <main className="flex-1 space-y-3 px-4 pb-6">
        {list.loading ? <LoadingBlock /> : list.data?.map((a) => (
          <div key={a.id} className="rounded-[8px] border border-line p-3 text-sm">
            {editing !== 'new' && editing?.id === a.id ? (
              <AddressForm initial={a} onSaved={() => { setEditing(null); list.reload(); }} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <p className="font-semibold">{a.label} {a.isDefault && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand">Par défaut</span>}</p>
                <p className="text-ink-muted">{a.neighborhood}, {a.commune} · {a.streetLandmark}</p>
                {a.instructions && <p className="text-xs text-ink-muted">{a.instructions}</p>}
                <div className="mt-2 flex gap-4 font-semibold">
                  <button type="button" className="text-brand" onClick={() => setEditing(a)}>Modifier</button>
                  <button type="button" className="text-danger" onClick={async () => { if (window.confirm('Supprimer cette adresse ?')) { await api(`/me/addresses/${a.id}`, { method: 'DELETE' }); list.reload(); } }}>Supprimer</button>
                </div>
              </>
            )}
          </div>
        ))}
        {editing === 'new' ? (
          <div className="rounded-[8px] border border-line p-3"><AddressForm onSaved={() => { setEditing(null); list.reload(); }} onCancel={() => setEditing(null)} /></div>
        ) : <button type="button" className="h-11 w-full rounded-[8px] border border-brand font-semibold text-brand" onClick={() => setEditing('new')}>+ Ajouter une adresse</button>}
      </main>
    </MobileScreen>
  );
}
