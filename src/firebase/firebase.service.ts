import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private firebaseApp: admin.app.App;

  onModuleInit() {
    if (admin.apps.length) {
      this.firebaseApp = admin.apps[0]!;
      return;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      try {
        const credential = admin.credential.cert(JSON.parse(serviceAccountJson));
        this.firebaseApp = admin.initializeApp({ credential });
        console.log('Firebase Admin SDK initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
        return;
      } catch (error) {
        console.error(
          'Firebase: FIREBASE_SERVICE_ACCOUNT_JSON is malformed, falling back to serviceAccountKey.json/applicationDefault:',
          (error as Error).message,
        );
      }
    }

    async sendToTokens(tokens: string[], notification: { title: string; body: string }, data: Record<string, string>) {
        if (!this.firebaseApp || tokens.length === 0) return { successCount: 0, invalidTokens: [] as string[] };
        const result = await admin.messaging().sendEachForMulticast({
            tokens,
            notification,
            data,
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
        });
        const invalidTokens = result.responses
            .map((response, index) => ({ response, token: tokens[index] }))
            .filter(({ response }) => {
                const code = response.error?.code;
                return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
            })
            .map(({ token }) => token);
        return { successCount: result.successCount, invalidTokens };
    }
}
