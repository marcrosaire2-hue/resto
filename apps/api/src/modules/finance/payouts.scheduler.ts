import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../common/env';
import { FinanceService } from './finance.service';

/** Minuterie des virements automatiques (serveur permanent, ex. Render). Passe aussi par FinanceService.autoPayoutSweep(), appelable depuis une tâche planifiée. */
@Injectable()
export class PayoutsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Versements');
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly finance: FinanceService) {}

  onApplicationBootstrap() {
    const e = env();
    if (e.NODE_ENV === 'test' || e.AUTO_PAYOUTS !== 'on') return;
    this.timer = setInterval(() => void this.finance.autoPayoutSweep().catch((err) => this.logger.error((err as Error).message)), 60_000);
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }
}
