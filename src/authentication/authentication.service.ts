import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';

import { FirebaseService } from '../firebase/firebase.service';
import { SignupDocument } from './signup.schema';

@Injectable()
export class AuthenticationService {
    constructor(
        @InjectModel('Signup') private signupModel: Model<SignupDocument>,
        private readonly jwtService: JwtService,
        private readonly firebaseService: FirebaseService,
    ) { }

    private configuredAdmin(email: string, password: string) {
        const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) {
            return null;
        }
        return { _id: 'admin-id', email: adminEmail, username: 'admin', role: 'admin' };
    }

    private signUserToken(user: any) {
        // Ensure `sub` is always a string (ObjectId may be an object);
        // JWT spec allows `sub` to be string or number, but treating it
        // consistently as string avoids frontend type issues.
        const id = user && (user._id ?? user.id ?? user);
        const sub = typeof id === 'string' ? id : id?.toString();
        const payload = { sub: sub, email: user.email, role: user.role ?? 'user' };
        return this.jwtService.sign(payload);
    }

    async create(data: { username: string; email: string; password: string }) {
        const username = data.username.trim();
        const email = data.email.trim().toLowerCase();

        if (!username || !email || !data.password) {
            throw new BadRequestException('username, email and password are required');
        }

        // if creating admin via env credentials, just return token for admin
        const admin = this.configuredAdmin(email, data.password);
        if (admin) {
            const token = this.signUserToken(admin);
            return { user: admin, access_token: token };
        }

        const existingUser = await this.signupModel.findOne({ email }).select('_id').exec();
        if (existingUser) {
            throw new ConflictException('Email already registered. Please log in or use a different email.');
        }

        const hashed = await bcrypt.hash(data.password, 10);
        const created = new this.signupModel({ username, email, password: hashed, role: 'user' });

        try {
            const saved = await created.save();
            const token = this.signUserToken(saved);
            return { user: saved, access_token: token };
        } catch (error) {
            if (error?.code === 11000) {
                throw new ConflictException('Email already registered. Please log in or use a different email.');
            }
            throw error;
        }
    }

    async findByEmail(email: string) {
        return this.signupModel.findOne({ email: email.trim().toLowerCase() }).exec();
    }

    async validateUser(email: string, password: string) {
        const normalizedEmail = email.trim().toLowerCase();

        // admin shortcut
        const admin = this.configuredAdmin(normalizedEmail, password);
        if (admin) {
            const token = this.signUserToken(admin);
            return { user: admin, access_token: token };
        }

        const user = await this.signupModel.findOne({ email: normalizedEmail }).select('+password').exec();
        if (!user) return null;
        const match = await bcrypt.compare(password, user.password);
        if (!match) return null;
        const token = this.signUserToken(user);
        return { user, access_token: token };
    }

    async updatePassword(email: string, newPassword: string) {
        const user = await this.findByEmail(email);
        if (!user) throw new NotFoundException('User not found');
        user.password = await bcrypt.hash(newPassword, 10);
        return user.save();
    }

    async updateRoleById(userId: string, role: string) {
        const user = await this.signupModel.findById(userId).exec();
        if (!user) throw new NotFoundException('User not found');
        user.role = role;
        return user.save();
    }

    async updateProfileImageById(userId: string, profileImage: string) {
        const user = await this.signupModel.findById(userId).exec();
        if (!user) throw new NotFoundException('User not found');
        user.profileImage = profileImage;
        return user.save();
    }

    /**
     * Update a user's last known location (latitude, longitude).
     * Converts the incoming lat/lng to GeoJSON Point format for
     * MongoDB geospatial queries ($near).
     *
     * Frontend still sends { latitude, longitude } — conversion
     * to GeoJSON { type:'Point', coordinates:[lng,lat] } happens here.
     */
    async updateLocationById(userId: string, latitude: number, longitude: number) {
        const user = await this.signupModel.findById(userId).exec();
        if (!user) throw new NotFoundException('User not found');
        user.location = {
            type: 'Point',
            coordinates: [longitude, latitude], // GeoJSON: [lng, lat]
        } as any;
        return user.save();
    }

    async loginWithGoogle(idToken: string, username?: string) {
        try {
            const googleUser = await this.firebaseService.verifyGoogleToken(idToken);

            if (!googleUser.email) {
                throw new BadRequestException('Email not found in Google token');
            }

            let user = await this.findByEmail(googleUser.email);

            if (!user) {
                const created = new this.signupModel({
                    username: username || googleUser.name || googleUser.email.split('@')[0],
                    email: googleUser.email,
                    password: 'google-oauth-' + googleUser.uid,
                    role: 'user',
                    googleId: googleUser.uid,
                });
                user = await created.save();
            }

            const token = this.signUserToken(user);
            return { user, access_token: token };
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException('Google login failed. Please try again.');
        }
    }
}
