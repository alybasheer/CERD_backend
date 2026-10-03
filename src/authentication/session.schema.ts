import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, unique: true, select: false }) tokenHash: string;
  @Prop({ default: null }) revokedAt: Date | null;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ revokedAt: 1 }, { expireAfterSeconds: 86400 });
