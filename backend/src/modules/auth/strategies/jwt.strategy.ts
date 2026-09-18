import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  role: string;
  /** `access` tokens authenticate requests; `refresh` tokens only mint new pairs. */
  kind?: 'access' | 'refresh';
}

export interface AuthUser {
  userId: string;
  role: string;
  email: string;
  name: string;
  isGuest: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'changeme',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.kind === 'refresh') throw new UnauthorizedException('Refresh token cannot be used here');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, name: true, isActive: true, isGuest: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account inactive or not found');
    return { userId: user.id, role: user.role, email: user.email, name: user.name, isGuest: user.isGuest };
  }
}
