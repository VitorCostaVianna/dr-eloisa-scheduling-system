import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const userId = 'user-1';
  const email = 'dentista@example.com';
  const plainPassword = 'senha-correta-123';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '15m' } })],
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(email, plainPassword)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const passwordHash = await argon2.hash(plainPassword);
      prisma.user.findUnique.mockResolvedValue({ id: userId, email, passwordHash, role: Role.DENTIST });

      await expect(service.login(email, 'senha-errada')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes previous refresh tokens and returns new tokens on success', async () => {
      const passwordHash = await argon2.hash(plainPassword);
      prisma.user.findUnique.mockResolvedValue({ id: userId, email, passwordHash, role: Role.DENTIST });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const tokens = await service.login(email, plainPassword);

      expect(tokens.accessToken.split('.')).toHaveLength(3); // formato JWT
      expect(tokens.refreshToken).toHaveLength(64); // hex de 32 bytes
      expect(tokens.refreshTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('refresh', () => {
    const rawToken = 'a'.repeat(64);

    it('throws UnauthorizedException when the token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
        user: { id: userId, role: Role.DENTIST },
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: userId, role: Role.DENTIST },
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the token and returns new tokens on success', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { id: userId, role: Role.DENTIST },
      });
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt-1' });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const tokens = await service.refresh(rawToken);

      expect(tokens.refreshToken).not.toBe(rawToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('logout', () => {
    const rawToken = 'b'.repeat(64);

    it('revokes the matching refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt-1', revokedAt: null });
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt-1' });

      await service.logout(rawToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does not throw when the token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout(rawToken)).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
