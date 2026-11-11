import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditLog, AuditScope } from './audit-log.schema';

export interface AuditEntry {
  actorUserId?: string | null;
  scope: AuditScope;
  restaurantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

const oid = (v?: string | null) => (v ? new Types.ObjectId(v) : null);

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLog>) {}

  /** Enregistre une action sensible. Échoue bruyamment : une action sensible non tracée est une anomalie. */
  async record(entry: AuditEntry, session?: ClientSession) {
    const [doc] = await this.model.create(
      [{ ...entry, actorUserId: oid(entry.actorUserId), restaurantId: oid(entry.restaurantId) }],
      { session },
    );
    this.logger.log(`${entry.action} ${entry.entity}:${entry.entityId ?? '-'} par ${entry.actorUserId ?? 'système'}`);
    return doc;
  }

  async list(filter: { restaurantId?: string; actorUserId?: string; action?: string }, limit = 100) {
    const q: Record<string, unknown> = {};
    if (filter.restaurantId) q.restaurantId = new Types.ObjectId(filter.restaurantId);
    if (filter.actorUserId) q.actorUserId = new Types.ObjectId(filter.actorUserId);
    if (filter.action) q.action = filter.action;
    return this.model.find(q).sort({ createdAt: -1 }).limit(Math.min(limit, 500)).lean();
  }
}
