import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { env } from '../../common/env';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { Order } from './order.schema';
import { OrderEventsService } from './order-events.service';
import { OrdersService } from './orders.service';

/**
 * Surveillance des délais : restaurant sans réponse → alerte aux opérations et au restaurant,
 * puis annulation automatique si le paramètre est configuré. Le marquage atomique (responseAlertAt)
 * garantit une seule alerte même avec plusieurs instances de l'API.
 */
@Injectable()
export class OrdersScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('OrdersScheduler');
  private timer: NodeJS.Timeout | null = null;
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly service: OrdersService,
    private readonly events: OrderEventsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return; // les tests appellent runOnce() explicitement
    this.timer = setInterval(() => void this.runOnce().catch((e) => this.logger.error((e as Error).message)), 30_000);
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()) {
    const late = await this.orders.find({ status: 'PENDING', acceptDeadlineAt: { $lt: now }, responseAlertAt: null }).setOptions({ crossTenant: true }).limit(100).lean();
    for (const o of late) {
      const claimed = await this.orders.updateOne({ restaurantId: o.restaurantId, _id: o._id, responseAlertAt: null }, { responseAlertAt: now });
      if (claimed.modifiedCount !== 1) continue;
      const users: Types.ObjectId[] = [...(await this.events.opsUsers()), ...(await this.events.restaurantUsers(o.restaurantId))];
      await this.notifications.notify({
        userIds: users, eventKey: `order:${o._id}:response_late`, type: 'order.response_late',
        title: `Commande ${o.number} sans réponse`, body: `${o.restaurantSnapshot.name} n’a pas encore répondu.`, link: `/pro/${o.restaurantId}/commandes`,
      });
    }
    const autoCancel = await this.settings.get('orders.auto_cancel_after_minutes');
    if (autoCancel) {
      const limit = new Date(now.getTime() - autoCancel * 60_000);
      const stale = await this.orders.find({ status: 'PENDING', createdAt: { $lt: limit } }).setOptions({ crossTenant: true }).limit(100).lean();
      for (const o of stale) {
        await this.service.transition(o as never, 'CANCELLED', { kind: 'system', userId: null }, 'Le restaurant n’a pas répondu dans le délai prévu.').catch(() => undefined);
      }
    }
  }
}
