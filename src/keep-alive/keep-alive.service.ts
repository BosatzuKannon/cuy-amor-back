import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  constructor(private readonly configService: ConfigService) {}

  @Cron('0 */14 * * * *')
  async keepAlive() {
    const baseUrl = this.configService.get<string>('RENDER_EXTERNAL_URL');

    if (!baseUrl) {
      this.logger.debug(
        'RENDER_EXTERNAL_URL not set; skipping keep-alive ping',
      );
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `Keep-alive ping failed with status ${response.status}`,
        );
        return;
      }

      this.logger.log('Keep-alive ping sent successfully');
    } catch (error) {
      this.logger.warn(`Keep-alive ping failed: ${(error as Error).message}`);
    }
  }
}
