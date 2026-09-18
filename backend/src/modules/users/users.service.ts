import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const PUBLIC_USER = {
  id: true,
  email: true,
  username: true,
  isGuest: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { visitors: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Staff accounts. Guests are counted, not listed - one is created per one-click sign-in. */
  async list() {
    const [users, guestCount] = await Promise.all([
      this.prisma.user.findMany({ where: { isGuest: false }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], select: PUBLIC_USER }),
      this.prisma.user.count({ where: { isGuest: true } }),
    ]);
    return { users, guestCount };
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw new ConflictException({ message: 'An account with this email already exists.', error: 'email_taken' });
    const username = dto.username?.trim().toLowerCase();
    if (username) {
      const taken = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (taken) throw new ConflictException({ message: 'That username is taken.', error: 'username_taken' });
    }
    return this.prisma.user.create({
      data: {
        email,
        username: username || null,
        name: dto.name.trim(),
        role: dto.role ?? 'user',
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: PUBLIC_USER,
    });
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('User not found');

    // An admin cannot lock themselves out — demoting or deactivating your own
    // account is the one edit that needs a second admin.
    if (id === actorId && (dto.isActive === false || (dto.role && dto.role !== 'admin'))) {
      throw new BadRequestException({
        message: 'You cannot deactivate or demote your own account.',
        error: 'self_lockout',
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, 10) } : {}),
      },
      select: PUBLIC_USER,
    });
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException({ message: 'You cannot delete your own account.', error: 'self_lockout' });
    }
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    // Conversations they held are kept (userId → NULL via SetNull), so the
    // feedback record survives the account.
    await this.prisma.user.delete({ where: { id } });
    return { id };
  }
}
