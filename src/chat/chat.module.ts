import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { MongooseModule } from '@nestjs/mongoose';
import { SignupSchema } from '../authentication/signup.schema';
import { HelpRequestSchema } from '../help-requests/help-request.schema';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { MessageSchema } from './chat.schema';
import { ChatService } from './chat.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: 'Message', schema: MessageSchema },
            { name: 'Signup', schema: SignupSchema },
            { name: 'HelpRequest', schema: HelpRequestSchema },
        ]),
        AuthenticationModule,
        NotificationsModule,
    ],
    providers: [ChatGateway, ChatService],
    controllers: [ChatController],
    exports: [ChatService, ChatGateway],
})
export class ChatModule { }
