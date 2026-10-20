import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_SUPABASE_URL = 'https://ekeylzczyjfcrsevbufw.supabase.co';
const DEFAULT_STORAGE_BUCKET = 'cuy-amor-storage';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);

  private get baseUrl(): string {
    return process.env.SUPABASE_URL?.replace(/\/$/, '') ?? DEFAULT_SUPABASE_URL;
  }

  private get bucket(): string {
    return process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_STORAGE_BUCKET;
  }

  private get serviceRoleKey(): string | undefined {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  /**
   * Extracts the object path from a public Supabase Storage URL.
   * e.g. https://<proj>.supabase.co/storage/v1/object/public/<bucket>/users/123/x.jpg
   *   -> users/123/x.jpg
   */
  storagePathFromPublicUrl(publicUrl: string): string | null {
    const markers = [
      `/object/public/${this.bucket}/`,
      `/object/sign/${this.bucket}/`,
    ];
    for (const marker of markers) {
      const index = publicUrl.indexOf(marker);
      if (index !== -1) {
        const path = decodeURIComponent(
          publicUrl.slice(index + marker.length).split('?')[0],
        );
        return path.length > 0 ? path : null;
      }
    }
    return null;
  }

  /**
   * Deletes an object from Supabase Storage using the service-role key.
   * Never throws: deletion failures are logged so business flows can proceed.
   */
  async deleteObject(publicUrl: string): Promise<boolean> {
    const path = this.storagePathFromPublicUrl(publicUrl);
    if (!path) {
      this.logger.warn(
        `No se pudo extraer la ruta de storage desde: ${publicUrl}`,
      );
      return false;
    }

    const key = this.serviceRoleKey;
    if (!key) {
      this.logger.error(
        'SUPABASE_SERVICE_ROLE_KEY no está configurada; no se puede borrar el objeto',
      );
      return false;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${key}`,
            apikey: key,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(
          `Fallo al borrar ${path} (HTTP ${response.status}): ${body}`,
        );
        return false;
      }

      this.logger.log(`Objeto eliminado de storage: ${path}`);
      return true;
    } catch (error) {
      this.logger.error(`Error eliminando ${path} de storage`, error as Error);
      return false;
    }
  }
}
