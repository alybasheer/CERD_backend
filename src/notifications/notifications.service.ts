import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FirebaseService } from '../firebase/firebase.service';
import { DeviceTokenDocument } from './device-token.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel('DeviceToken') private readonly devices: Model<DeviceTokenDocument>,
    private readonly firebase: FirebaseService,
  ) {}

  async register(userId: string, token: string, platform: string) {
    return this.devices.findOneAndUpdate(
      { token },
      { $set: { userId: new Types.ObjectId(userId), platform, lastSeenAt: new Date() } },
      { upsert: true, new: true },
    ).exec();
  }

  async remove(userId: string, token: string) {
    await this.devices.deleteOne({ userId: new Types.ObjectId(userId), token }).exec();
  }

  async notifyUsers(userIds: string[], title: string, body: string, data: Record<string, string>) {
    const uniqueIds = [...new Set(userIds)].filter(Types.ObjectId.isValid);
    if (!uniqueIds.length) return 0;
    const devices = await this.devices.find({ userId: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) } }).exec();
    const tokens = [...new Set(devices.map((device) => device.token))];
    const result = await this.firebase.sendToTokens(tokens, { title, body }, data);
    if (result.invalidTokens.length) await this.devices.deleteMany({ token: { $in: result.invalidTokens } }).exec();
    return result.successCount;
  }
}
