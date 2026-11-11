'use client';
import { useParams } from 'next/navigation';
import { useSession } from './session';

/** Restaurant courant de l'espace pro et permissions effectives (calculées par l'API). */
export function useProRestaurant() {
  const { rid } = useParams<{ rid: string }>();
  const { me } = useSession();
  const membership = me?.restaurants.find((r) => r.restaurantId === rid) ?? null;
  const can = (p: string) => !!membership?.permissions.includes(p);
  return { rid, membership, can };
}

export type GeoTree = { id: string; name: string; communes: { id: string; name: string; neighborhoods: { id: string; name: string }[] }[] }[];
export function flattenNeighborhoods(tree: GeoTree | null) {
  return (tree ?? []).flatMap((c) => c.communes.flatMap((m) => m.neighborhoods.map((n) => ({ id: n.id, label: `${n.name} — ${m.name}, ${c.name}` }))));
}
