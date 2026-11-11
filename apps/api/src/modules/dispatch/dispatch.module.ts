import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Courier, CourierSchema, Delivery, DeliverySchema, Incident, IncidentSchema } from '../couriers/courier.schemas';
import { CouriersService } from '../couriers/couriers.service';
import { Order, OrderSchema } from '../orders/order.schema';
import { OrdersModule } from '../orders/orders.module';
import { User, UserSchema } from '../users/user.schema';
import { AdminCouriersController, CourierController, OpsController } from './dispatch.controllers';
import { DeliveriesService } from './deliveries.service';
import { IncidentsService } from './incidents.service';
import { OpsService } from './ops.service';

@Module({
  imports: [
    OrdersModule,
    MongooseModule.forFeature([
      { name: Courier.name, schema: CourierSchema },
      { name: Delivery.name, schema: DeliverySchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CourierController, OpsController, AdminCouriersController],
  providers: [CouriersService, DeliveriesService, IncidentsService, OpsService],
  exports: [IncidentsService, OpsService, DeliveriesService],
})
export class DispatchModule {}
