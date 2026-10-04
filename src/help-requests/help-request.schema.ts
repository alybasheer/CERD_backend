import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HelpRequestDocument = HelpRequest & Document;

@Schema({ timestamps: true })
export class HelpRequest {
    @Prop({ type: Types.ObjectId, ref: 'Signup', required: true })
    userId: Types.ObjectId;

    @Prop({ required: false })
    title?: string;

    @Prop({ required: true })
    category: string;

    @Prop({ required: true })
    subCategory: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: false })
    image?: string;

    @Prop({ type: [String], default: [] })
    mediaUrls: string[];

    @Prop({ required: false })
    locationName?: string;

    @Prop({ required: true, default: false })
    isSos: boolean;

    /**
     * GeoJSON Point for MongoDB geospatial queries.
     * Stored as: { type: 'Point', coordinates: [longitude, latitude] }
     */
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

    @Prop({ required: true, default: 'open', enum: ['open', 'accepted', 'resolved', 'cancelled', 'expired'] })
    status: string;

    @Prop({ type: Types.ObjectId, ref: 'Signup', required: false })
    acceptedBy?: Types.ObjectId;

    /**
     * Number of nearby online volunteers notified when this request was
     * broadcast (used by the SOS status card).
     */
    @Prop({ required: true, default: 0 })
    notifiedCount: number;

    /**
     * SOS escalation stage (0 = none, 1..3 = escalated).
     */
    @Prop({ required: true, default: 0 })
    escalationLevel: number;

    @Prop({ required: false })
    lastEscalatedAt?: Date;

    /**
     * TTL field — MongoDB automatically deletes the document
     * when the current time exceeds this value.
     * Not set for SOS requests (they never expire).
     */
    @Prop({ required: true })
    acceptanceExpiresAt: Date;

    @Prop({ type: [Types.ObjectId], ref: 'Signup', default: [] })
    hiddenFor: Types.ObjectId[];

    @Prop()
    completedAt?: Date;
}

export const HelpRequestSchema = SchemaFactory.createForClass(HelpRequest);

// TTL index — MongoDB auto-deletes documents after expiresAt
HelpRequestSchema.index({ acceptanceExpiresAt: 1, status: 1 });
HelpRequestSchema.index({ userId: 1, createdAt: -1 });
HelpRequestSchema.index({ acceptedBy: 1, status: 1, completedAt: -1 });

// Compound 2dsphere index for filtered geospatial queries (find open requests near a location).
// NOTE: keep exactly ONE 2dsphere index per collection here — multiple 2dsphere indexes make
// MongoDB reject $geoNear with "more than one 2dsphere index ... unsure which to use".
HelpRequestSchema.index({ status: 1, location: '2dsphere' });
