import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { PlatformStaffController } from './platform-staff.controller';
import { PlatformStaffService } from './platform-staff.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [PlatformStaffController],
  providers: [PlatformStaffService],
  exports: [PlatformStaffService],
})
export class PlatformStaffModule {}
