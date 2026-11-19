'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import type { OrderTrackingView } from '@plateforme/contracts';

type Position = NonNullable<OrderTrackingView['position']>;

export function TrackingMap({ position }: { position: Position }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !element.current) return;
      if (!map.current) {
        map.current = L.map(element.current, { zoomControl: false }).setView([position.lat, position.lng], 15);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; contributeurs OpenStreetMap',
        }).addTo(map.current);
      }
      map.current.setView([position.lat, position.lng]);
      marker.current?.remove();
      marker.current = L.circleMarker([position.lat, position.lng], {
        radius: 11,
        color: '#ffffff',
        weight: 4,
        fillColor: '#F7790F',
        fillOpacity: 1,
      }).addTo(map.current);
    });
    return () => { cancelled = true; };
  }, [position.lat, position.lng]);

  useEffect(() => () => {
    map.current?.remove();
    map.current = null;
    marker.current = null;
  }, []);

  return <div ref={element} className="h-56 w-full bg-[#e8eee8]" role="region" aria-label="Position actuelle du livreur" />;
}
