import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SignupDocument } from '../authentication/signup.schema';
import { HelpRequestDocument } from '../help-requests/help-request.schema';
import { MessageDocument } from './chat.schema';

@Injectable()
export class ChatService {
    constructor(
        @InjectModel('Message') private messageModel: Model<MessageDocument>,
        @InjectModel('Signup') private signupModel: Model<SignupDocument>,
        @InjectModel('HelpRequest') private helpRequestModel: Model<HelpRequestDocument>,
    ) { }

    async saveMessage(senderId: string, receiverId: string, content: string, requestId?: string) {
        if (requestId) await this.assertActiveRequestChat(requestId, senderId, receiverId);
        const message = new this.messageModel({
            senderId: new Types.ObjectId(senderId),
            receiverId: new Types.ObjectId(receiverId),
            content,
            requestId: requestId ? new Types.ObjectId(requestId) : undefined,
            isRead: false,
            timestamp: new Date(),
        });
        return message.save();
    }

    async getConversation(userId: string, otherUserId: string, limit = 50, requestId?: string) {
        if (requestId) await this.assertActiveRequestChat(requestId, userId, otherUserId);
        // Convert string IDs to ObjectId for proper comparison
        const userObjectId = new Types.ObjectId(userId);
        const otherUserObjectId = new Types.ObjectId(otherUserId);

        return this.messageModel
            .find({
                $or: [
                    { senderId: userObjectId, receiverId: otherUserObjectId },
                    { senderId: otherUserObjectId, receiverId: userObjectId },
                ],
                hiddenFor: { $ne: userObjectId },
                requestId: requestId ? new Types.ObjectId(requestId) : { $exists: false },
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('senderId', 'username email')
            .populate('receiverId', 'username email')
            .exec();
    }

    async markMessagesAsRead(userId: string, senderId: string) {
        // Convert string IDs to ObjectId for proper comparison
        const userObjectId = new Types.ObjectId(userId);
        const senderObjectId = new Types.ObjectId(senderId);

        return this.messageModel.updateMany(
            { receiverId: userObjectId, senderId: senderObjectId, isRead: false },
            { isRead: true },
        );
    }

    async getUnreadCount(userId: string) {
        // Convert string ID to ObjectId for proper comparison
        const userObjectId = new Types.ObjectId(userId);

        return this.messageModel.countDocuments({
            receiverId: userObjectId,
            isRead: false,
        });
    }

    async getUserConversations(userId: string) {
        // Get unique conversations (last message from each user)
        const conversations = await this.messageModel.aggregate([
            {
                $match: {
                    $or: [{ senderId: new Types.ObjectId(userId) }, { receiverId: new Types.ObjectId(userId) }],
                    hiddenFor: { $ne: new Types.ObjectId(userId) },
                    requestId: { $exists: false },
                },
            },
            {
                $addFields: {
                    otherUserId: {
                        $cond: [{ $eq: ['$senderId', new Types.ObjectId(userId)] }, '$receiverId', '$senderId'],
                    },
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $group: {
                    _id: '$otherUserId',
                    lastMessage: { $first: '$$ROOT' },
                },
            },
            {
                $lookup: {
                    from: 'signups',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            {
                $unwind: '$user',
            },
            {
                $project: {
                    _id: 1,
                    user: {
                        _id: 1,
                        username: 1,
                        email: 1,
                    },
                    lastMessage: {
                        content: 1,
                        timestamp: 1,
                        isRead: 1,
                        senderId: 1,
                    },
                },
            },
            {
                $sort: { 'lastMessage.timestamp': -1 },
            },
        ]);

        return conversations;
    }

    async deleteMessage(messageId: string, userId: string) {
        const message = await this.messageModel.findById(messageId);

        if (!message) {
            return null;
        }

        if (message.senderId.toString() !== userId && message.receiverId.toString() !== userId) {
            return null;
        }
        return this.messageModel.findByIdAndUpdate(
            messageId,
            { $addToSet: { hiddenFor: new Types.ObjectId(userId) } },
            { new: true },
        );
    }

    async deleteConversation(userId: string, otherUserId: string) {
        const userObjectId = new Types.ObjectId(userId);
        const otherUserObjectId = new Types.ObjectId(otherUserId);

        return this.messageModel.updateMany({
            $or: [
                { senderId: userObjectId, receiverId: otherUserObjectId },
                { senderId: otherUserObjectId, receiverId: userObjectId },
            ],
            requestId: { $exists: false },
        }, { $addToSet: { hiddenFor: userObjectId } });
    }

    async deleteRequestConversation(requestId: string) {
        return this.messageModel.deleteMany({ requestId: new Types.ObjectId(requestId) }).exec();
    }

    private async assertActiveRequestChat(requestId: string, senderId: string, receiverId: string) {
        if (!Types.ObjectId.isValid(requestId)) throw new BadRequestException('Invalid request chat');
        const request: any = await this.helpRequestModel.findById(requestId).exec();
        if (!request || request.status !== 'accepted' || !request.acceptedBy) {
            throw new BadRequestException('This request chat is no longer active');
        }
        const participants = new Set([request.userId.toString(), request.acceptedBy.toString()]);
        if (!participants.has(senderId) || !participants.has(receiverId) || senderId === receiverId) {
            throw new BadRequestException('Only request participants can use this chat');
        }
    }

    async getCoordinationContacts(userId: string, role = 'user') {
        if (role === 'volunteer') {
            const volunteers = await this.signupModel
                .find({ role: 'volunteer', _id: { $ne: new Types.ObjectId(userId) } })
                .select('_id username email role')
                .exec();

            const volunteerContacts = volunteers.map((user: any) => ({
                    _id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    contactType: 'volunteer',
                }));

            return {
                requestees: [],
                volunteers: volunteerContacts,
            };
        }

        return {
            requestees: [],
            volunteers: [],
        };
    }
}
