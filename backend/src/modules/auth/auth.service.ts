import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from './strategies/jwt.strategy';

const PUBLIC_USER = { id: true, email: true, username: true, name: true, role: true, isGuest: true, isActive: true, lastLoginAt: true, createdAt: true } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Staff sign-in: username (or email) + password. */
  async login(identifier: string, password: string) {
    const key = identifier.trim().toLowerCase();
    const user =
      (await this.prisma.user.findUnique({ where: { username: key } })) ??
      (await this.prisma.user.findUnique({ where: { email: key } }));
    if (!user || !user.isActive || user.isGuest) throw new UnauthorizedException('Invalid username or password');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid username or password');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue(user);
  }

  /**
   * Sign-in for testers: just a name, no password. Creates a fresh user-role
   * account under that name, so every tester's conversations and feedback are
   * attributed to them by name on the review pages.
   */
  async guest(name: string) {
    const tag = randomBytes(3).toString('hex');
    const user = await this.prisma.user.create({
      data: {
        email: `guest-${tag}-${Date.now()}@guest.local`,
        name: name.trim().replace(/\s+/g, ' '),
        role: 'user',
        isGuest: true,
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 4),
        lastLoginAt: new Date(),
      },
    });
    return this.issue(user);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'changeme-refresh',
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    if (payload.kind !== 'refresh') throw new UnauthorizedException('Not a refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account inactive or not found');
    return this.issue(user);
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PUBLIC_USER });
  }

  private issue(user: { id: string; email: string; name: string; role: string; isGuest: boolean }) {
    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role, kind: 'access' } satisfies JwtPayload,
      { secret: process.env.JWT_SECRET ?? 'changeme', expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, role: user.role, kind: 'refresh' } satisfies JwtPayload,
      {
        secret: process.env.JWT_REFRESH_SECRET ?? 'changeme-refresh',
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      },
    );
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, isGuest: user.isGuest },
    };
  }
}
