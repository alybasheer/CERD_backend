import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { FirebaseModule } from '../firebase/firebase.module';
import { FirebaseService } from '../firebase/firebase.service';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { SignupSchema } from './signup.schema';
import { authenticationJwtOptions } from './authentication.config';
import { SessionSchema } from './session.schema';
import { SessionService } from './session.service';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: 'Signup', schema: SignupSchema }, { name: 'Session', schema: SessionSchema }]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: authenticationJwtOptions,
        }),
        FirebaseModule,
    ],
    providers: [AuthenticationService, SessionService],
    controllers: [AuthenticationController],
    exports: [AuthenticationService, JwtModule, SessionService],
})
export class AuthenticationModule { }
