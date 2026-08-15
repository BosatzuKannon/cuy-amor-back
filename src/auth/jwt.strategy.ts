import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

const SUPABASE_JWKS_URI =
  'https://ekeylzczyjfcrsevbufw.supabase.co/auth/v1/.well-known/jwks.json';

type JwtPayload = {
  sub?: string;
  email?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: SUPABASE_JWKS_URI,
      }),
      algorithms: ['ES256'],
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub ?? '',
      email: payload.email,
    };
  }
}
