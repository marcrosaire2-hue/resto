'use client';
import { api, ApiError } from './api';

export type MediaPurpose = 'avatar' | 'restaurant_logo' | 'restaurant_cover' | 'product_image' | 'cuisine_image' | 'courier_document';
interface Signature { uploadUrl: string; apiKey: string; params: Record<string, string | number>; signature: string; maxBytes: number }

/**
 * Téléversement direct navigateur → Cloudinary avec une signature délivrée par l'API
 * (le secret ne quitte jamais le serveur ; le dossier est imposé selon les permissions).
 */
export async function uploadImage(file: File, purpose: MediaPurpose, restaurantId?: string): Promise<{ publicId: string; url: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ApiError(400, 'INVALID_FILE', 'Formats acceptés : JPG, PNG, WebP.');
  const sig = await api<Signature>('/media/signature', { method: 'POST', body: { purpose, restaurantId } });
  // Les fichiers privés sont envoyés sur l'URL d'upload « authenticated » (le type fait partie des paramètres signés).
  if (file.size > sig.maxBytes) throw new ApiError(400, 'FILE_TOO_LARGE', `Image trop lourde (maximum ${Math.round(sig.maxBytes / 1024 / 1024)} Mo).`);
  const form = new FormData();
  Object.entries(sig.params).forEach(([k, v]) => form.append(k, String(v)));
  form.append('api_key', sig.apiKey);
  form.append('signature', sig.signature);
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Envoi impossible. Vérifiez votre connexion.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', body?.error?.message ?? 'Le téléversement a échoué.');
  return { publicId: body.public_id, url: body.secure_url };
}
