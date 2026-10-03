import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { FirebaseModule } from './firebase/firebase.module';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AppVersionModule } from './app-version/app-version.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthenticationModule } from './authentication/authentication.module';
import { ChatModule } from './chat/chat.module';
import { CommunitiesModule } from './communities/communities.module';

import { HelpRequestsModule } from './help-requests/help-requests.module';
import { MapModule } from './map/map.module';
import { VolunteerModule } from './volunteer/volunteer.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';
        const uri =
          configService.get<string>('MONGODB_URL') ??
          configService.get<string>('MONGODB_URI') ??
          (isProduction ? undefined : 'mongodb://127.0.0.1:27017/wehelp');

        if (!uri) {
          throw new Error(
            'MongoDB connection string is missing. Set MONGODB_URL (or MONGODB_URI).',
          );
        }

        return {
          uri,
          lazyConnection: true,
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
          connectionFactory: (connection: Connection) => {
            connection.on('connected', () => console.log('MongoDB connected'));
            connection.on('disconnected', () =>
              console.warn('MongoDB disconnected'),
            );
            connection.on('error', (error) =>
              console.error('MongoDB connection error:', error.message),
            );
            return connection;
          },
        };
      },
    }),
    FirebaseModule,
    AuthenticationModule,
    VolunteerModule,
    AdminModule,
    ChatModule,

    HelpRequestsModule,
    AlertsModule,
    AppVersionModule,
    CommunitiesModule,
    MapModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
