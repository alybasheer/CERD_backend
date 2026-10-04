import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CommunityDocument, CommunityMessageDocument } from './community.schema';
import { CreateCommunityDto } from './dto/create-community.dto';
import { SendCommunityMessageDto } from './dto/send-community-message.dto';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_COMMUNITY_RADIUS_KM = 25;

@Injectable()
export class CommunitiesService {
    constructor(
        @InjectModel('Community') private communityModel: Model<CommunityDocument>,
        @InjectModel('CommunityMessage') private communityMessageModel: Model<CommunityMessageDocument>,
        private readonly notifications: NotificationsService,
    ) {}

    async create(userId: string, dto: CreateCommunityDto) {
        return new this.communityModel({
            createdBy: new Types.ObjectId(userId),
            title: dto.title,
            details: dto.details,
            category: dto.category,
            timeNeeded: dto.timeNeeded,
            locationName: dto.locationName,
            location: {
                type: 'Point',
                coordinates: [dto.longitude, dto.latitude],
            },
            peopleRequired: dto.peopleRequired,
            members: [new Types.ObjectId(userId)],
            status: 'open',
        }).save();
    }

    async findAll(filters: {
        category?: string;
        status?: string;
        latitude?: number;
        longitude?: number;
        radiusKm?: number;
    }) {
        await this.completeElapsedCommunities();
        const query: any = {};

        if (filters.category) query.category = filters.category;
        query.status = filters.status ?? { $ne: 'cancelled' };

        if (filters.latitude !== undefined && filters.longitude !== undefined) {
            const geoNearQuery: any = {};
            if (filters.category) geoNearQuery.category = filters.category;
            geoNearQuery.status = filters.status ?? { $ne: 'cancelled' };

            const pipeline = [
                {
                    $geoNear: {
                        near: { type: 'Point', coordinates: [filters.longitude, filters.latitude] },
                        distanceField: 'distanceMeters',
                        maxDistance: (filters.radiusKm ?? DEFAULT_COMMUNITY_RADIUS_KM) * 1000,
                        spherical: true,
                        query: geoNearQuery,
                    },
                },
                {
                    $lookup: {
                        from: 'signups',
                        localField: 'createdBy',
                        foreignField: '_id',
                        as: 'createdBy',
                    },
                },
                { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'signups',
                        localField: 'members',
                        foreignField: '_id',
                        as: 'members',
                    },
                },
                {
                    $addFields: {
                        distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] },
                        members: {
                            $map: {
                                input: '$members',
                                as: 'member',
                                in: {
                                    _id: '$$member._id',
                                    username: '$$member.username',
                                    email: '$$member.email',
                                    role: '$$member.role',
                                },
                            },
                        },
                    },
                },
                {
                    $project: {
                        _id: 1, title: 1, details: 1, category: 1, timeNeeded: 1,
                        locationName: 1, location: 1, peopleRequired: 1, status: 1,
                        createdAt: 1, updatedAt: 1, distanceKm: 1,
                        createdBy: { _id: 1, username: 1, email: 1, role: 1 },
                        members: 1,
                    },
                },
            ];

            return this.communityModel.aggregate(pipeline as any).exec();
        }

        return this.communityModel
            .find(query)
            .sort({ createdAt: -1 })
            .populate('createdBy', 'username email role')
            .populate('members', 'username email role')
            .exec();
    }

    async findById(id: string) {
        await this.completeElapsedCommunities();
        const community = await this.communityModel
            .findById(id)
            .populate('createdBy', 'username email role')
            .populate('members', 'username email role')
            .exec();

        if (!community) throw new NotFoundException('Community not found');
        return community;
    }

    async findJoinedHistory(userId: string) {
        await this.completeElapsedCommunities();
        const objectId = new Types.ObjectId(userId);
        return this.communityModel
            .find({
                members: objectId,
                status: { $in: ['completed', 'cancelled'] },
                hiddenFor: { $ne: objectId },
            })
            .sort({ endsAt: -1, updatedAt: -1 })
            .populate('createdBy', 'username email role')
            .populate('members', 'username email role')
            .exec();
    }

    async join(id: string, userId: string) {
        const community = await this.communityModel.findById(id).exec();
        if (!community) throw new NotFoundException('Community not found');
        if (community.status !== 'open') throw new BadRequestException('This community is not open for joining');

        const userObjectId = new Types.ObjectId(userId);
        if (!community.members.some((memberId) => memberId.toString() === userId)) {
            community.members.push(userObjectId);
        }

        return community.save();
    }

    async start(id: string, userId: string, role: string) {
        const community = await this.communityModel.findById(id).exec();
        if (!community) throw new NotFoundException('Community not found');
        this.ensureOwnerOrAdmin(community.createdBy.toString(), userId, role);
        if (community.status !== 'open') throw new BadRequestException('Only an open community can be started');
        const startedAt = new Date();
        const durationMs = this.parseDuration(community.timeNeeded);
        community.status = 'started';
        community.startedAt = startedAt;
        community.endsAt = new Date(startedAt.getTime() + durationMs);
        const saved = await community.save();
        void this.notifyMembers(saved, userId, 'Community started', 'A joined community has started.', 'community_started');
        return saved;
    }

    async remove(id: string, userId: string, role: string) {
        const community = await this.communityModel.findById(id).exec();
        if (!community) throw new NotFoundException('Community not found');
        this.ensureOwnerOrAdmin(community.createdBy.toString(), userId, role);

        if (community.status === 'open') {
            await this.communityMessageModel.deleteMany({ communityId: community._id });
            await community.deleteOne();
            return { deleted: true, status: 'deleted' };
        }
        if (community.status !== 'started') throw new BadRequestException('This community has already ended');
        community.status = 'cancelled';
        await community.save();
        void this.notifyMembers(community, userId, 'Community cancelled', 'The creator cancelled a joined community.', 'community_cancelled');
        return { deleted: false, status: 'cancelled' };
    }

    async getMessages(id: string, userId: string, role: string) {
        await this.ensureParticipant(id, userId, role);

        return this.communityMessageModel
            .find({ communityId: new Types.ObjectId(id) })
            .sort({ createdAt: 1 })
            .populate('senderId', 'username email role')
            .exec();
    }

    async sendMessage(id: string, userId: string, role: string, dto: SendCommunityMessageDto) {
        const community = await this.ensureParticipant(id, userId, role);
        if (community.status !== 'open' && community.status !== 'started') {
            throw new BadRequestException('This community chat is closed');
        }

        const message = await new this.communityMessageModel({
            communityId: new Types.ObjectId(id),
            senderId: new Types.ObjectId(userId),
            content: dto.content,
        }).save();

        const communityStillActive = await this.communityModel
            .exists({ _id: new Types.ObjectId(id), status: { $ne: 'cancelled' } })
            .exec();

        if (!communityStillActive) {
            await message.deleteOne();
            throw new NotFoundException('Community not found');
        }

        const populated = await this.communityMessageModel
            .findById(message._id)
            .populate('senderId', 'username email role')
            .exec();
        const recipients = community.members.map((member) => member.toString()).filter((id) => id !== userId);
        void this.notifications.notifyUsers(
            recipients,
            community.title,
            'New community message',
            { type: 'community_message', communityId: id },
        ).catch(() => undefined);
        return populated;
    }

    async hideForMember(id: string, userId: string) {
        const community = await this.communityModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(id),
                members: new Types.ObjectId(userId),
                status: { $in: ['completed', 'cancelled'] },
            },
            { $addToSet: { hiddenFor: new Types.ObjectId(userId) } },
            { new: true },
        ).exec();
        if (!community) throw new BadRequestException('Only joined, past communities can be removed from your history');
        return community;
    }

    private parseDuration(value: string) {
        const match = value.trim().toLowerCase().match(/^(\d+)\s*(hour|hours|day|days)?$/);
        if (!match) throw new BadRequestException('Time needed must be a number of hours or days');
        const amount = Number(match[1]);
        if (amount < 1 || amount > 365) throw new BadRequestException('Community duration is out of range');
        const hours = match[2]?.startsWith('hour') ? amount : amount * 24;
        return hours * 60 * 60 * 1000;
    }

    private async completeElapsedCommunities() {
        const elapsed = await this.communityModel.find(
            { status: 'started', endsAt: { $lte: new Date() } },
        ).select('_id title members createdBy').exec();
        if (!elapsed.length) return;
        await this.communityModel.updateMany(
            { _id: { $in: elapsed.map((community: any) => community._id) }, status: 'started' },
            { $set: { status: 'completed' } },
        ).exec();
        for (const community of elapsed as any[]) {
            void this.notifyMembers(community, '', 'Community completed', `${community.title} has completed.`, 'community_completed');
        }
    }

    private notifyMembers(community: any, actorId: string, title: string, body: string, type: string) {
        const recipients = community.members.map((member: any) => member._id?.toString() ?? member.toString())
            .filter((id: string) => id !== actorId);
        return this.notifications.notifyUsers(recipients, title, body, {
            type,
            communityId: community._id.toString(),
        }).catch(() => undefined);
    }

    private ensureOwnerOrAdmin(ownerId: string, userId: string, role: string) {
        if (role !== 'admin' && ownerId !== userId) {
            throw new BadRequestException('Only the community creator or admin can perform this action');
        }
    }

    private async ensureParticipant(id: string, userId: string, role: string) {
        const community = await this.communityModel.findById(id).exec();
        if (!community) throw new NotFoundException('Community not found');
        const isCreator = community.createdBy.toString() === userId;
        const isMember = community.members.some((memberId) => memberId.toString() === userId);

        if (role !== 'admin' && !isCreator && !isMember) {
            throw new BadRequestException('Join this community before using its chat');
        }

        return community;
    }
}
