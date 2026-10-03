import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type SignupDocument = Signup & Document;

const GeoPointSchema = new MongooseSchema(
    {
        type: { type: String, enum: ['Point'], default: 'Point', required: true },
        coordinates: { type: [Number], required: true },
    },
    { _id: false },
);

@Schema({ timestamps: true })
export class Signup {
    @Prop({ required: true })
    username: string;
    @Prop({ required: true })
    email: string;
    @Prop({ required: true, select: false })
    password: string;
    @Prop({ required: false, default: 'user' })
    role: string;
    @Prop({ default: false })
    blocked: boolean;
    @Prop()
    moderationReason?: string;
    @Prop()
    moderatedAt?: Date;
    @Prop()
    moderatedBy?: string;
    @Prop({ required: false })
    profileImage?: string;
    /**
     * Frontend sends latitude/longitude, backend stores GeoJSON so MongoDB
     * can run nearby volunteer and map queries with a 2dsphere index.
     */
    @Prop({ type: GeoPointSchema, required: false })
    location?: { type: string; coordinates: number[] };
    @Prop({ required: false })
    googleId?: string; // Google OAuth ID for Google Sign-In users
}
export const SignupSchema = SchemaFactory.createForClass(Signup);

// Explicit password selection for authentication must never expose it in JSON.
SignupSchema.set('toJSON', {
    transform: (_document, result) => {
        Reflect.deleteProperty(result, 'password');
        return result;
    },
});

SignupSchema.index({ location: '2dsphere' }, { partialFilterExpression: { 'location.type': 'Point' } });
