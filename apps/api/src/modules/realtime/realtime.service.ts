import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Diffusion temps réel. Sans serveur (scripts, tests sans socket), les émissions sont simplement ignorées. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  attach(server: Server) { this.server = server; }
  toUser(userId: string, event: string, payload: unknown) { this.server?.to(`user:${userId}`).emit(event, payload); }
  toRestaurant(restaurantId: string, event: string, payload: unknown) { this.server?.to(`restaurant:${restaurantId}`).emit(event, payload); }
  toOrder(orderId: string, event: string, payload: unknown) { this.server?.to(`order:${orderId}`).emit(event, payload); }
  toOps(event: string, payload: unknown) { this.server?.to('ops').emit(event, payload); }
}
