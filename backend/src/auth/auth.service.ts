import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async register(dto: RegisterDto) {
    // Check email uniqueness
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email is already in use');
    }

    // Check username uniqueness
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user and UserStats in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          passwordHash,
        },
      });

      await tx.userStats.create({
        data: {
          userId: newUser.id,
        },
      });

      return newUser;
    });

    // Return token + user data without passwordHash
    const { passwordHash: _, ...userWithoutPassword } = user;
    return {
      ...this.generateToken(user),
      user: userWithoutPassword,
    };
  }

  async login(dto: LoginDto) {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check ban status
    if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) {
      throw new ForbiddenException({
        message: 'Account is banned',
        bannedUntil: user.bannedUntil.toISOString(),
      });
    }

    // Return token + user data without passwordHash
    const { passwordHash: _, ...userWithoutPassword } = user;
    return {
      ...this.generateToken(user),
      user: userWithoutPassword,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return null;
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async handleOAuthLogin(profile: {
    email: string;
    name: string;
    googleId: string;
    avatar?: string | null;
  }) {
    // Find existing user by OAuth provider + ID
    let user = await this.prisma.user.findFirst({
      where: { oauthProvider: 'google', oauthId: profile.googleId },
    });

    if (!user) {
      // Check if email already exists (link accounts)
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        // Link Google to existing account
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { oauthProvider: 'google', oauthId: profile.googleId },
        });
      } else {
        // Create new user via OAuth (no password)
        user = await this.prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email: profile.email,
              username: profile.name,
              passwordHash: '',
              oauthProvider: 'google',
              oauthId: profile.googleId,
              avatar: profile.avatar ?? null,
            },
          });
          await tx.userStats.create({ data: { userId: newUser.id } });
          return newUser;
        });
      }
    }

    return this.generateToken(user);
  }

  generateToken(user: { id: string; username: string; role?: string }) {
    const payload = { sub: user.id, username: user.username, role: user.role ?? 'PLAYER' };
    const token = this.jwtService.sign(payload);

    // Cache JWT session (7 days = 604800 seconds)
    this.cacheService
      .setUserSession(user.id, token, 604800)
      .catch(() => {}); // Non-blocking

    return { access_token: token };
  }
}
