import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  generateSupabaseToken(userId: string) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret)
      throw new UnauthorizedException('Supabase JWT Secret is missing');

    const payload = {
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase',
      sub: userId,
    };

    // Sign using the raw string
    const supabaseToken = jwt.sign(payload, secret, { expiresIn: '1h' });
    return { supabaseToken };
  }
}
