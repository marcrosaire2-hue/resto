import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Model, Types } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { env } from '../../common/env';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE } from '../auth/cookies';
import { Order } from '../orders/order.schema';
import { PermissionService } from '../rbac/permission.service';
import { RealtimeService } from './realtime.service';

function readCookie(header: string | undefined, name: string) {
  return header?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * Temps réel (Socket.IO). L'utilisateur est authentifié par son cookie de session ;
 * chaque abonnement (commande, restaurant, opérations) est vérifié côté serveur.
 * À la reconnexion, le client recharge l'état via l'API REST (source de vérité).
 */
@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: (_origin: string | undefined, cb: (err: Error | null, allow?: string) => void) => cb(null, env().WEB_ORIGIN), credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger('Realtime');
  constructor(
    private readonly realtime: RealtimeService,
    private readonly auth: AuthService,
    private readonly perms: PermissionService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
  }

  handleConnection(socket: Socket) {
    // L'authentification est asynchrone : les abonnements attendent sa fin (socket.data.ready).
    socket.data.ready = (async () => {
      const raw = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const session = raw ? await this.auth.resolveSession(decodeURIComponent(raw)) : null;
      if (!session) {
        socket.emit('auth_error', { code: 'UNAUTHENTICATED' });
        socket.disconnect(true);
        return null;
      }
      socket.data.userId = session.userId;
      await socket.join(`user:${session.userId}`);
      return session.userId;
    })();
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { type?: string; id?: string }) {
    const userId = (await (socket.data.ready as Promise<string | null> | undefined)) ?? null;
    if (!userId || (typeof body?.id !== 'string' && body?.type !== 'ops')) return { ok: false };
    try {
      if (body.type === 'restaurant' && /^[a-f0-9]{24}$/i.test(body.id!)) {
        const access = await this.perms.restaurant(userId, new Types.ObjectId(body.id));
        if (access.kind !== 'ok' || !access.permissions.has('orders.view')) return { ok: false };
        await socket.join(`restaurant:${body.id}`);
        return { ok: true };
      }
      if (body.type === 'order' && /^[a-f0-9]{24}$/i.test(body.id!)) {
        const o = await this.orders.findOne({ _id: body.id }, { customerId: 1, restaurantId: 1 }).setOptions({ crossTenant: true }).lean();
        if (!o) return { ok: false };
        let allowed = String(o.customerId) === userId;
        if (!allowed) {
          const access = await this.perms.restaurant(userId, o.restaurantId);
          allowed = access.kind === 'ok' && access.permissions.has('orders.view');
        }
        if (!allowed) allowed = (await this.perms.platform(userId)).permissions.has('ops.orders.view_all');
        if (!allowed) return { ok: false };
        await socket.join(`order:${body.id}`);
        return { ok: true };
      }
      if (body.type === 'ops' && (await this.perms.platform(userId)).permissions.has('ops.orders.view_all')) {
        await socket.join('ops');
        return { ok: true };
      }
    } catch (e) {
      this.logger.warn(`Abonnement refusé : ${(e as Error).message}`);
    }
    return { ok: false };
  }
}
