import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { INCIDENT_LABELS } from '@plateforme/contracts';
import { notFound } from '../../common/errors';
import { Incident } from '../couriers/courier.schemas';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderEventsService } from '../orders/order-events.service';
import { RealtimeService } from '../realtime/realtime.service';

type I = Incident & { _id: Types.ObjectId };

/** Incidents : statut, responsable, historique horodaté et résolution obligatoire à la clôture. */
@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(Incident.name) private readonly model: Model<Incident>,
    private readonly notifications: NotificationsService,
    private readonly events: OrderEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  async open(input: { type: string; description: string; source: Incident['source']; reportedBy: string | null; orderId?: Types.ObjectId | null; restaurantId?: Types.ObjectId | null; courierId?: Types.ObjectId | null; data?: unknown }) {
    const doc = await this.model.create({
      ...input, reportedBy: input.reportedBy ? new Types.ObjectId(input.reportedBy) : null,
      events: [{ at: new Date(), by: input.reportedBy ? new Types.ObjectId(input.reportedBy) : null, action: 'Ouverture', note: input.description }],
    });
    await this.notifications.notify({
      userIds: await this.events.opsUsers(), eventKey: `incident:${doc._id}:open`, type: 'incident.open',
      title: `Incident : ${INCIDENT_LABELS[input.type as keyof typeof INCIDENT_LABELS] ?? input.type}`, body: input.description, link: '/operations/incidents',
    });
    this.realtime.toOps('incident.updated', { id: String(doc._id) });
    return { id: String(doc._id) };
  }

  dto(i: I) {
    return {
      id: String(i._id), type: i.type, typeLabel: INCIDENT_LABELS[i.type as keyof typeof INCIDENT_LABELS] ?? i.type, description: i.description, status: i.status,
      orderId: i.orderId ? String(i.orderId) : null, restaurantId: i.restaurantId ? String(i.restaurantId) : null, courierId: i.courierId ? String(i.courierId) : null,
      ownerId: i.ownerId ? String(i.ownerId) : null, resolution: i.resolution, source: i.source, createdAt: i.createdAt, updatedAt: i.updatedAt,
      events: i.events.map((e) => ({ at: e.at, by: e.by ? String(e.by) : null, action: e.action, note: e.note })),
    };
  }

  async list(status?: string) {
    const f = status === 'open' ? { status: { $in: ['OPEN', 'IN_PROGRESS'] } } : status ? { status } : {};
    return ((await this.model.find(f).sort({ createdAt: -1 }).limit(200).lean()) as I[]).map((i) => this.dto(i));
  }

  async update(id: Types.ObjectId, patch: { status?: Incident['status']; assignToMe?: boolean; note?: string; resolution?: string }, actor: string) {
    const i = await this.model.findById(id);
    if (!i) throw notFound();
    const events: { at: Date; by: Types.ObjectId; action: string; note: string }[] = [];
    const by = new Types.ObjectId(actor);
    if (patch.assignToMe) { i.ownerId = by; events.push({ at: new Date(), by, action: 'Prise en charge', note: '' }); if (i.status === 'OPEN') i.status = 'IN_PROGRESS'; }
    if (patch.status && patch.status !== i.status) { events.push({ at: new Date(), by, action: `Statut : ${patch.status}`, note: '' }); i.status = patch.status; }
    if (patch.resolution) { i.resolution = patch.resolution; events.push({ at: new Date(), by, action: 'Résolution', note: patch.resolution }); }
    if (patch.note) events.push({ at: new Date(), by, action: 'Note', note: patch.note });
    i.events.push(...events);
    await i.save();
    this.realtime.toOps('incident.updated', { id: String(id) });
    return this.dto(i.toObject() as I);
  }
}
