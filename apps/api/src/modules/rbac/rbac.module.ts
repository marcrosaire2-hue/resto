import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Restaurant, RestaurantSchema } from '../restaurants/restaurant.schema';
import { PermissionService } from './permission.service';
import { PlatformStaff, PlatformStaffSchema } from './platform-staff.schema';
import { PermissionGuard } from './require-permission';
import { RestaurantEmployee, RestaurantEmployeeSchema } from './restaurant-employee.schema';

export const RBAC_MODELS = MongooseModule.forFeature([
  { name: PlatformStaff.name, schema: PlatformStaffSchema },
  { name: RestaurantEmployee.name, schema: RestaurantEmployeeSchema },
  { name: Restaurant.name, schema: RestaurantSchema },
]);

@Global()
@Module({
  imports: [RBAC_MODELS],
  providers: [PermissionService, PermissionGuard],
  exports: [PermissionService, PermissionGuard, RBAC_MODELS],
})
export class RbacModule {}
