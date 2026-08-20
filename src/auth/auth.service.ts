import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  generateSupabaseToken(userId: string) {
    const rawSecret = process.env.SUPABASE_JWT_SECRET;
    if (!rawSecret) throw new UnauthorizedException('Supabase JWT Secret is missing');

    const secretBuffer = Buffer.from(rawSecret, 'base64');

    const payload = {
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase',
      sub: userId,
    };

    const supabaseToken = jwt.sign(payload, secretBuffer, { expiresIn: '1h' });
    return { supabaseToken };
  }
}
