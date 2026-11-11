import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { CsrfGuard, SessionGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { PasswordResetToken, PasswordResetTokenSchema, Session, SessionSchema } from './session.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, CsrfGuard],
  exports: [AuthService, SessionGuard, CsrfGuard],
})
export class AuthModule {}
