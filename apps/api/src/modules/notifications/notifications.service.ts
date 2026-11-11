import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RealtimeService } from '../realtime/realtime.service';
import { Notification } from './notification.schema';

export interface NotifyInput { userIds: (string | Types.ObjectId)[]; eventKey: string; type: string; title: string; body?: string; link?: string | null; data?: unknown }

/**
 * Point central des notifications. Canal « application » opérationnel ; SMS / WhatsApp / e-mail / push
 * seront branchés ici (F42) — l'unicité (userId, eventKey) garantit l'absence de doublons.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  constructor(@InjectModel(Notification.name) private readonly model: Model<Notification>, private readonly realtime: RealtimeService) {}

  async notify(n: NotifyInput) {
    const ids = [...new Set(n.userIds.map(String))];
    for (const uid of ids) {
      try {
        const doc = await this.model.create({ userId: new Types.ObjectId(uid), eventKey: n.eventKey, type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? null, data: n.data ?? null });
        this.realtime.toUser(uid, 'notification.new', { id: String(doc._id), title: doc.title, body: doc.body, link: doc.link, type: doc.type, createdAt: doc.createdAt });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) continue; // déjà notifié pour cet événement
        // Un échec de notification ne doit jamais faire échouer l'action métier : il est journalisé.
        this.logger.error(`Échec de notification ${n.eventKey} → ${uid} : ${(e as Error).message}`);
      }
    }
  }

  async list(userId: string, limit = 50) {
    const docs = await this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).lean();
    const unread = await this.model.countDocuments({ userId: new Types.ObjectId(userId), readAt: null });
    return { unread, items: docs.map((d) => ({ id: String(d._id), type: d.type, title: d.title, body: d.body, link: d.link, readAt: d.readAt, createdAt: d.createdAt })) };
  }

  async markRead(userId: string, ids: string[] | 'all') {
    const f: Record<string, unknown> = { userId: new Types.ObjectId(userId), readAt: null };
    if (ids !== 'all') f._id = { $in: ids.filter((i) => /^[a-f0-9]{24}$/i.test(i)).map((i) => new Types.ObjectId(i)) };
    await this.model.updateMany(f, { readAt: new Date() });
  }
}
