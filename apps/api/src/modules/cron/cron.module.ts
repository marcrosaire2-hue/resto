import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, HttpCode, Module, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { env } from '../../common/env';
import { Public, SkipCsrf } from '../../common/request-context';
import { DispatchModule } from '../dispatch/dispatch.module';
import { OpsService } from '../dispatch/ops.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersScheduler } from '../orders/orders.scheduler';

/** Compare le jeton reçu au secret sans fuite d'information par le temps de réponse. */
function sameSecret(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Tâches de fond déclenchées de l'extérieur (Vercel Cron, chaque minute) quand l'API tourne sans serveur permanent
 * (BACKGROUND_JOBS=cron). Protégées par CRON_SECRET : Vercel envoie « Authorization: Bearer <CRON_SECRET> ».
 * Les traitements sont idempotents (marquage atomique) : un double déclenchement n'envoie pas deux alertes.
 */
@ApiExcludeController()
@Controller('internal/cron')
export class CronController {
  constructor(private readonly orders: OrdersScheduler, private readonly ops: OpsService) {}

  private check(authorization?: string) {
    const secret = env().CRON_SECRET;
    if (!secret) throw new ServiceUnavailableException({ error: 'CRON_DISABLED', message: 'CRON_SECRET n’est pas configuré.' });
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!sameSecret(token, secret)) throw new UnauthorizedException({ error: 'UNAUTHORIZED', message: 'Jeton invalide.' });
  }

  /** Restaurants sans réponse : alerte, puis annulation automatique si le paramètre est configuré. */
  @Public() @SkipCsrf() @SkipThrottle() @Get('orders') @HttpCode(200)
  async orderDeadlines(@Headers('authorization') authorization?: string) {
    this.check(authorization);
    await this.orders.runOnce();
    return { ok: true };
  }

  /** Commandes prêtes sans livreur : alerte aux opérations. */
  @Public() @SkipCsrf() @SkipThrottle() @Get('ops') @HttpCode(200)
  async opsAlerts(@Headers('authorization') authorization?: string) {
    this.check(authorization);
    const alerts = await this.ops.runAlerts();
    return { ok: true, alerts };
  }
}

@Module({ imports: [OrdersModule, DispatchModule], controllers: [CronController] })
export class CronModule {}
