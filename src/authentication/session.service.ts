import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { SessionDocument } from './session.schema';
import { SignupDocument } from './signup.schema';

export interface SessionIdentity { sub: string; role: string; sid: string }

@Injectable()
export class SessionService {
  constructor(
    @InjectModel('Session') private readonly sessions: Model<SessionDocument>,
    @InjectModel('Signup') private readonly accounts: Model<SignupDocument>,
    private readonly jwt: JwtService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async account(userId: string) {
    if (userId === 'admin-id' && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      return { _id: userId, username: 'admin', email: process.env.ADMIN_EMAIL, role: 'admin' };
    }
    if (!Types.ObjectId.isValid(userId)) throw new UnauthorizedException('Invalid account');
    const user = await this.accounts.findById(userId).exec();
    if (!user || user.blocked) throw new UnauthorizedException('Account unavailable');
    return user;
  }

  async create(userId: string) {
    const user = await this.account(userId);
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.sessions.create({ userId, tokenHash: this.hash(refreshToken) });
    return {
      user,
      access_token: this.jwt.sign({ sub: userId, sid: session.id, role: user.role }),
      refresh_token: refreshToken,
    };
  }

  async refresh(token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('Invalid session');
    }
    const session = await this.sessions.findOne({ tokenHash: this.hash(token), revokedAt: null }).exec();
    if (!session) throw new UnauthorizedException('Session ended');
    const user = await this.account(session.userId);
    return { user, access_token: this.jwt.sign({ sub: session.userId, sid: session.id, role: user.role }) };
  }

  async authenticate(token: string): Promise<SessionIdentity> {
    let payload: SessionIdentity;
    try { payload = this.jwt.verify<SessionIdentity>(token); }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
    if (!payload.sid || !Types.ObjectId.isValid(payload.sid)) throw new UnauthorizedException('Please sign in again');
    const session = await this.sessions.findOne({ _id: payload.sid, userId: payload.sub, revokedAt: null }).exec();
    if (!session) throw new UnauthorizedException('Session ended');
    const user = await this.account(payload.sub);
    return { sub: payload.sub, sid: payload.sid, role: user.role };
  }

  async revoke(token: unknown) {
    if (typeof token === 'string' && token.length === 43) {
      await this.sessions.updateOne({ tokenHash: this.hash(token), revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
    }
    return { success: true };
  }

  async revokeAccount(userId: string) {
    await this.sessions.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
  }
}
