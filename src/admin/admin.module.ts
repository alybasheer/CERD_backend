import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthenticationModule } from '../authentication/authentication.module';
import { VolunteerSchema } from '../volunteer/volunteer.schema';
import { SignupSchema } from '../authentication/signup.schema';
import { HelpRequestSchema } from '../help-requests/help-request.schema';
import { ChatModule } from '../chat/chat.module';
import { RatingsModule } from '../ratings/ratings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: 'Volunteer', schema: VolunteerSchema },
            { name: 'Signup', schema: SignupSchema },
            { name: 'HelpRequest', schema: HelpRequestSchema },
        ]),
        AuthenticationModule,
        ChatModule,
        RatingsModule,
        NotificationsModule,
    ],
    providers: [AdminService],
    controllers: [AdminController],
})
export class AdminModule { }
