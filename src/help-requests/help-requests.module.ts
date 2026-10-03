import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SignupSchema } from '../authentication/signup.schema';
import { ChatModule } from '../chat/chat.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RoutingService } from '../common/services/routing.service';
import { RatingsModule } from '../ratings/ratings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VolunteerSchema } from '../volunteer/volunteer.schema';
import { HelpRequestSchema } from './help-request.schema';
import { HelpRequestMediaService } from './help-request-media.service';
import { HelpRequestsController } from './help-requests.controller';
import { HelpRequestsService } from './help-requests.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: 'HelpRequest', schema: HelpRequestSchema },
            { name: 'Signup', schema: SignupSchema },
            { name: 'Volunteer', schema: VolunteerSchema },
        ]),
        AuthenticationModule,
        ChatModule,
        RatingsModule,
        NotificationsModule,
    ],
    providers: [HelpRequestsService, HelpRequestMediaService, JwtAuthGuard, RoutingService],
    controllers: [HelpRequestsController],
    exports: [HelpRequestsService],
})
export class HelpRequestsModule {}
