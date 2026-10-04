import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
    private firebaseApp?: admin.app.App;

    onModuleInit() {
        if (admin.apps.length) {
            this.firebaseApp = admin.apps[0] ?? undefined;
            return;
        }

        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (serviceAccountJson) {
            try {
                this.firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
                });
                return;
            } catch (error) {
                console.error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${(error as Error).message}`);
            }
        }

        const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            this.firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            return;
        }

        try {
            this.firebaseApp = admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
        } catch (error) {
            console.warn(`Firebase Admin is unavailable: ${(error as Error).message}`);
        }
    }

    async verifyGoogleToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
        if (!this.firebaseApp) {
            throw new UnauthorizedException('Google sign-in is temporarily unavailable');
        }
        try {
            return await this.firebaseApp.auth().verifyIdToken(idToken);
        } catch {
            throw new UnauthorizedException('Invalid Google sign-in token');
        }
    }

    async sendToTokens(
        tokens: string[],
        notification: { title: string; body: string },
        data: Record<string, string>,
    ) {
        if (!this.firebaseApp || tokens.length === 0) {
            return { successCount: 0, invalidTokens: [] as string[] };
        }

        const result = await this.firebaseApp.messaging().sendEachForMulticast({
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
                return code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token';
            })
            .map(({ token }) => token);

        return { successCount: result.successCount, invalidTokens };
    }
}
