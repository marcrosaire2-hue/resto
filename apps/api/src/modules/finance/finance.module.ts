import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Courier, CourierSchema } from '../couriers/courier.schemas';
import { Order, OrderSchema } from '../orders/order.schema';
import { OrdersModule } from '../orders/orders.module';
import { User, UserSchema } from '../users/user.schema';
import { FinanceController, RestaurantFinanceController } from './finance.controller';
import { CashRemittance, CashRemittanceSchema, Payout, PayoutSchema, Refund, RefundSchema } from './finance.schemas';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    OrdersModule,
    MongooseModule.forFeature([
      { name: CashRemittance.name, schema: CashRemittanceSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: Courier.name, schema: CourierSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [FinanceController, RestaurantFinanceController],
  providers: [FinanceService, ReportsService],
  exports: [FinanceService],
})
export class FinanceModule {}
