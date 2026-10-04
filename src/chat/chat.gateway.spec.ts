import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { SessionService } from '../authentication/session.service';
import { NotificationsService } from '../notifications/notifications.service';

// Token -> identity map (two distinct tokens map to the SAME seeker account)
const TOKEN_IDENTITY: Record<string, { sub: string; role: string }> = {
  seek: { sub: 'user-seeker', role: 'user' },
  seek2: { sub: 'user-seeker', role: 'user' },
  vol: { sub: 'user-volunteer', role: 'volunteer' },
  vol2: { sub: 'user-volunteer', role: 'volunteer' },
};

const REQUEST_USER: Record<string, string> = {
  'req-seeker-1': 'user-seeker',
  'req-seeker-2': 'user-seeker',
};

describe('ChatGateway (multi-socket registry)', () => {
  let app: INestApplication;
  let gateway: ChatGateway;
  let gatewayUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: {
            saveMessage: jest.fn(async (senderId: string, receiverId: string, content: string) => ({
              _id: 'msg-1',
              senderId,
              receiverId,
              content,
              isRead: false,
            })),
          },
        },
        {
          provide: SessionService,
          useValue: {
            authenticate: jest.fn(async (token: string) => {
              const identity = TOKEN_IDENTITY[token];
              if (!identity) throw new Error('invalid token');
              return { ...identity, sid: `session-${token}` };
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn((token: string) => {
              const identity = TOKEN_IDENTITY[token];
              if (!identity) throw new Error('invalid token');
              return identity;
            }),
          },
        },
        {
          provide: getModelToken('HelpRequest'),
          useValue: {
            findById: jest.fn((id: string) => ({
              exec: async () => {
                const userId = REQUEST_USER[id];
                if (!userId) return null;
                return { _id: id, userId };
              },
            })),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    gatewayUrl = `http://127.0.0.1:${port}`;
    gateway = app.get(ChatGateway);
  });

  afterAll(async () => {
    for (const s of allSockets) {
      s.removeAllListeners();
      s.disconnect();
    }
    allSockets.length = 0;
    await new Promise((r) => setTimeout(r, 300));
    await app.close();
  });

  afterEach(async () => {
    for (const socket of allSockets.splice(0)) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await settle();
  });

  const allSockets: Socket[] = [];

  function connectSocket(token: string): Promise<{ socket: Socket; got: string[] }> {
    return new Promise((resolve, reject) => {
      const socket: Socket = io(gatewayUrl, {
        transports: ['websocket'],
        auth: { token },
      });
      allSockets.push(socket);
      const got: string[] = [];
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('connect timeout'));
      }, 8000);
      socket.on('connection_success', () => {
        clearTimeout(timer);
        resolve({ socket, got });
      });
      socket.on('volunteer_location', () => got.push('volunteer_location'));
      socket.on('tracking_status', (d: any) => got.push(`tracking_status:${d.status}`));
      socket.on('receive_message', () => got.push('receive_message'));
      socket.on('new_help_request', () => got.push('new_help_request'));
      socket.on('help_request_accepted', () => got.push('help_request_accepted'));
      socket.on('help_request_resolved', () => got.push('help_request_resolved'));
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function disconnectSocket(socket: Socket): Promise<void> {
    return new Promise((resolve) => {
      socket.on('disconnect', () => resolve());
      socket.disconnect();
      setTimeout(resolve, 500);
    });
  }

  /** Wait for the server-side registry to settle after a disconnect. */
  async function settle() {
    await new Promise((r) => setTimeout(r, 350));
  }

  async function emitLoc(sender: Socket, requestId: string, lat = 33.5, lng = 36.2) {
    sender.emit('update_location', { latitude: lat, longitude: lng, requestId });
    await new Promise((r) => setTimeout(r, 400));
  }

  async function emitStatus(sender: Socket, requestId: string, stop = false) {
    sender.emit(stop ? 'stop_tracking' : 'start_tracking', { requestId });
    await new Promise((r) => setTimeout(r, 400));
  }

  describe('registry semantics', () => {
    it('one user + one socket: location + status events are delivered and registry is clean', async () => {
      const seeker = await connectSocket('seek');
      const vol = await connectSocket('vol');

      expect(gateway.isUserOnline('user-seeker')).toBe(true);
      expect(gateway.getSocketsForUser('user-seeker')).toHaveLength(1);

      await emitStatus(vol.socket, 'req-seeker-1');
      await emitLoc(vol.socket, 'req-seeker-1');
      await emitLoc(vol.socket, 'req-seeker-1');

      expect(seeker.got.filter((e) => e.startsWith('tracking_status'))).toHaveLength(1);
      expect(seeker.got.filter((e) => e === 'volunteer_location')).toHaveLength(2);

      await disconnectSocket(seeker.socket);
      await disconnectSocket(vol.socket);
      await new Promise((r) => setTimeout(r, 300));
      expect(gateway.isUserOnline('user-seeker')).toBe(false);
      expect(gateway.getSocketsForUser('user-seeker')).toEqual([]);
    });

    it('one user + TWO sockets: BOTH receive volunteer_location', async () => {
      const seeker1 = await connectSocket('seek');
      const seeker2 = await connectSocket('seek2');
      const vol = await connectSocket('vol');

      expect(gateway.getSocketsForUser('user-seeker')).toHaveLength(2);

      await emitStatus(vol.socket, 'req-seeker-1');
      await emitLoc(vol.socket, 'req-seeker-1');
      await emitLoc(vol.socket, 'req-seeker-1');

      expect(seeker1.got.filter((e) => e === 'volunteer_location')).toHaveLength(2);
      expect(seeker2.got.filter((e) => e === 'volunteer_location')).toHaveLength(2);
      expect(seeker1.got.filter((e) => e.startsWith('tracking_status'))).toHaveLength(1);
      expect(seeker2.got.filter((e) => e.startsWith('tracking_status'))).toHaveLength(1);

      await disconnectSocket(seeker1.socket);
      await disconnectSocket(seeker2.socket);
      await disconnectSocket(vol.socket);
    });

    it('disconnecting socket#1 does not remove socket#2 from the registry', async () => {
      const seeker1 = await connectSocket('seek');
      const seeker2 = await connectSocket('seek2');
      const vol = await connectSocket('vol');

      await disconnectSocket(seeker1.socket);

      let sizeAfter = -1;
      await new Promise((r) => setTimeout(r, 300));
      sizeAfter = gateway.getSocketsForUser('user-seeker').length;
      expect(sizeAfter).toBe(1);
      expect(gateway.isUserOnline('user-seeker')).toBe(true);

      // socket#2 must still receive events after socket#1 left
      await emitLoc(vol.socket, 'req-seeker-1');
      expect(seeker2.got.filter((e) => e === 'volunteer_location')).toHaveLength(1);

      await disconnectSocket(seeker2.socket);
      await disconnectSocket(vol.socket);
    });

    it('disconnecting the LAST socket removes the user registry entry', async () => {
      const seeker1 = await connectSocket('seek');
      const seeker2 = await connectSocket('seek2');

      await disconnectSocket(seeker1.socket);
      await disconnectSocket(seeker2.socket);
      await new Promise((r) => setTimeout(r, 300));

      expect(gateway.getSocketsForUser('user-seeker')).toEqual([]);
      expect(gateway.isUserOnline('user-seeker')).toBe(false);
      expect(gateway.getConnectedUserIds()).not.toContain('user-seeker');
    });

    it('repeated connect/disconnect cycles leave NO stale socket ids behind', async () => {
      const sockets: Socket[] = [];
      for (let i = 0; i < 3; i++) {
        const s = await connectSocket('seek');
        sockets.push(s.socket);
      }
      expect(gateway.getSocketsForUser('user-seeker')).toHaveLength(3);

      // disconnect in interleaved order (1st, 3rd, 2nd)
      await disconnectSocket(sockets[0]);
      await settle();
      expect(gateway.getSocketsForUser('user-seeker')).toHaveLength(2);
      await disconnectSocket(sockets[2]);
      await settle();
      expect(gateway.getSocketsForUser('user-seeker')).toHaveLength(1);
      await disconnectSocket(sockets[1]);
      await settle();

      expect(gateway.getSocketsForUser('user-seeker')).toEqual([]);
      expect(gateway.isUserOnline('user-seeker')).toBe(false);

      // A fresh cycle must still work
      const again = await connectSocket('seek');
      expect(gateway.getSocketsForUser('user-seeker')).toHaveLength(1);
      await disconnectSocket(again.socket);
      await settle();
    });

    it('send_message is delivered to ALL receiver sockets and status reflects online', async () => {
      const rx1 = await connectSocket('seek');
      const rx2 = await connectSocket('seek2');
      const tx = await connectSocket('vol');
      const txGot: string[] = [];
      tx.socket.on('message_sent', (d: any) => txGot.push(d.status));

      tx.socket.emit('send_message', { receiverId: 'user-seeker', content: 'hello' });
      await new Promise((r) => setTimeout(r, 600));

      expect(rx1.got.filter((e) => e === 'receive_message')).toHaveLength(1);
      expect(rx2.got.filter((e) => e === 'receive_message')).toHaveLength(1);
      expect(txGot).toEqual(['delivered']);

      await disconnectSocket(rx1.socket);
      await disconnectSocket(rx2.socket);
      await disconnectSocket(tx.socket);
    });
  });

  describe('notifyUsers / help flows', () => {
    it('new_help_request, help_request_accepted, help_request_resolved reach every active socket', async () => {
      const s1 = await connectSocket('seek');
      const s2 = await connectSocket('seek2');
      const s3 = await connectSocket('vol');

      const notifiedUsers = gateway.notifyUsers(['user-seeker'], 'new_help_request', { id: 'req-seeker-2' });
      await new Promise((r) => setTimeout(r, 400));
      expect(notifiedUsers).toBe(1);
      expect(s1.got.filter((e) => e === 'new_help_request')).toHaveLength(1);
      expect(s2.got.filter((e) => e === 'new_help_request')).toHaveLength(1);

      gateway.notifyUsers(['user-seeker'], 'help_request_accepted', { id: 'req-seeker-2' });
      gateway.notifyUsers(['user-seeker'], 'help_request_resolved', { id: 'req-seeker-2' });
      await new Promise((r) => setTimeout(r, 400));
      expect(s1.got.filter((e) => e === 'help_request_accepted')).toHaveLength(1);
      expect(s1.got.filter((e) => e === 'help_request_resolved')).toHaveLength(1);
      expect(s2.got.filter((e) => e === 'help_request_accepted')).toHaveLength(1);
      expect(s2.got.filter((e) => e === 'help_request_resolved')).toHaveLength(1);

      // notifyUsers also still targets MULTIPLE users in one call
      const v2 = await connectSocket('vol2');
      const count = gateway.notifyUsers(['user-seeker', 'user-volunteer'], 'new_help_request', { id: 'x' });
      await new Promise((r) => setTimeout(r, 400));
      expect(count).toBe(2);
      expect(s2.got.filter((e) => e === 'new_help_request')).toHaveLength(2);
      expect(v2.got.filter((e) => e === 'new_help_request')).toHaveLength(1);

      await disconnectSocket(s1.socket);
      await disconnectSocket(s2.socket);
      await disconnectSocket(s3.socket);
      await disconnectSocket(v2.socket);
    });

    it('tracking status flows (start + stop) still deliver to both sockets', async () => {
      const s1 = await connectSocket('seek');
      const s2 = await connectSocket('seek2');
      const vol = await connectSocket('vol2');

      await emitStatus(vol.socket, 'req-seeker-2');
      await emitStatus(vol.socket, 'req-seeker-2', true);

      expect(s1.got.filter((e) => e === 'tracking_status:en_route')).toHaveLength(1);
      expect(s1.got.filter((e) => e === 'tracking_status:arrived')).toHaveLength(1);
      expect(s2.got.filter((e) => e === 'tracking_status:en_route')).toHaveLength(1);
      expect(s2.got.filter((e) => e === 'tracking_status:arrived')).toHaveLength(1);

      await disconnectSocket(s1.socket);
      await disconnectSocket(s2.socket);
      await disconnectSocket(vol.socket);
    });

it('nothing is delivered when the user has no active sockets', async () => {
      const vol = await connectSocket('vol');
      const seeker1 = await connectSocket('seek');
      await disconnectSocket(seeker1.socket);
      await settle();
      expect(gateway.isUserOnline('user-seeker')).toBe(false);

      const notified = gateway.notifyUsers(['user-seeker'], 'new_help_request', { id: 'x4' });
      await emitLoc(vol.socket, 'req-seeker-1');
      expect(notified).toBe(0);
      await disconnectSocket(vol.socket);
      await settle();
    });
  });
});
