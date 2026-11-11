import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { env } from '../../common/env';
import { forbidden, notFound } from '../../common/errors';
import { PermissionService } from '../rbac/permission.service';
import { cloudinaryConfig, publicIdInFolder, signUploadParams } from './cloudinary';

export const MEDIA_PURPOSES = ['avatar', 'restaurant_logo', 'restaurant_cover', 'product_image', 'cuisine_image', 'courier_document'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

const PURPOSE_RULES: Record<MediaPurpose, { permission: 'restaurant.profile.edit' | 'menu.edit' | 'admin.content.manage' | null; subfolder: string }> = {
  avatar: { permission: null, subfolder: 'avatars' },
  cuisine_image: { permission: 'admin.content.manage', subfolder: 'cuisines' },
  courier_document: { permission: null, subfolder: 'courier' },
  restaurant_logo: { permission: 'restaurant.profile.edit', subfolder: 'logo' },
  restaurant_cover: { permission: 'restaurant.profile.edit', subfolder: 'cover' },
  product_image: { permission: 'menu.edit', subfolder: 'products' },
};

export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@Injectable()
export class MediaService {
  constructor(private readonly perms: PermissionService) {}

  folderFor(purpose: MediaPurpose, ctx: { userId: string; restaurantId?: string }) {
    const root = `${env().MEDIA_FOLDER_PREFIX}/${env().NODE_ENV}`;
    if (purpose === 'avatar') return `${root}/users/${ctx.userId}/avatars`;
    if (purpose === 'cuisine_image') return `${root}/platform/cuisines`;
    if (purpose === 'courier_document') return `${root}/users/${ctx.userId}/courier`;
    return `${root}/restaurants/${ctx.restaurantId}/${PURPOSE_RULES[purpose].subfolder}`;
  }

  async createSignature(userId: string, purpose: MediaPurpose, restaurantId?: string) {
    const cfg = cloudinaryConfig();
    if (!cfg) {
      throw new HttpException(
        { statusCode: 503, error: 'MEDIA_NOT_CONFIGURED', message: "Le stockage d'images n'est pas encore configuré." },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const rule = PURPOSE_RULES[purpose];
    if (rule.permission === 'admin.content.manage') {
      const { permissions } = await this.perms.platform(userId);
      if (!permissions.has('admin.content.manage')) throw forbidden();
    } else if (rule.permission) {
      if (!restaurantId || !/^[a-f0-9]{24}$/i.test(restaurantId)) throw notFound();
      const access = await this.perms.restaurant(userId, new Types.ObjectId(restaurantId));
      if (access.kind === 'none') throw notFound();
      if (access.kind === 'blocked' || !access.permissions.has(rule.permission as 'menu.edit')) throw forbidden();
    }
    const folder = this.folderFor(purpose, { userId, restaurantId });
    const timestamp = Math.floor(Date.now() / 1000);
    // Documents des livreurs : fichiers privés (« authenticated »), jamais accessibles par une URL publique.
    const params: Record<string, string | number> = purpose === 'courier_document'
      ? { allowed_formats: ALLOWED_FORMATS, folder, timestamp, type: 'authenticated' }
      : { allowed_formats: ALLOWED_FORMATS, folder, timestamp };
    return {
      cloudName: cfg.cloudName,
      apiKey: cfg.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
      params,
      signature: signUploadParams(params, cfg.apiSecret),
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }
}

/** Le public_id renvoyé par le navigateur doit être dans le dossier imposé par le serveur. */
export function assertImageFolder(publicId: string | null | undefined, folder: string) {
  if (publicId && !publicIdInFolder(publicId, folder)) {
    throw new HttpException({ statusCode: 422, error: 'INVALID_IMAGE', message: "Cette image n'appartient pas à ce restaurant." }, 422);
  }
}
