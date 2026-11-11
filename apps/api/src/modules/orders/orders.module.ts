import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AddressesService } from '../customers/addresses.service';
import { CartService } from '../customers/cart.service';
import { Cart, CartSchema, CustomerAddress, CustomerAddressSchema } from '../customers/customer.schemas';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { User, UserSchema } from '../users/user.schema';
import { CheckoutService } from './checkout.service';
import { Order, OrderIssue, OrderIssueSchema, OrderSchema, OrderStatusHistory, OrderStatusHistorySchema } from './order.schema';
import { RestaurantOpsService } from './restaurant-ops.service';
import { Incident, IncidentSchema } from '../couriers/courier.schemas';
import { OrderEventsService } from './order-events.service';
import { CustomerOrdersController, OpsOrdersController, RestaurantKitchenController, RestaurantOrdersController } from './orders.controller';
import { OrdersScheduler } from './orders.scheduler';
import { OrdersService } from './orders.service';
import { CommercialModuleRef } from './refs';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderStatusHistory.name, schema: OrderStatusHistorySchema },
      { name: OrderIssue.name, schema: OrderIssueSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: CustomerAddress.name, schema: CustomerAddressSchema },
      { name: Cart.name, schema: CartSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CustomerOrdersController, RestaurantOrdersController, RestaurantKitchenController, OpsOrdersController],
  providers: [RestaurantOpsService, AddressesService, CartService, CheckoutService, OrdersService, OrderEventsService, OrdersScheduler, CommercialModuleRef, RealtimeGateway],
  exports: [OrdersService, OrdersScheduler, OrderEventsService],
})
export class OrdersModule {}
