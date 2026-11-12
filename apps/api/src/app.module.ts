import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { env } from './common/env';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GrowthModule } from './modules/growth/growth.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SupportModule } from './modules/support/support.module';
import { AdminConsoleModule } from './modules/admin-console/admin-console.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { CuisinesModule } from './modules/cuisines/cuisines.module';
import { GeoModule } from './modules/geo/geo.module';
import { MenuModule } from './modules/menu/menu.module';
import { CsrfGuard, SessionGuard } from './modules/auth/auth.guards';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/brevo.mailer';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { PlatformStaffModule } from './modules/platform-staff/platform-staff.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: env().MONGODB_URI, autoIndex: true }) }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({ throttlers: [{ name: 'default', ttl: 60_000, limit: env().THROTTLE_LIMIT_PER_MIN }] }),
    }),
    AuditModule,
    MailModule,
    SettingsModule,
    RbacModule,
    AuthModule,
    GeoModule,
    CuisinesModule,
    GrowthModule,
    MenuModule,
    PromotionsModule,
    RestaurantsModule,
    CatalogModule,
    RealtimeModule,
    NotificationsModule,
    LedgerModule,
    CommercialModule,
    OrdersModule,
    DispatchModule,
    FinanceModule,
    PaymentsModule,
    ReviewsModule,
    SupportModule,
    AdminConsoleModule,
    PlatformStaffModule,
    MediaModule,
    HealthModule,
  ],
  providers: [
    // Ordre d'exécution : limitation de débit → CSRF → session.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
export class AppModule {}
