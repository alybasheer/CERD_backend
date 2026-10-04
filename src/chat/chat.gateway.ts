import { SessionService } from '../authentication/session.service';
import { InjectModel } from '@nestjs/mongoose';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { HelpRequestDocument } from '../help-requests/help-request.schema';
import { ChatService } from './chat.service';
import { NotificationsService } from '../notifications/notifications.service';

interface AuthSocket extends Socket {
    userId?: string;
}

@WebSocketGateway({
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private connectedUsers = new Map<string, Set<string>>();

    constructor(
        private chatService: ChatService,
        private sessions: SessionService,
        private notifications: NotificationsService,
        @InjectModel('HelpRequest') private helpRequestModel: Model<HelpRequestDocument>,
    ) { }

    afterInit(server: any) {
        console.log('✅ WebSocket Server Initialized');
    }

    async handleConnection(socket: AuthSocket) {
        try {
            // Extract token from handshake query or auth header
            const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

            if (!token) {
                socket.disconnect();
                console.log('❌ Connection rejected: No token provided');
                return;
            }

            // Verify token and get userId
            const payload = await this.sessions.authenticate(token);

            socket.userId = payload.sub;
            const socketIds = this.connectedUsers.get(payload.sub) ?? new Set<string>();
            socketIds.add(socket.id);
            this.connectedUsers.set(payload.sub, socketIds);

            console.log(`✅ User ${payload.sub} (role=${payload.role}) connected with socket ${socket.id} [total connected: ${this.connectedUsers.size}]`);
            socket.emit('connection_success', { message: 'Connected to chat server', userId: payload.sub });
        } catch (error) {
            console.log('❌ Authentication failed:', error.message);
            socket.disconnect();
        }
    }

    handleDisconnect(socket: AuthSocket) {
        if (socket.userId) {
            const socketIds = this.connectedUsers.get(socket.userId);
            socketIds?.delete(socket.id);
            if (socketIds?.size === 0) this.connectedUsers.delete(socket.userId);
            console.log(`✅ User ${socket.userId} disconnected`);
        }
    }

    /**
     * Deliver an event to every active socket belonging to the given user.
     * Returns the number of sockets that were delivered to.
     */
    private emitToUserSockets(userId: string, event: string, data: any): number {
        const sockets = this.connectedUsers.get(userId);
        if (!sockets || sockets.size === 0) return 0;
        let delivered = 0;
        for (const socketId of sockets) {
            this.server.to(socketId).emit(event, data);
            delivered++;
        }
        return delivered;
    }

    /** Connect the user is considered online when it has at least one active socket. */
    private isUserInRegistry(userId: string): boolean {
        const sockets = this.connectedUsers.get(userId);
        return !!sockets && sockets.size > 0;
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(
        @ConnectedSocket() socket: AuthSocket,
        @MessageBody() data: { receiverId: string; content: string; requestId?: string },
    ) {
        try {
            const { receiverId, content, requestId } = data;
            const senderId = socket.userId;

            if (!content || !receiverId || !senderId) {
                socket.emit('error', { message: 'Content, receiverId, and senderId are required' });
                return;
            }

            // Save message to database
            const message = await this.chatService.saveMessage(senderId, receiverId, content, requestId);

            // Get receiver's socket ID
            const receiverSocketIds = this.connectedUsers.get(receiverId);

            // Emit to receiver if online
            if (receiverSocketIds?.size) {
                for (const socketId of receiverSocketIds) socket.to(socketId).emit('receive_message', {
                    _id: message._id,
                    senderId: message.senderId,
                    receiverId: message.receiverId,
                    content: message.content,
                    requestId: message.requestId,
                    timestamp: message.timestamp,
                    isRead: false,
                });
                console.log(`📨 Message sent from ${senderId} to ${receiverId} (online)`);
            } else {
                console.log(`📨 Message saved for offline user ${receiverId}`);
            }

            if (!receiverSocketIds?.size) {
                void this.notifications.notifyUsers(
                    [receiverId],
                    'New message',
                    'You have a new message in WeHelp.',
                    {
                        type: requestId ? 'request_message' : 'direct_message',
                        senderId,
                        ...(requestId ? { requestId } : {}),
                    },
                ).catch(() => undefined);
            }

            // Confirm delivery to sender
            socket.emit('message_sent', {
                _id: message._id,
                senderId: message.senderId,
                receiverId: message.receiverId,
                content: message.content,
                requestId: message.requestId,
                timestamp: message.timestamp,
                isRead: message.isRead,
                status: receiverSocketIds?.size ? 'delivered' : 'saved',
            });
        } catch (error) {
            socket.emit('error', { message: 'Failed to send message: ' + error.message });
        }
    }

    @SubscribeMessage('get_conversation')
    async handleGetConversation(
        @ConnectedSocket() socket: AuthSocket,
        @MessageBody() data: { otherUserId: string; limit?: number },
    ) {
        try {
            const { otherUserId, limit = 50 } = data;
            const userId = socket.userId;

            if (!userId) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }

            const conversation = await this.chatService.getConversation(userId, otherUserId, limit);

            // Mark messages as read
            await this.chatService.markMessagesAsRead(userId, otherUserId);

            socket.emit('conversation_data', {
                otherUserId,
                messages: conversation.reverse(), // Return in chronological order
                totalMessages: conversation.length,
            });

            console.log(`📖 Conversation loaded: ${userId} ↔ ${otherUserId}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to load conversation: ' + error.message });
        }
    }

    @SubscribeMessage('typing')
    handleTyping(@ConnectedSocket() socket: AuthSocket, @MessageBody() data: { receiverId: string; isTyping: boolean }) {
        const receiverSocketIds = this.connectedUsers.get(data.receiverId);
        if (receiverSocketIds?.size) {
            for (const socketId of receiverSocketIds) socket.to(socketId).emit('user_typing', {
                senderId: socket.userId,
                isTyping: data.isTyping,
            });
        }
    }

    @SubscribeMessage('start_tracking')
    async handleStartTracking(
        @ConnectedSocket() socket: AuthSocket,
        @MessageBody() data: { requestId: string },
    ) {
        await this.emitTrackingStatus(socket, data.requestId, 'en_route');
    }

    @SubscribeMessage('stop_tracking')
    async handleStopTracking(
        @ConnectedSocket() socket: AuthSocket,
        @MessageBody() data: { requestId: string },
    ) {
        await this.emitTrackingStatus(socket, data.requestId, 'arrived');
    }

    private async emitTrackingStatus(socket: AuthSocket, requestId: string, status: string) {
        if (!socket.userId || !requestId) return;
        const request = await this.helpRequestModel.findById(requestId).exec();
        if (!request?.userId) return;
        this.emitToUserSockets(request.userId.toString(), 'tracking_status', {
            requestId,
            volunteerId: socket.userId,
            status,
        });
    }

    @SubscribeMessage('update_location')
    async handleUpdateLocation(
        @ConnectedSocket() socket: AuthSocket,
        @MessageBody() data: { latitude: number; longitude: number; requestId: string },
    ) {
        if (!socket.userId || !data.requestId ||
            typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return;
        const request = await this.helpRequestModel.findById(data.requestId).exec();
        if (!request?.userId) return;
        this.emitToUserSockets(request.userId.toString(), 'volunteer_location', {
            requestId: data.requestId,
            volunteerId: socket.userId,
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: new Date().toISOString(),
        });
    }

    // ──────────────────────────────────────────────
    // PUBLIC API — called by other modules
    // ──────────────────────────────────────────────

    /**
     * Send an event to a list of specific users (by their userId).
     * Only users who are currently connected via WebSocket will receive it.
     * Every active socket of a connected user receives the event.
     *
     * Used by HelpRequestsService to notify nearby volunteers of new requests.
     */
    notifyUsers(userIds: string[], event: string, data: any) {
        let notified = 0;
        for (const userId of userIds) {
            const socketIds = this.connectedUsers.get(userId);
            if (socketIds?.size) {
                for (const socketId of socketIds) this.server.to(socketId).emit(event, data);
                notified++;
                console.log(`📢 [${event}] → user ${userId} socket(s) ${[...socketIds].join(',')} EMITTED`);
            } else {
                console.log(`📢 [${event}] ✗ user ${userId} NOT CONNECTED (connectedUsers map miss)`);
            }
        }
        console.log(`📢 [${event}] Notified ${notified}/${userIds.length} users`);
        return notified;
    }

    /** Send an event to every currently connected socket. */
    broadcast(event: string, data: any) {
        this.server.emit(event, data);
        let totalSockets = 0;
        for (const sockets of this.connectedUsers.values()) totalSockets += sockets.size;
        return totalSockets;
    }

    /** Check if a user has at least one active socket. */
    isUserOnline(userId: string): boolean {
        return this.isUserInRegistry(userId);
    }

    /** Get one live socket id for a user (the first one), if connected. */
    getSocketIdForUser(userId: string): string | undefined {
        const sockets = this.connectedUsers.get(userId);
        if (!sockets) return undefined;
        const first = sockets.values().next();
        return first.done ? undefined : first.value;
    }

    /** Get the socket IDs currently held by a user (for diagnostics/tests). */
    getSocketsForUser(userId: string): string[] {
        const sockets = this.connectedUsers.get(userId);
        return sockets ? [...sockets] : [];
    }

    /** Get the list of all currently connected user IDs. */
    getConnectedUserIds(): string[] {
        return Array.from(this.connectedUsers.keys());
    }

    disconnectUser(userId: string) {
        const socketIds = this.connectedUsers.get(userId);
        if (!socketIds) return 0;
        for (const socketId of socketIds) {
            this.server.sockets.sockets.get(socketId)?.disconnect(true);
        }
        this.connectedUsers.delete(userId);
        return socketIds.size;
    }
}
