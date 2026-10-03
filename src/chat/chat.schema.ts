import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
    @Prop({ type: Types.ObjectId, ref: 'Signup', required: true })
    senderId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Signup', required: true })
    receiverId: Types.ObjectId;

    @Prop({ required: true })
    content: string;

    @Prop({ type: Types.ObjectId, ref: 'HelpRequest' })
    requestId?: Types.ObjectId;

    @Prop({ type: [Types.ObjectId], ref: 'Signup', default: [] })
    hiddenFor: Types.ObjectId[];

    @Prop({ default: false })
    isRead: boolean;

    @Prop({ default: Date.now })
    timestamp: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Index for efficient queries
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
MessageSchema.index({ receiverId: 1, isRead: 1 });
MessageSchema.index({ requestId: 1, createdAt: 1 });
