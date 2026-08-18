import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  generateSupabaseToken(userId: string) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'SUPABASE_JWT_SECRET no está configurado en el servidor',
      );
    }

    const token = this.jwtService.sign(
      {
        role: 'authenticated',
        aud: 'authenticated',
        iss: 'supabase',
        sub: userId,
      },
      { secret, expiresIn: '1h' },
    );

    return { supabaseToken: token };
  }
}
