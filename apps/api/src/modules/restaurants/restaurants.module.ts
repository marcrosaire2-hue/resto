import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminRestaurantsController, RestaurantStaffController } from './restaurants.controller';
import { RestaurantProfileController } from './profile.controller';
import { RestaurantProfileService } from './profile.service';
import { RestaurantsService } from './restaurants.service';

@Module({
  imports: [AuthModule, UsersModule, MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [AdminRestaurantsController, RestaurantStaffController, RestaurantProfileController],
  providers: [RestaurantsService, RestaurantProfileService],
})
export class RestaurantsModule {}
