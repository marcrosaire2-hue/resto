'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { StatusPill } from '@/components/console/form';
import { Button, Card, Spinner, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import type { ProMenu, ProProduct } from '@/lib/pro-types';
import { fcfa, useApi } from '@/lib/use-api';

/** Gestion du menu : catégories (ordre, activation) et plats (publication, disponibilité, archivage). */
export default function MenuPage() {
  const { rid, can } = useProRestaurant();
  const menu = useApi<ProMenu>(`/restaurants/${rid}/menu`);
  const [newCat, setNewCat] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      menu.reload();
      if (ok) setMsg({ tone: 'success', text: ok });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' });
    } finally {
      setBusy(null);
    }
  }
  if (menu.loading || !menu.data) return <div className="grid place-items-center py-20 text-brand"><Spinner /></div>;
  const { categories, products } = menu.data;
  const base = `/restaurants/${rid}/menu`;
  const move = (i: number, d: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    return run(`move-${i}`, () => api(`${base}/categories/order`, { method: 'PUT', body: { ids } }));
  };

  return (
    <>
      <PageTitle title="Menu" actions={can('menu.edit') && categories.length > 0 ? <Link href={`/pro/${rid}/menu/plats/nouveau`} className={buttonStyles({ size: 'sm' })}>+ Nouveau plat</Link> : undefined}>
        Les plats publiés apparaissent immédiatement sur votre vitrine. Un plat archivé reste dans l’historique des commandes.
      </PageTitle>
      <Notice msg={msg} />
      {can('menu.edit') && (
        <Card className="mb-6 flex flex-wrap items-end gap-3 p-4">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">Nouvelle catégorie
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Ex. Grillades" className="h-11 rounded-[12px] border border-line px-3 font-normal" />
          </label>
          <Button disabled={!newCat.trim()} loading={busy === 'cat'} onClick={() => run('cat', async () => { await api(`${base}/categories`, { method: 'POST', body: { name: newCat } }); setNewCat(''); }, 'Catégorie créée.')}>Ajouter</Button>
        </Card>
      )}
      {categories.length === 0 && <p className="text-sm text-ink-muted">Créez une première catégorie (Entrées, Plats, Boissons…) pour ajouter vos plats.</p>}
      <div className="space-y-6">
        {categories.map((c, i) => {
          const items = products.filter((p) => p.menuCategoryId === c.id);
          return (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{c.name}</h2>
                {!c.active && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">Masquée</span>}
                {can('menu.edit') && (
                  <div className="ml-auto flex flex-wrap gap-3 text-sm font-semibold">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter" className="disabled:opacity-30">↑</button>
                    <button type="button" disabled={i === categories.length - 1} onClick={() => move(i, 1)} aria-label="Descendre" className="disabled:opacity-30">↓</button>
                    <button type="button" className="text-ink-muted" onClick={() => {
                      const name = window.prompt('Nouveau nom de la catégorie', c.name);
                      if (name?.trim()) void run(`ren-${c.id}`, () => api(`${base}/categories/${c.id}`, { method: 'PUT', body: { name, active: c.active } }));
                    }}>Renommer</button>
                    <button type="button" className="text-ink-muted" onClick={() => run(`act-${c.id}`, () => api(`${base}/categories/${c.id}`, { method: 'PUT', body: { name: c.name, active: !c.active } }))}>{c.active ? 'Masquer' : 'Afficher'}</button>
                    <button type="button" className="text-danger" onClick={() => { if (window.confirm(`Supprimer la catégorie « ${c.name} » ?`)) void run(`del-${c.id}`, () => api(`${base}/categories/${c.id}`, { method: 'DELETE' }), 'Catégorie supprimée.'); }}>Supprimer</button>
                  </div>
                )}
              </div>
              {items.length === 0 ? <p className="mt-3 text-sm text-ink-muted">Aucun plat.</p> : (
                <ul className="mt-3 divide-y divide-line">
                  {items.map((p) => <ProductRow key={p.id} p={p} rid={rid} can={can} busy={busy} run={run} base={base} />)}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ProductRow({ p, rid, can, busy, run, base }: {
  p: ProProduct; rid: string; can: (x: string) => boolean; busy: string | null; base: string;
  run: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.imageUrls[0] ? <img src={p.imageUrls[0]} alt="" className="size-14 rounded-[10px] object-cover" /> : <span className="size-14 rounded-[10px] bg-peach" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-sm text-ink-muted">{fcfa(p.basePrice)}{!p.available && ' · Indisponible'}</p>
      </div>
      <StatusPill status={p.status} />
      <div className="flex flex-wrap gap-3 text-sm font-semibold">
        {can('menu.availability.toggle') && (
          <button type="button" disabled={busy === `av-${p.id}`} onClick={() => run(`av-${p.id}`, () => api(`${base}/products/${p.id}/availability`, { method: 'PATCH', body: { available: !p.available } }))}>
            {p.available ? 'Rendre indisponible' : 'Rendre disponible'}
          </button>
        )}
        {can('menu.publish') && (p.status === 'DRAFT'
          ? <button type="button" className="text-success" onClick={() => run(`pub-${p.id}`, () => api(`${base}/products/${p.id}/publish`, { method: 'POST' }), 'Plat publié sur la vitrine.')}>Publier</button>
          : <button type="button" className="text-ink-muted" onClick={() => run(`pub-${p.id}`, () => api(`${base}/products/${p.id}/unpublish`, { method: 'POST' }), 'Plat retiré de la vitrine.')}>Dépublier</button>)}
        {can('menu.edit') && <Link href={`/pro/${rid}/menu/plats/${p.id}`} className="text-brand">Modifier</Link>}
        {can('menu.edit') && <button type="button" className="text-danger" onClick={() => { if (window.confirm(`Archiver « ${p.name} » ? Il disparaîtra de la vitrine (l’historique des commandes est conservé).`)) void run(`arc-${p.id}`, () => api(`${base}/products/${p.id}/archive`, { method: 'POST' }), 'Plat archivé.'); }}>Archiver</button>}
      </div>
    </li>
  );
}
