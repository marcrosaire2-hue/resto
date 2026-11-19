import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../common/env';
import { FinanceService } from './finance.service';

/**
 * Minuterie financière (serveur permanent, ex. Render) :
 * - chaque minute : virements automatiques aux restaurants (inactif tant que AUTO_PAYOUTS n'est pas « on ») ;
 * - chaque heure : rappels de fin de mois gratuit.
 * Les deux traitements restent appelables depuis une tâche planifiée externe (FinanceService.autoPayoutSweep / contractNotices).
 */
@Injectable()
export class PayoutsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Finance');
  private timer: NodeJS.Timeout | null = null;
  private lastNotices = 0;
  constructor(private readonly finance: FinanceService) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 60_000);
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    try {
      await this.finance.autoPayoutSweep();
      if (Date.now() - this.lastNotices >= 3_600_000) { this.lastNotices = Date.now(); await this.finance.contractNotices(); }
    } catch (e) { this.logger.error((e as Error).message); }
  }
}
