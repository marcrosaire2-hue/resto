'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import type { OpsCourier, OpsOrder } from '@/lib/ops-types';

const COTONOU: [number, number] = [6.3703, 2.3912];

/** Carte opérationnelle : uniquement les positions réellement connues (aucune position inventée). */
export default function OpsMap({ couriers, orders }: { couriers: OpsCourier[]; orders: OpsOrder[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !el.current || map.current) return;
      map.current = L.map(el.current).setView(COTONOU, 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; contributeurs OpenStreetMap' }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    void import('leaflet').then((L) => {
      if (!layer.current) return;
      layer.current.clearLayers();
      for (const c of couriers) {
        if (!c.position) continue;
        const color = c.busy ? '#B7791F' : c.isOnline ? '#239B56' : '#5F6368';
        L.circleMarker([c.position.lat, c.position.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindTooltip(`${c.fullName} · ${c.busy ? 'en course' : c.isOnline ? 'disponible' : 'hors ligne'} · position du ${new Date(c.position.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
          .addTo(layer.current);
      }
      for (const o of orders) {
        if (o.dropoff.lat == null || o.dropoff.lng == null) continue;
        L.circleMarker([o.dropoff.lat, o.dropoff.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#F15A24', fillOpacity: 1 }).bindTooltip(`${o.number} · ${o.statusLabel}`).addTo(layer.current);
      }
    });
  }, [couriers, orders]);

  return <div ref={el} className="h-[60vh] w-full overflow-hidden rounded-[16px]" role="region" aria-label="Carte des livreurs et des commandes" />;
}
