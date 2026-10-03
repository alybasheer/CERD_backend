import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityDocument = Community & Document;
export type CommunityMessageDocument = CommunityMessage & Document;

@Schema({ timestamps: true })
export class Community {
    @Prop({ type: Types.ObjectId, ref: 'Signup', required: true })
    createdBy: Types.ObjectId;

    @Prop({ required: true })
    title: string;

    @Prop({ required: true })
    details: string;

    @Prop({ required: true })
    category: string;

    @Prop({ required: true })
    timeNeeded: string;

    @Prop({ required: true })
    locationName: string;

    @Prop({
        type: {
            type: String,
            enum: ['Point'],
            required: true,
        },
        coordinates: {
            type: [Number],
            required: true,
        },
    })
    location: { type: string; coordinates: number[] };

    @Prop({ required: true, min: 1 })
    peopleRequired: number;

    @Prop({ type: [Types.ObjectId], ref: 'Signup', default: [] })
    members: Types.ObjectId[];

    @Prop({ required: true, default: 'open', enum: ['open', 'started', 'completed', 'cancelled'] })
    status: string;

    @Prop()
    startedAt?: Date;

    @Prop()
    endsAt?: Date;

    @Prop({ type: [Types.ObjectId], ref: 'Signup', default: [] })
    hiddenFor: Types.ObjectId[];
}

@Schema({ timestamps: true })
export class CommunityMessage {
    @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
    communityId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Signup', required: true })
    senderId: Types.ObjectId;

    @Prop({ required: true })
    content: string;
}

export const CommunitySchema = SchemaFactory.createForClass(Community);
export const CommunityMessageSchema = SchemaFactory.createForClass(CommunityMessage);

CommunitySchema.index({ location: '2dsphere' });
CommunitySchema.index({ category: 1, status: 1 });
CommunitySchema.index({ status: 1, endsAt: 1 });
CommunityMessageSchema.index({ communityId: 1, createdAt: 1 });
