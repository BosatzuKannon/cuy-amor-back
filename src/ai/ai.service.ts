import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

type GeminiPart = { text?: string };
type GeminiCandidate = { content?: { parts?: GeminiPart[] } };
type GeminiResponse = { candidates?: GeminiCandidate[] };

export type AiIcebreakerResult = {
  suggestions: string[];
  aiLeft: number;
};

export type AiProfileRoastResult = {
  score: number;
  headline: string;
  tips: string[];
  aiLeft: number;
};

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

const REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get apiKey(): string | undefined {
    return this.configService.get<string>('GEMINI_API_KEY')?.trim();
  }

  private async consumeAiQuota(userId: string): Promise<number> {
    const consumed = await this.prisma.user.updateMany({
      where: { id: userId, dailyAiLeft: { gt: 0 } },
      data: { dailyAiLeft: { decrement: 1 } },
    });

    if (consumed.count === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'AI_QUOTA_EXHAUSTED',
          message:
            'Se agotaron tus usos de IA por hoy. Vuélvete Cuy Leyenda para tener 10 usos diarios.',
          upsell: 'CUY_LEYENDA',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dailyAiLeft: true },
    });
    return user?.dailyAiLeft ?? 0;
  }

  private async callGemini(prompt: string): Promise<string> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El asistente de IA no está configurado. Intenta más tarde.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `Gemini respondió ${response.status}: ${detail.slice(0, 300)}`,
        );
        throw new ServiceUnavailableException(
          'El asistente de IA no está disponible en este momento.',
        );
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!text) {
        throw new ServiceUnavailableException(
          'El asistente de IA no devolvió una respuesta válida.',
        );
      }

      return text;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.error(
        `Error llamando a Gemini: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'El asistente de IA no está disponible en este momento.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson<T>(raw: string): T {
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new ServiceUnavailableException(
        'No pudimos interpretar la respuesta de la IA. Intenta de nuevo.',
      );
    }
  }

  async generateIcebreakers(
    matchId: string,
    userId: string,
  ): Promise<AiIcebreakerResult> {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: {
        user1Id: true,
        user2Id: true,
        user1: {
          select: { id: true, firstName: true, bio: true, hobbies: true },
        },
        user2: {
          select: { id: true, firstName: true, bio: true, hobbies: true },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    const me = match.user1Id === userId ? match.user1 : match.user2;
    const other = match.user1Id === userId ? match.user2 : match.user1;

    const aiLeft = await this.consumeAiQuota(userId);

    const prompt = [
      'Eres un asistente que ayuda a romper el hielo en una app de citas',
      'en Pasto, Colombia. Escribe en español con un tono juvenil, cálido y',
      'con guiños al contexto local (p.ej. referencia al pastuso, la',
      'guanábana, la laguna de la Cocha, el carnaval). NO uses groserías.',
      '',
      `Yo: ${me.firstName}. Bio: ${me.bio ?? 'sin bio'}. Intereses: ${
        me.hobbies.length > 0 ? me.hobbies.join(', ') : 'sin intereses'
      }.`,
      `La otra persona: ${other.firstName}. Bio: ${
        other.bio ?? 'sin bio'
      }. Intereses: ${
        other.hobbies.length > 0 ? other.hobbies.join(', ') : 'sin intereses'
      }.`,
      '',
      'Genera EXACTAMENTE 3 mensajes cortos y divertidos para iniciar la',
      'conversación con la otra persona (máximo 160 caracteres cada uno),',
      'diferentes entre sí. Devuelve SOLO un JSON con este formato:',
      '{"suggestions": ["mensaje 1", "mensaje 2", "mensaje 3"]}',
    ].join('\n');

    const raw = await this.callGemini(prompt);
    const parsed = this.parseJson<{ suggestions?: unknown }>(raw);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .slice(0, 3)
      : [];

    if (suggestions.length === 0) {
      throw new ServiceUnavailableException(
        'La IA no generó sugerencias válidas. Intenta de nuevo.',
      );
    }

    return { suggestions, aiLeft };
  }

  async generateProfileRoast(userId: string): Promise<AiProfileRoastResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        bio: true,
        hobbies: true,
        city: true,
        photos: {
          where: { isProfile: true },
          take: 1,
          select: { url: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }

    const aiLeft = await this.consumeAiQuota(userId);

    const prompt = [
      'Eres un asesor de perfil de una app de citas en Pasto, Colombia.',
      'Analiza el siguiente perfil y da una "recocha" (roast) divertida pero',
      'respetuosa, con humor pastuso. NO insultes ni uses groserías.',
      '',
      `Nombre: ${user.firstName}`,
      `Bio: ${user.bio ?? 'sin bio'}`,
      `Intereses: ${
        user.hobbies.length > 0 ? user.hobbies.join(', ') : 'sin intereses'
      }`,
      `Ciudad: ${user.city}`,
      `Tiene foto de perfil: ${user.photos.length > 0 ? 'sí' : 'no'}`,
      '',
      'Devuelve SOLO un JSON con este formato:',
      '{"score": <entero 1-10>, "headline": "<frase corta con humor>",',
      '"tips": ["consejo 1", "consejo 2", "consejo 3"]}',
      'Los tips deben ser concretos, accionables y en tono divertido.',
    ].join('\n');

    const raw = await this.callGemini(prompt);
    const parsed = this.parseJson<{
      score?: unknown;
      headline?: unknown;
      tips?: unknown;
    }>(raw);

    const rawScore = Number(parsed.score);
    const score = Number.isFinite(rawScore)
      ? Math.min(10, Math.max(1, Math.round(rawScore)))
      : 5;

    const headline =
      typeof parsed.headline === 'string' && parsed.headline.trim().length > 0
        ? parsed.headline.trim()
        : 'Tu perfil tiene potencial, ¡dale una segunda pasada!';

    const tips = Array.isArray(parsed.tips)
      ? parsed.tips
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .slice(0, 3)
      : [];

    if (tips.length === 0) {
      throw new BadRequestException(
        'La IA no generó consejos válidos. Intenta de nuevo.',
      );
    }

    return { score, headline, tips, aiLeft };
  }
}
