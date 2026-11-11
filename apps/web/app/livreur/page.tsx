'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CourierDeliveryView, CourierOffer, INCIDENT_LABELS } from '@plateforme/contracts';
import { LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { buttonStyles, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getSocket, useLive } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface Me { id: string; status: string; statusReason: string | null; isOnline: boolean; cashHeld: number; hasActiveDelivery: boolean }
interface Earnings { today: { total: number; count: number }; week: { total: number; count: number }; month: { total: number; count: number }; pendingPayout: number; paidOut: number; cashHeld: number }
interface Hist { id: string; orderNumber: string; restaurantName: string; area: string; statusLabel: string; courierPay: number; at: string }

const STEP_LABEL: Record<string, string> = { ASSIGNED: 'Je suis arrivé au restaurant', AT_PICKUP: 'Commande récupérée', PICKED_UP: 'Je suis chez le client' };
const STEP_PATH: Record<string, string> = { ASSIGNED: 'arrived-pickup', AT_PICKUP: 'picked-up', PICKED_UP: 'arrived-dropoff' };
const mapsLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** Application livreur (mobile) : disponibilité, offres en direct, course active pas à pas, gains. */
export default function CourierHome() {
  const router = useRouter();
  const { me: user, loading } = useSession();
  const me = useApi<Me | null>(user ? '/courier/me' : null);
  const active = me.data?.status === 'ACTIVE';
  const offers = useApi<CourierOffer[]>(active ? '/courier/offers' : null);
  const current = useApi<CourierDeliveryView | null>(active ? '/courier/active' : null);
  const earnings = useApi<Earnings>(active ? '/courier/earnings' : null);
  const history = useApi<Hist[]>(active ? '/courier/history' : null);
  const [tab, setTab] = useState<'course' | 'gains' | 'historique'>('course');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [panel, setPanel] = useState<'fail' | 'withdraw' | 'report' | null>(null);
  const [text, setText] = useState('');
  const [geo, setGeo] = useState<'off' | 'on' | 'denied'>('off');
  const lastSent = useRef(0);

  useEffect(() => { if (!loading && !user) router.replace('/connexion?suite=/livreur'); }, [loading, user, router]);
  const refreshAll = useCallback(() => { me.reload(); offers.reload(); current.reload(); earnings.reload(); }, [me, offers, current, earnings]);
  useLive(user && active ? { type: 'user', id: user.id } : null, ['delivery.offer', 'delivery.updated'], refreshAll, 20_000);

  // Partage de position réelle (avec l'accord du livreur) quand il est en ligne.
  useEffect(() => {
    if (!me.data?.isOnline || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeo('on');
        if (Date.now() - lastSent.current < 30_000) return;
        lastSent.current = Date.now();
        void api('/courier/position', { method: 'POST', body: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }).catch(() => undefined);
      },
      () => setGeo('denied'),
      { enableHighAccuracy: true, maximumAge: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [me.data?.isOnline]);
  useEffect(() => { if (user) getSocket(); }, [user]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }); }
    catch (e) { setMsg({ tone: 'err', text: e instanceof ApiError ? e.message : 'Action impossible.' }); }
    finally { setBusy(null); refreshAll(); }
  }

  // Spinner seulement au premier chargement : les rafraîchissements en direct ne doivent jamais effacer l'écran (ni le code en cours de saisie).
  if (loading || !user || (me.loading && !me.data)) return <MobileScreen><LoadingBlock /></MobileScreen>;
  const c = me.data;

  if (!c) {
    return (
      <MobileScreen className="bg-header-peach">
        <div className="flex flex-1 flex-col justify-center px-6 text-center">
          <p className="text-5xl" aria-hidden>🛵</p>
          <h1 className="mt-4 text-2xl font-extrabold">Livrez avec nous</h1>
          <p className="mt-2 text-sm text-ink-muted">Choisissez vos horaires, acceptez les courses près de vous et suivez vos gains.</p>
          <Link href="/livreur/inscription" className={`${buttonStyles({ size: 'lg', block: true })} mt-8`}>Devenir livreur</Link>
        </div>
      </MobileScreen>
    );
  }
  if (c.status !== 'ACTIVE') {
    return (
      <MobileScreen className="bg-header-peach">
        <div className="flex flex-1 flex-col justify-center px-6 text-center">
          <p className="text-5xl" aria-hidden>{c.status === 'PENDING_REVIEW' ? '⏳' : '⛔'}</p>
          <h1 className="mt-4 text-2xl font-extrabold">{c.status === 'PENDING_REVIEW' ? 'Dossier en cours de validation' : c.status === 'REJECTED' ? 'Dossier refusé' : 'Compte suspendu'}</h1>
          <p className="mt-2 text-sm text-ink-muted">{c.status === 'PENDING_REVIEW' ? 'Notre équipe vérifie vos documents. Vous serez notifié dès la validation.' : c.statusReason ?? 'Contactez le support.'}</p>
          {c.status === 'REJECTED' && <Link href="/livreur/inscription" className={`${buttonStyles({ block: true })} mt-6`}>Corriger mon dossier</Link>}
        </div>
      </MobileScreen>
    );
  }

  const d = current.data && 'id' in current.data ? current.data : null;
  return (
    <MobileScreen>
      <header className="bg-header-orange rounded-b-[28px] px-5 pb-6 pt-5 text-white">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-white/85">Bonjour {user.fullName.split(' ')[0]}</p><p className="text-xl font-extrabold">{c.isOnline ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'}</p></div>
          <button type="button" role="switch" aria-checked={c.isOnline} aria-label="Disponibilité" disabled={busy === 'online'}
            onClick={() => run('online', () => api('/courier/online', { method: 'POST', body: { online: !c.isOnline } }))}
            className={`relative h-9 w-16 rounded-full transition ${c.isOnline ? 'bg-success' : 'bg-white/35'}`}>
            <span className={`absolute top-1 size-7 rounded-full bg-white shadow transition-all ${c.isOnline ? 'left-8' : 'left-1'}`} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[14px] bg-white/15 p-2"><p className="text-[11px]">Aujourd’hui</p><p className="font-bold">{fcfa(earnings.data?.today.total ?? 0)}</p></div>
          <div className="rounded-[14px] bg-white/15 p-2"><p className="text-[11px]">Courses</p><p className="font-bold">{earnings.data?.today.count ?? 0}</p></div>
          <div className="rounded-[14px] bg-white/15 p-2"><p className="text-[11px]">Espèces en main</p><p className="font-bold">{fcfa(c.cashHeld)}</p></div>
        </div>
        {c.isOnline && geo === 'denied' && <p className="mt-3 rounded-[10px] bg-white/20 p-2 text-xs">Position non partagée : autorisez la localisation pour faciliter le dispatch.</p>}
      </header>

      <div className="mx-5 mt-4 grid grid-cols-3 rounded-[12px] bg-surface p-1 text-sm font-semibold shadow-[var(--shadow-card)]">
        {(['course', 'gains', 'historique'] as const).map((k) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 rounded-[10px] capitalize ${tab === k ? 'bg-brand text-white' : 'text-ink-muted'}`}>{k}</button>)}
      </div>
      {msg && <p className={`mx-5 mt-3 rounded-[12px] p-3 text-sm ${msg.tone === 'ok' ? 'bg-success-50 text-success' : 'bg-danger-50 text-danger'}`}>{msg.text}</p>}

      <main className="flex-1 space-y-4 px-5 py-4">
        {tab === 'course' && (d ? (
          <section className="space-y-3 rounded-[20px] bg-surface p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between"><p className="text-lg font-extrabold">{d.orderNumber}</p><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand">{d.statusLabel}</span></div>
            <div className="rounded-[14px] bg-canvas p-3 text-sm">
              <p className="text-xs text-ink-muted">Récupération</p>
              <p className="font-semibold">{d.restaurant.name}</p><p className="text-ink-muted">{d.restaurant.address}</p>
              <div className="mt-2 flex gap-3 font-semibold">
                {d.restaurant.phone && <a href={`tel:${d.restaurant.phone}`} className="text-brand">📞 Appeler</a>}
                {d.restaurant.address && <a href={mapsLink(`${d.restaurant.address}, Cotonou`)} target="_blank" rel="noreferrer" className="text-brand">🧭 Itinéraire</a>}
              </div>
            </div>
            {d.customer && (
              <div className="rounded-[14px] bg-canvas p-3 text-sm">
                <p className="text-xs text-ink-muted">Livraison</p>
                <p className="font-semibold">{d.customer.name} · {d.customer.area}</p><p>{d.customer.address}</p>
                {d.customer.instructions && <p className="text-xs text-warning">« {d.customer.instructions} »</p>}
                <div className="mt-2 flex gap-3 font-semibold">
                  {d.customer.phone?.startsWith('+') && <a href={`tel:${d.customer.phone}`} className="text-brand">📞 Appeler le client</a>}
                  <a href={mapsLink(`${d.customer.address}, ${d.customer.area}`)} target="_blank" rel="noreferrer" className="text-brand">🧭 Itinéraire</a>
                </div>
              </div>
            )}
            <ul className="text-sm">{d.items.map((i, k) => <li key={k}>{i.qty} × {i.name}</li>)}</ul>
            {d.customerNote && <p className="rounded-[10px] bg-warning-50 p-2 text-xs text-warning">Note : {d.customerNote}</p>}
            <div className="flex justify-between rounded-[14px] border-2 border-brand p-3 text-sm"><span>À encaisser (espèces)</span><b className="text-brand">{fcfa(d.cashToCollect)}</b></div>
            <p className="text-xs text-ink-muted">Votre rémunération : {fcfa(d.courierPay)}</p>

            {STEP_PATH[d.status] && (
              <button type="button" disabled={!!busy} onClick={() => run('step', () => api(`/courier/deliveries/${d.id}/${STEP_PATH[d.status]}`, { method: 'POST' }))}
                className="h-14 w-full rounded-[14px] bg-cta text-[15px] font-bold text-white disabled:opacity-60">{busy === 'step' ? <Spinner className="size-5" /> : STEP_LABEL[d.status]}</button>
            )}
            {['PICKED_UP', 'AT_DROPOFF'].includes(d.status) && (
              <div className="space-y-2 rounded-[14px] bg-success-50 p-3">
                <label className="block text-sm font-semibold text-success">Code de livraison donné par le client
                  <input inputMode="numeric" pattern="\d*" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="mt-1 h-14 w-full rounded-[12px] border border-line bg-surface text-center text-2xl font-extrabold tracking-[0.5em] text-ink" aria-label="Code à 4 chiffres" />
                </label>
                <p className="text-xs text-ink-muted">Essais restants : {d.otpAttemptsLeft}</p>
                <button type="button" disabled={code.length !== 4 || !!busy} onClick={() => run('deliver', async () => { await api(`/courier/deliveries/${d.id}/deliver`, { method: 'POST', body: { code } }); setCode(''); }, 'Livraison validée. Merci !')}
                  className="h-14 w-full rounded-[14px] bg-success text-[15px] font-bold text-white disabled:opacity-50">Confirmer la livraison</button>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              {['ASSIGNED', 'AT_PICKUP'].includes(d.status) && <button type="button" className="text-ink-muted" onClick={() => { setPanel('withdraw'); setText(''); }}>Rendre la course</button>}
              {['PICKED_UP', 'AT_DROPOFF'].includes(d.status) && <button type="button" className="text-danger" onClick={() => { setPanel('fail'); setText(''); }}>Livraison impossible</button>}
              <button type="button" className="text-ink-muted" onClick={() => { setPanel('report'); setText(''); }}>Signaler un incident</button>
            </div>
            {panel && (
              <div className="space-y-2 rounded-[14px] bg-canvas p-3 text-sm">
                <p className="font-semibold">{panel === 'withdraw' ? 'Pourquoi rendez-vous la course ?' : panel === 'fail' ? 'Pourquoi la livraison est-elle impossible ?' : 'Décrivez l’incident'}</p>
                <div className="flex flex-wrap gap-2">
                  {(panel === 'fail' ? ['Client injoignable', 'Adresse introuvable', 'Client absent'] : panel === 'withdraw' ? ['Panne de véhicule', 'Restaurant trop long', 'Urgence personnelle'] : [INCIDENT_LABELS.DAMAGED, INCIDENT_LABELS.WRONG_ORDER, INCIDENT_LABELS.LATE]).map((r) => (
                    <button key={r} type="button" onClick={() => setText(r)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs">{r}</button>
                  ))}
                </div>
                <input value={text} onChange={(e) => setText(e.target.value)} className="h-11 w-full rounded-[10px] border border-line bg-surface px-2" aria-label="Motif" />
                <div className="flex gap-2">
                  <button type="button" disabled={text.trim().length < 3 || !!busy} className="h-10 flex-1 rounded-[10px] bg-brand font-semibold text-white disabled:opacity-50"
                    onClick={() => run('panel', async () => {
                      if (panel === 'report') await api(`/courier/deliveries/${d.id}/report`, { method: 'POST', body: { type: 'OTHER', description: text } });
                      else await api(`/courier/deliveries/${d.id}/${panel}`, { method: 'POST', body: { reason: text } });
                      setPanel(null);
                    }, panel === 'report' ? 'Incident transmis aux opérations.' : 'Les opérations ont été prévenues.')}>Envoyer</button>
                  <button type="button" className="h-10 flex-1 rounded-[10px] border border-line" onClick={() => setPanel(null)}>Annuler</button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-3">
            <p className="font-bold">Courses disponibles</p>
            {!c.isOnline && <p className="rounded-[14px] bg-surface p-4 text-sm text-ink-muted shadow-[var(--shadow-card)]">Passez en ligne pour recevoir des courses.</p>}
            {c.isOnline && (offers.data?.length ?? 0) === 0 && <p className="rounded-[14px] bg-surface p-4 text-sm text-ink-muted shadow-[var(--shadow-card)]">Aucune course pour le moment. Restez en ligne : les nouvelles offres apparaissent ici.</p>}
            {offers.data?.map((o) => (
              <article key={o.deliveryId} className="rounded-[18px] bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between"><p className="font-bold">{o.restaurantName}</p><b className="text-brand">{fcfa(o.courierPay)}</b></div>
                <p className="mt-1 text-sm text-ink-muted">📍 {o.pickupArea || 'Restaurant'} → {o.dropoffArea}</p>
                <p className="text-xs text-ink-muted">Distance : {o.distanceKm != null ? `${o.distanceKm} km` : 'non disponible'} · expire à {new Date(o.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={!!busy} onClick={() => run(`dec-${o.deliveryId}`, () => api(`/courier/offers/${o.deliveryId}/decline`, { method: 'POST' }))} className="h-12 rounded-[12px] border border-line font-semibold">Refuser</button>
                  <button type="button" disabled={!!busy} onClick={() => run(`acc-${o.deliveryId}`, () => api(`/courier/offers/${o.deliveryId}/accept`, { method: 'POST' }), 'Course acceptée : direction le restaurant.')} className="h-12 rounded-[12px] bg-cta font-semibold text-white">Accepter</button>
                </div>
              </article>
            ))}
          </section>
        ))}

        {tab === 'gains' && earnings.data && (
          <section className="space-y-3">
            {[['Aujourd’hui', earnings.data.today], ['7 derniers jours', earnings.data.week], ['30 derniers jours', earnings.data.month]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between rounded-[14px] bg-surface p-4 shadow-[var(--shadow-card)]"><span>{l as string} · {(v as { count: number }).count} course(s)</span><b>{fcfa((v as { total: number }).total)}</b></div>
            ))}
            <div className="rounded-[14px] bg-surface p-4 text-sm shadow-[var(--shadow-card)]">
              <div className="flex justify-between"><span>Rémunération en attente de versement</span><b>{fcfa(earnings.data.pendingPayout)}</b></div>
              <div className="flex justify-between"><span>Déjà versé</span><b>{fcfa(earnings.data.paidOut)}</b></div>
              <div className="flex justify-between"><span>Espèces à reverser</span><b className="text-brand">{fcfa(earnings.data.cashHeld)}</b></div>
              <p className="mt-2 text-xs text-ink-muted">Les versements et reversements d’espèces sont gérés par l’équipe financière.</p>
            </div>
          </section>
        )}

        {tab === 'historique' && (
          <section className="space-y-2">
            {history.data?.length === 0 && <p className="text-sm text-ink-muted">Aucune course terminée.</p>}
            {history.data?.map((h) => (
              <div key={h.id} className="flex justify-between rounded-[14px] bg-surface p-3 text-sm shadow-[var(--shadow-card)]">
                <span><b>{h.orderNumber}</b> · {h.restaurantName} → {h.area}<span className="block text-xs text-ink-muted">{h.statusLabel} · {new Date(h.at).toLocaleString('fr-FR')}</span></span>
                <b>{h.courierPay ? fcfa(h.courierPay) : '—'}</b>
              </div>
            ))}
          </section>
        )}
      </main>
    </MobileScreen>
  );
}
