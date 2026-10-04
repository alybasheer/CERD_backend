import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SignupDocument } from '../authentication/signup.schema';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
    constructor(
        private chatService: ChatService,
        private jwtService: JwtService,
        @InjectModel('Signup') private signupModel: Model<SignupDocument>,
    ) { }

    private verifyTokenAndGetPayload(authHeader: string) {
        if (!authHeader) throw new UnauthorizedException('Authorization header required');
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const payload: any = this.jwtService.verify(token);
        return payload;
    }

    @Get('conversation/:otherUserId')
    async getConversation(
        @Headers('authorization') auth: string,
        @Param('otherUserId') otherUserId: string,
        @Query('limit') limit: string = '50',
        @Query('requestId') requestId?: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;

        // Prevent user from chatting with themselves
        if (userId === otherUserId) {
            throw new BadRequestException('Cannot chat with yourself');
        }

        const messages = await this.chatService.getConversation(userId, otherUserId, parseInt(limit), requestId);

        return {
            success: true,
            data: {
                userId,
                otherUserId,
                messageCount: messages.length,
                messages: messages.reverse(), // Chronological order
            },
        };
    }

    @Get('conversations')
    async getUserConversations(@Headers('authorization') auth: string) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;

        const conversations = await this.chatService.getUserConversations(userId);

        return {
            success: true,
            data: {
                userId,
                conversationCount: conversations.length,
                conversations,
            },
        };
    }

    @Get('unread-count')
    async getUnreadCount(@Headers('authorization') auth: string) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;

        const count = await this.chatService.getUnreadCount(userId);

        return {
            success: true,
            data: {
                userId,
                unreadCount: count,
            },
        };
    }

    @Get('coordination/contacts')
    async getCoordinationContacts(@Headers('authorization') auth: string) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;
        const role = payload.role ?? 'user';
        const contacts = await this.chatService.getCoordinationContacts(userId, role);

        return {
            success: true,
            data: {
                userId,
                role,
                ...contacts,
            },
        };
    }

    @Get('mark-read/:senderId')
    async markAsRead(@Headers('authorization') auth: string, @Param('senderId') senderId: string) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;

        await this.chatService.markMessagesAsRead(userId, senderId);

        return {
            success: true,
            message: `Messages from ${senderId} marked as read`,
        };
    }

    @Get('volunteers/list')
    async listAllVolunteers(
        @Headers('authorization') auth: string,
        @Query('search') search: string = '',
        @Query('limit') limit: string = '100',
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const currentUserId = payload.sub;

        // Build search query
        const searchQuery = search
            ? {
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
                role: 'volunteer',
                _id: { $ne: currentUserId }, // Exclude current user
            }
            : {
                role: 'volunteer',
                _id: { $ne: currentUserId },
            };

        const volunteers = await this.signupModel
            .find(searchQuery)
            .limit(parseInt(limit))
            .select('_id username email role createdAt')
            .exec();

        return {
            success: true,
            data: {
                currentUserId,
                volunteerCount: volunteers.length,
                volunteers,
            },
        };
    }

    @Get('volunteers/:volunteerId')
    async getVolunteerProfile(
        @Headers('authorization') auth: string,
        @Param('volunteerId') volunteerId: string,
    ) {
        this.verifyTokenAndGetPayload(auth);

        const volunteer = await this.signupModel
            .findOne({ _id: volunteerId, role: 'volunteer' })
            .select('_id username email role createdAt')
            .exec();

        if (!volunteer) {
            throw new BadRequestException('Volunteer not found');
        }

        return {
            success: true,
            data: volunteer,
        };
    }

    /**
     * POST /chat/send-message (TEST ONLY - For REST API testing without WebSocket)
     * Send a message directly via REST API (for testing)
     */
    @Post('send-message')
    async sendMessage(
        @Headers('authorization') auth: string,
        @Body() body: { receiverId: string; content: string; requestId?: string },
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const senderId = payload.sub;

        if (!body.receiverId || !body.content) {
            throw new BadRequestException('receiverId and content are required');
        }

        if (senderId === body.receiverId) {
            throw new BadRequestException('Cannot send message to yourself');
        }

        try {
            const message = await this.chatService.saveMessage(senderId, body.receiverId, body.content, body.requestId);

            console.log(`✅ Message saved: ${message._id}`);

            return {
                success: true,
                message: 'Message sent successfully',
                data: {
                    _id: message._id,
                    senderId,
                    receiverId: body.receiverId,
                    content: message.content,
                    timestamp: message.timestamp,
                    isRead: message.isRead,
                },
            };
        } catch (error) {
            console.error('❌ Error saving message:', error);
            throw new BadRequestException('Failed to send message');
        }
    }

    /**
     * DELETE /chat/message/:messageId
     * Delete a message (only sender can delete their own message)
     */
    @Delete('message/:messageId')
    async deleteMessage(
        @Headers('authorization') auth: string,
        @Param('messageId') messageId: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;

        try {
            const message = await this.chatService.deleteMessage(messageId, userId);

            if (!message) {
                throw new BadRequestException('Message not found or you do not have permission to delete it');
            }

            return {
                success: true,
                message: 'Message deleted successfully',
                data: {
                    _id: messageId,
                    deletedAt: new Date(),
                },
            };
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            console.error('❌ Error deleting message:', error);
            throw new BadRequestException('Failed to delete message');
        }
    }

    /**
     * DELETE /chat/conversation/:otherUserId
     * Delete entire conversation with a user (deletes all messages between two users)
     */
    @Delete('conversation/:otherUserId')
    async deleteConversation(
        @Headers('authorization') auth: string,
        @Param('otherUserId') otherUserId: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        const userId = payload.sub;

        if (userId === otherUserId) {
            throw new BadRequestException('Cannot delete conversation with yourself');
        }

        try {
            const result = await this.chatService.deleteConversation(userId, otherUserId);

            return {
                success: true,
                message: 'Conversation removed from this account',
                data: {
                    userId,
                    otherUserId,
                    messagesHidden: result.modifiedCount,
                },
            };
        } catch (error) {
            console.error('❌ Error deleting conversation:', error);
            throw new BadRequestException('Failed to delete conversation');
        }
    }
}
