import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticationService } from '../authentication/authentication.service';
import { SessionService } from '../authentication/session.service';
import { SignupDocument } from '../authentication/signup.schema';
import { ChatGateway } from '../chat/chat.gateway';
import { HelpRequestDocument } from '../help-requests/help-request.schema';
import { RatingsService } from '../ratings/ratings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VolunteerDocument } from '../volunteer/volunteer.schema';

@Injectable()
export class AdminService {
    constructor(
        @InjectModel('Volunteer') private volunteerModel: Model<VolunteerDocument>,
        @InjectModel('Signup') private accountModel: Model<SignupDocument>,
        @InjectModel('HelpRequest') private helpRequestModel: Model<HelpRequestDocument>,
        private readonly authService: AuthenticationService,
        private readonly sessions: SessionService,
        private readonly chatGateway: ChatGateway,
        private readonly ratings: RatingsService,
        private readonly notifications: NotificationsService,
    ) { }

    async getAllPendingApplications() {
        return this.volunteerModel.find({ status: 'pending' }).populate('userId').exec();
    }

    async getAllApplications(status?: string) {
        if (status) {
            return this.volunteerModel.find({ status }).populate('userId').exec();
        }
        return this.volunteerModel.find().populate('userId').exec();
    }

    async getApplicationById(id: string) {
        const app = await this.volunteerModel.findById(id).populate('userId').exec();
        if (!app) throw new NotFoundException('Application not found');
        return app;
    }

    async approveApplication(id: string) {
        const app = await this.getApplicationById(id);
        app.status = 'approved';
        await app.save();
        // Update user's role to 'volunteer'
        await this.authService.updateRoleById(app.userId._id.toString(), 'volunteer');
        void this.notifications.notifyUsers(
            [app.userId._id.toString()],
            'Volunteer application approved',
            'Your volunteer access is ready. Sign in again to continue.',
            { type: 'verification_approved' },
        ).catch(() => undefined);
        return app;
    }

    async rejectApplication(id: string) {
        const app = await this.getApplicationById(id);
        app.status = 'rejected';
        await app.save();
        // Reset user's role to 'user' if application is rejected
        await this.authService.updateRoleById(app.userId._id.toString(), 'user');
        void this.notifications.notifyUsers(
            [app.userId._id.toString()],
            'Volunteer application update',
            'Your volunteer application was not approved.',
            { type: 'verification_rejected' },
        ).catch(() => undefined);
        return app;
    }

    async getVolunteerFeedback(userId: string, page: number, limit: number) {
        const account = await this.accountModel
            .findOne({ _id: new Types.ObjectId(userId), role: 'volunteer' })
            .select('_id username email role blocked')
            .exec();
        if (!account) throw new NotFoundException('Approved volunteer not found');
        const [stats, feedback] = await Promise.all([
            this.ratings.getVolunteerStats(userId),
            this.ratings.getVolunteerRatingsPage(userId, page, limit),
        ]);
        return { volunteer: account, stats, feedback };
    }

    async blockAccount(userId: string, reason: string, adminId: string) {
        const account = await this.accountModel.findByIdAndUpdate(
            userId,
            { $set: { blocked: true, moderationReason: reason, moderatedAt: new Date(), moderatedBy: adminId } },
            { new: true },
        ).exec();
        if (!account) throw new NotFoundException('Account not found');
        void this.notifications.notifyUsers([userId], 'Account blocked', 'Your WeHelp account was blocked by an administrator.', { type: 'account_blocked' }).catch(() => undefined);
        await this.reopenAssignments(userId, 'Volunteer account blocked');
        await this.sessions.revokeAccount(userId);
        this.chatGateway.disconnectUser(userId);
        return account;
    }

    async removeVolunteerRole(userId: string, reason: string, adminId: string) {
        const account = await this.accountModel.findByIdAndUpdate(
            userId,
            { $set: { role: 'user', moderationReason: reason, moderatedAt: new Date(), moderatedBy: adminId } },
            { new: true },
        ).exec();
        if (!account) throw new NotFoundException('Account not found');
        void this.notifications.notifyUsers([userId], 'Volunteer access removed', 'Your account no longer has volunteer access.', { type: 'volunteer_role_removed' }).catch(() => undefined);
        await this.volunteerModel.updateMany(
            { userId: new Types.ObjectId(userId), status: 'approved' },
            { $set: { status: 'revoked' } },
        ).exec();
        await this.reopenAssignments(userId, 'Volunteer access removed');
        await this.sessions.revokeAccount(userId);
        this.chatGateway.disconnectUser(userId);
        return account;
    }

    private async reopenAssignments(volunteerId: string, reason: string) {
        const assignments = await this.helpRequestModel.find({
            acceptedBy: new Types.ObjectId(volunteerId),
            status: 'accepted',
        }).select('_id userId').exec();
        if (!assignments.length) return;
        await this.helpRequestModel.updateMany(
            { _id: { $in: assignments.map((request: any) => request._id) }, status: 'accepted' },
            { $set: { status: 'open' }, $unset: { acceptedBy: 1 } },
        ).exec();
        for (const request of assignments as any[]) {
            this.chatGateway.notifyUsers([request.userId.toString()], 'help_request_reopened', {
                requestId: request._id,
                reason,
            });
            void this.notifications.notifyUsers(
                [request.userId.toString()],
                'Help request reopened',
                'Your assigned volunteer is unavailable. Your request is open again.',
                { type: 'help_request_reopened', requestId: request._id.toString() },
            ).catch(() => undefined);
        }
    }
}
