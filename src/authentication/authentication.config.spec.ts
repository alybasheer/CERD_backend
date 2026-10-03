import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authenticationJwtOptions } from './authentication.config';

describe('authentication signing configuration', () => {
  it.each([undefined, '', '  ', 'dev_secret_key'])(
    'rejects an absent or default secret (%s)',
    (secret) => {
      const config = { get: () => secret } as unknown as ConfigService;
      expect(() => authenticationJwtOptions(config)).toThrow('JWT_SECRET');
    },
  );

  it('uses the configured key for signing and verification', () => {
    const values = {
      JWT_SECRET: 'isolated-private-test-secret',
      JWT_EXPIRES_IN: '2h',
    };
    const config = {
      get: (key: keyof typeof values) => values[key],
    } as unknown as ConfigService;
    const jwt = new JwtService(authenticationJwtOptions(config));
    const token = jwt.sign({ sub: 'test-user' });
    expect(jwt.verify(token).sub).toBe('test-user');
    expect(jwt.decode(token).exp - jwt.decode(token).iat).toBe(7200);
    expect(() =>
      new JwtService({ secret: 'dev_secret_key' }).verify(token),
    ).toThrow();
  });
});
