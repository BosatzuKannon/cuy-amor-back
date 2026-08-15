import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AddPhotosDto } from './dto/photo.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateUser(authUser: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (existing) {
      return existing;
    }

    try {
      const email = authUser.email ?? '';
      return await this.prisma.user.create({
        data: {
          id: authUser.userId,
          email,
          firstName: email.split('@')[0] || 'usuario',
          preferences: {
            create: {},
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Another request may have created the record concurrently.
        return this.prisma.user.findUnique({
          where: { id: authUser.userId },
        });
      }
      throw error;
    }
  }

  async updateProfile(userId: string, dto: CompleteProfileDto) {
    await this.getOrCreateUser({ userId });

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          gender: dto.gender,
          bio: dto.bio,
          city: dto.city ?? 'Pasto',
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });
    } catch (error) {
      this.handlePrismaError(error, 'No se pudo actualizar el perfil');
    }
  }

  async addPhotos(userId: string, dto: AddPhotosDto) {
    await this.getOrCreateUser({ userId });

    try {
      return await this.prisma.$transaction(
        dto.photos.map((photo) =>
          this.prisma.photo.create({
            data: {
              url: photo.url,
              order: photo.order,
              isProfile: photo.isProfile ?? false,
              userId,
            },
          }),
        ),
      );
    } catch (error) {
      this.handlePrismaError(error, 'No se pudieron guardar las fotos');
    }
  }

  private handlePrismaError(error: unknown, fallbackMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('El usuario no existe');
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Registro duplicado');
      }
      throw new ConflictException(fallbackMessage);
    }

    throw error;
  }
}
