import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../common/env';

export function cloudinaryConfig() {
  const e = env();
  if (!e.CLOUDINARY_CLOUD_NAME || !e.CLOUDINARY_API_KEY || !e.CLOUDINARY_API_SECRET) return null;
  return { cloudName: e.CLOUDINARY_CLOUD_NAME, apiKey: e.CLOUDINARY_API_KEY, apiSecret: e.CLOUDINARY_API_SECRET };
}

/** Signature d'un téléversement direct navigateur → Cloudinary. Le secret ne quitte jamais le serveur. */
export function signUploadParams(params: Record<string, string | number>, apiSecret: string): string {
  return cloudinary.utils.api_sign_request(params, apiSecret);
}

/** URL de diffusion optimisée (format et qualité automatiques, largeur bornée). */
export function deliveryUrl(cloudName: string, publicId: string, width = 800): string {
  const safeWidth = Math.min(Math.max(Math.round(width), 32), 2000);
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_limit,w_${safeWidth}/${publicId}`;
}

/** Vérifie qu'un public_id renvoyé par le navigateur appartient bien au dossier signé par le serveur. */
export function publicIdInFolder(publicId: string, folder: string): boolean {
  return publicId.startsWith(`${folder}/`) && !publicId.includes('..') && /^[\w\-/]+$/.test(publicId);
}

/** URL publique d'une image stockée, ou null si Cloudinary n'est pas configuré. */
export function imageUrl(publicId: string | null | undefined, width = 800): string | null {
  const cfg = cloudinaryConfig();
  return publicId && cfg ? deliveryUrl(cfg.cloudName, publicId, width) : null;
}
