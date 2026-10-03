import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';

export function authenticationJwtOptions(
  config: ConfigService,
): JwtModuleOptions {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret?.trim() || secret.trim() === 'dev_secret_key') {
    throw new Error(
      'Set JWT_SECRET to a private signing secret; no default is allowed.',
    );
  }
  return {
    secret,
    signOptions: {
      expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
        '1h') as JwtSignOptions['expiresIn'],
    },
  };
}
