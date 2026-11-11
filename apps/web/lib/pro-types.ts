import type { OpeningSlot } from '@plateforme/contracts';

export interface ProfileFields {
  name: string; description: string; phone: string | null; whatsapp: string | null; email: string | null; address: string | null;
  neighborhoodId: string | null; cuisineIds: string[]; avgPrepMinutes: number; logoPublicId: string | null; coverPublicId: string | null;
}
export interface ProProfile {
  id: string; slug: string; status: string; statusReason: string | null; publishedAt: string | null; acceptingOrders: boolean;
  openingHours: OpeningSlot[]; closures: { from: string; to: string; reason: string | null }[]; zoneIds: string[]; isDemo: boolean;
  live: ProfileFields; draft: ProfileFields | null; hasDraft: boolean;
  preview: ProfileFields & { logoUrl: string | null; coverUrl: string | null };
}
export interface ProProduct {
  id: string; menuCategoryId: string; name: string; description: string; basePrice: number; images: string[]; imageUrls: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; available: boolean; allergens: string[]; tags: string[]; prepMinutes: number | null;
  variantGroups: { id: string; name: string; options: { id: string; name: string; priceDelta: number }[] }[];
  addonGroups: { id: string; name: string; min: number; max: number; options: { id: string; name: string; price: number; available: boolean }[] }[];
}
export interface ProMenu { categories: { id: string; name: string; active: boolean; sort: number }[]; products: ProProduct[] }
