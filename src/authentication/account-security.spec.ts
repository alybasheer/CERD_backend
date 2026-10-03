import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { model } from 'mongoose';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { SignupSchema } from './signup.schema';
import { FirebaseService } from '../firebase/firebase.service';
import { SessionService } from './session.service';

const Account = model('SecurityTestAccount', SignupSchema);

describe('account response boundaries', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'isolated-test-signing-secret' });
  const account = new Account({
    username: 'Requester',
    email: 'requester@example.test',
    password: 'private-hash',
  });
  const sessions = {
    create: jest.fn().mockImplementation(async () => ({
      user: account,
      access_token: 'test-token',
      refresh_token: 'a'.repeat(43),
    })),
    refresh: jest.fn(),
    revoke: jest.fn(),
    authenticate: jest.fn().mockImplementation(async (token: string) => {
      if (token !== 'valid') throw new Error('invalid');
      return { sub: account.id, sid: '507f1f77bcf86cd799439011', role: 'user' };
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [
        { provide: JwtService, useValue: jwt },
        { provide: SessionService, useValue: sessions },
        {
          provide: AuthenticationService,
          useValue: {
            create: jest
              .fn()
              .mockResolvedValue({ user: account, access_token: 'test-token' }),
            validateUser: jest
              .fn()
              .mockResolvedValue({ user: account, access_token: 'test-token' }),
            loginWithGoogle: jest
              .fn()
              .mockResolvedValue({ user: account, access_token: 'test-token' }),
            updateLocationById: jest.fn().mockResolvedValue(account),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('does not expose a public account enumeration route', async () => {
    await request(app.getHttpServer())
      .get('/authentication/signup')
      .expect(404);
  });

  it.each(['signup', 'login', 'google-login'])(
    'omits passwords from %s responses',
    async (route) => {
      const response = await request(app.getHttpServer())
        .post(`/authentication/${route}`)
        .send({
          username: 'Requester',
          email: 'requester@example.test',
          password: 'input',
          idToken: 'test',
        })
        .expect(201);
      expect(response.body.user.username).toBe('Requester');
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.access_token).toBe('test-token');
    },
  );

  it('requires a valid token for location updates and excludes password from the response', async () => {
    const endpoint = '/authentication/location';
    await request(app.getHttpServer())
      .post(endpoint)
      .send({ latitude: 1, longitude: 2 })
      .expect(401);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer valid')
      .send({ latitude: 1, longitude: 2 })
      .expect(201);
    expect(response.body).not.toHaveProperty('password');
  });

  it('excludes passwords by default and redacts nested populated documents', () => {
    expect(SignupSchema.path('password').options.select).toBe(false);
    expect(
      JSON.parse(JSON.stringify({ userId: account })).userId,
    ).not.toHaveProperty('password');
    expect(account.password).toBe('private-hash');
  });
});

describe('password authentication', () => {
  const previousEmail = process.env.ADMIN_EMAIL;
  const previousPassword = process.env.ADMIN_PASSWORD;
  afterEach(() => {
    if (previousEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  });

  it('does not authenticate the old built-in administrator credentials', async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    const query = {
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    };
    const service = new AuthenticationService(
      { findOne: jest.fn().mockReturnValue(query) } as any,
      new JwtService({ secret: 'test-only' }),
      {} as FirebaseService,
    );
    expect(
      await service.validateUser('admin@example.com', 'adminpass123'),
    ).toBeNull();
  });

  it('can validate a password explicitly selected for authentication without leaking it', async () => {
    const account = new Account({
      username: 'User',
      email: 'user@example.test',
      password: await bcrypt.hash('correct', 4),
    });
    const query = {
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(account),
    };
    const service = new AuthenticationService(
      { findOne: jest.fn().mockReturnValue(query) } as any,
      new JwtService({ secret: 'test-only' }),
      {} as FirebaseService,
    );
    expect(await service.validateUser('user@example.test', 'wrong')).toBeNull();
    const result = await service.validateUser('user@example.test', 'correct');
    expect(query.select).toHaveBeenCalledWith('+password');
    expect(result?.access_token).toBeTruthy();
    expect(JSON.parse(JSON.stringify(result)).user).not.toHaveProperty(
      'password',
    );
  });
});
