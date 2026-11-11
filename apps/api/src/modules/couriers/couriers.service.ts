import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { courierApplicationSchema, maskPhone, positionSchema } from '@plateforme/contracts';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { cloudinaryConfig } from '../media/cloudinary';
import { assertImageFolder, MediaService } from '../media/media.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/user.schema';
import { Courier } from './courier.schemas';

interface Meta { ip: string | null; userAgent: string | null }
type C = Courier & { _id: Types.ObjectId };

@Injectable()
export class CouriersService {
  constructor(
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly media: MediaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async byUser(userId: string) {
    return (await this.couriers.findOne({ userId: new Types.ObjectId(userId) }).lean()) as C | null;
  }

  async requireActive(userId: string) {
    const c = await this.byUser(userId);
    if (!c) throw forbidden('Vous n’êtes pas inscrit comme livreur.', 'NOT_A_COURIER');
    if (c.status !== 'ACTIVE') throw forbidden(c.status === 'PENDING_REVIEW' ? 'Votre dossier est en cours de validation.' : 'Votre compte livreur n’est pas actif.', 'COURIER_NOT_ACTIVE');
    return c;
  }

  /** Espèces encaissées et non encore reversées (calculées depuis le grand livre). */
  async cashHeld(courierId: Types.ObjectId | string) {
    const b = await this.ledger.balance(`clearing:cash:${courierId}`);
    return b.debit - b.credit;
  }

  /** Rémunération due au livreur (crédits) et déjà versée (débits), depuis le grand livre. */
  async payable(courierId: Types.ObjectId | string) {
    return this.ledger.balance(`payable:courier:${courierId}`);
  }

  async apply(userId: string, input: z.output<typeof courierApplicationSchema>, meta: Meta) {
    const existing = await this.byUser(userId);
    if (existing && existing.status !== 'REJECTED') throw conflict('ALREADY_APPLIED', 'Vous avez déjà un dossier livreur.');
    const folder = this.media.folderFor('courier_document', { userId });
    input.documents.forEach((d) => assertImageFolder(d.publicId, folder));
    assertImageFolder(input.photoPublicId, folder);
    const data = {
      userId: new Types.ObjectId(userId), status: 'PENDING_REVIEW' as const, statusReason: null, vehicleType: input.vehicleType, plate: input.plate,
      photoPublicId: input.photoPublicId ?? null, payout: input.payout, documents: input.documents.map((d) => ({ ...d, status: 'PENDING', uploadedAt: new Date() })),
    };
    const doc = existing
      ? await this.couriers.findOneAndUpdate({ _id: existing._id }, data, { new: true })
      : await this.couriers.create(data);
    await this.audit.record({ actorUserId: userId, scope: 'self', action: 'courier.apply', entity: 'courier', entityId: String(doc!._id), after: { vehicleType: input.vehicleType }, ...meta });
    return { id: String(doc!._id), status: 'PENDING_REVIEW' };
  }

  async me(userId: string) {
    const c = await this.byUser(userId);
    if (!c) return null;
    return {
      id: String(c._id), status: c.status, statusReason: c.statusReason, vehicleType: c.vehicleType, plate: c.plate,
      payout: { provider: c.payout.provider, number: maskPhone(c.payout.number) }, isOnline: c.isOnline,
      documents: c.documents.map((d) => ({ type: d.type, status: d.status })), cashHeld: await this.cashHeld(c._id),
      hasActiveDelivery: !!c.currentDeliveryId,
    };
  }

  async setOnline(userId: string, online: boolean) {
    const c = await this.requireActive(userId);
    if (!online && c.currentDeliveryId) throw unprocessable('ACTIVE_DELIVERY', 'Terminez ou rendez votre course avant de passer hors ligne.');
    await this.couriers.updateOne({ _id: c._id }, { isOnline: online });
    this.realtime.toOps('courier.updated', { courierId: String(c._id), isOnline: online });
    return { isOnline: online };
  }

  /** Position réelle envoyée par le téléphone (avec l'accord du livreur). Jamais inventée. */
  async updatePosition(userId: string, p: z.output<typeof positionSchema>) {
    const c = await this.requireActive(userId);
    if (!c.isOnline) throw unprocessable('OFFLINE', 'Passez en ligne pour partager votre position.');
    await this.couriers.updateOne({ _id: c._id }, { lastLat: p.lat, lastLng: p.lng, lastAccuracy: p.accuracy ?? null, lastPositionAt: new Date() });
    this.realtime.toOps('courier.position', { courierId: String(c._id), lat: p.lat, lng: p.lng, at: new Date().toISOString() });
  }

  // ---------- Administration ----------
  async adminList(status?: string) {
    const list = (await this.couriers.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(300).lean()) as C[];
    const users = await this.users.find({ _id: { $in: list.map((c) => c.userId) } }, { fullName: 1, phone: 1 }).lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return Promise.all(list.map(async (c) => ({
      id: String(c._id), userId: String(c.userId), fullName: byId.get(String(c.userId))?.fullName ?? '—', phone: byId.get(String(c.userId))?.phone ?? null,
      status: c.status, statusReason: c.statusReason, vehicleType: c.vehicleType, plate: c.plate, payout: c.payout, isOnline: c.isOnline,
      createdAt: c.createdAt, cashHeld: await this.cashHeld(c._id),
      documents: c.documents.map((d) => ({ type: d.type, status: d.status, uploadedAt: d.uploadedAt })),
    })));
  }

  /** URL signée et temporaire d'un document privé (consultation par l'administration uniquement). */
  async documentUrl(courierId: Types.ObjectId, index: number, actor: string, meta: Meta) {
    const c = await this.couriers.findById(courierId).lean();
    const d = c?.documents[index];
    if (!c || !d) throw notFound();
    const cfg = cloudinaryConfig();
    if (!cfg) throw unprocessable('MEDIA_NOT_CONFIGURED', 'Le stockage des fichiers n’est pas configuré.');
    cloudinary.config({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret });
    const url = cloudinary.url(d.publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image' });
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'courier.document_view', entity: 'courier', entityId: String(courierId), after: { type: d.type }, ...meta });
    return { url };
  }

  async review(courierId: Types.ObjectId, decision: 'approve' | 'reject' | 'suspend' | 'reactivate', reason: string | null, actor: string, meta: Meta) {
    const c = await this.couriers.findById(courierId);
    if (!c) throw notFound();
    const allowed: Record<string, string[]> = { approve: ['PENDING_REVIEW'], reject: ['PENDING_REVIEW'], suspend: ['ACTIVE'], reactivate: ['SUSPENDED'] };
    if (!allowed[decision].includes(c.status)) throw unprocessable('INVALID_STATE', 'Action impossible dans l’état actuel du dossier.');
    if (decision === 'suspend' && c.currentDeliveryId) throw unprocessable('ACTIVE_DELIVERY', 'Réattribuez d’abord la course en cours de ce livreur.');
    const status = decision === 'approve' || decision === 'reactivate' ? 'ACTIVE' : decision === 'reject' ? 'REJECTED' : 'SUSPENDED';
    const before = c.status;
    c.status = status;
    c.statusReason = reason;
    c.reviewedBy = new Types.ObjectId(actor);
    if (status !== 'ACTIVE') c.isOnline = false;
    if (decision === 'approve') c.documents.forEach((d) => { d.status = 'APPROVED'; });
    await c.save();
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: `courier.${decision}`, entity: 'courier', entityId: String(courierId), before: { status: before }, after: { status, reason }, ...meta });
    return { id: String(courierId), status };
  }
}
