import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus, platformRole, STATUS_LABELS_FR } from '@plateforme/contracts';
import { NotificationsService } from '../notifications/notifications.service';
import { effectiveRestaurantPermissions } from '../rbac/permission.service';
import { PlatformStaff } from '../rbac/platform-staff.schema';
import { RestaurantEmployee } from '../rbac/restaurant-employee.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { Order } from './order.schema';

const CUSTOMER_MESSAGES: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'Le restaurant a accepté votre commande.',
  PREPARING: 'Votre commande est en préparation.',
  READY: 'Votre commande est prête.',
  WAITING_FOR_COURIER: 'Nous recherchons un livreur pour votre commande.',
  COURIER_ASSIGNED: 'Un livreur est en route vers le restaurant.',
  IN_DELIVERY: 'Votre commande est en cours de livraison.',
  DELIVERED: 'Votre commande a été livrée. Bon appétit !',
  REJECTED: 'Le restaurant n’a pas pu accepter votre commande.',
  CANCELLED: 'Votre commande a été annulée.',
  DELIVERY_FAILED: 'La livraison n’a pas pu aboutir. Notre équipe va vous contacter.',
};

/** Effets d'un événement de commande : notifications dans l'application et diffusion temps réel. */
@Injectable()
export class OrderEventsService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(RestaurantEmployee.name) private readonly employees: Model<RestaurantEmployee>,
    @InjectModel(PlatformStaff.name) private readonly staff: Model<PlatformStaff>,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async restaurantUsers(restaurantId: Types.ObjectId, permission = 'orders.view') {
    const list = await this.employees.find({ restaurantId, status: 'ACTIVE' }).lean();
    return list.filter((m) => effectiveRestaurantPermissions(m).has(permission as never)).map((m) => m.userId);
  }

  async opsUsers() {
    const list = await this.staff.find({ status: 'ACTIVE' }).lean();
    return list.filter((s) => platformRole(s.roleCode)?.permissions.includes('ops.orders.view_all')).map((s) => s.userId);
  }

  private async load(orderId: string) {
    return this.orders.findOne({ _id: orderId }).setOptions({ crossTenant: true }).lean();
  }

  private broadcast(o: Order & { _id: Types.ObjectId }, event: string) {
    const payload = { orderId: String(o._id), number: o.number, status: o.status, seq: o.seq };
    this.realtime.toOrder(String(o._id), event, payload);
    this.realtime.toRestaurant(String(o.restaurantId), event, payload);
    this.realtime.toUser(String(o.customerId), event, payload);
    this.realtime.toOps(event, payload);
  }

  async created(orderId: string) {
    const o = await this.load(orderId);
    if (!o) return;
    this.broadcast(o, 'order.created');
    await this.notifications.notify({
      userIds: await this.restaurantUsers(o.restaurantId), eventKey: `order:${o._id}:created`, type: 'order.new',
      title: `Nouvelle commande ${o.number}`, body: `${o.items.reduce((s, i) => s + i.qty, 0)} article(s) — ${o.amounts.total} FCFA`,
      link: `/pro/${o.restaurantId}/commandes`, data: { orderId: String(o._id) },
    });
    await this.notifications.notify({
      userIds: [o.customerId], eventKey: `order:${o._id}:created`, type: 'order.received',
      title: `Commande ${o.number} reçue`, body: `Envoyée à ${o.restaurantSnapshot.name}. En attente de confirmation.`, link: `/commandes/${o._id}`,
    });
  }

  async statusChanged(orderId: string, status: OrderStatus, reason: string | null) {
    const o = await this.load(orderId);
    if (!o) return;
    this.broadcast(o, 'order.updated');
    const msg = CUSTOMER_MESSAGES[status];
    if (msg) {
      await this.notifications.notify({
        userIds: [o.customerId], eventKey: `order:${o._id}:${status}:${o.seq}`, type: `order.${status.toLowerCase()}`,
        title: `Commande ${o.number} — ${STATUS_LABELS_FR[status]}`, body: reason ? `${msg} Motif : ${reason}` : msg, link: `/commandes/${o._id}`,
      });
    }
    if (status === 'CANCELLED') {
      await this.notifications.notify({
        userIds: await this.restaurantUsers(o.restaurantId), eventKey: `order:${o._id}:cancelled:restaurant`, type: 'order.cancelled',
        title: `Commande ${o.number} annulée`, body: reason ?? '', link: `/pro/${o.restaurantId}/commandes`,
      });
    }
  }
}
