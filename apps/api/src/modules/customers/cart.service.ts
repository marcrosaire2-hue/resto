import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { cartItemSchema } from '@plateforme/contracts';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { Product } from '../menu/menu.schemas';
import { Cart } from './customer.schemas';

type ItemInput = z.output<typeof cartItemSchema>;
const MAX_LINES = 30;
export const cartKey = (i: { productId: string; variants: Record<string, string>; addons: string[]; instructions: string }) =>
  `${i.productId}|${Object.keys(i.variants).sort().map((k) => `${k}:${i.variants[k]}`).join(',')}|${[...i.addons].sort().join(',')}|${i.instructions}`;

@Injectable()
export class CartService {
  constructor(@InjectModel(Cart.name) private readonly carts: Model<Cart>, @InjectModel(Product.name) private readonly products: Model<Product>) {}

  async raw(userId: string) {
    return this.carts.findOne({ userId: new Types.ObjectId(userId) }).lean();
  }

  /** Ajoute une ligne. Un panier ne contient qu'un restaurant ; `replace` vide l'ancien panier. */
  async add(userId: string, input: ItemInput, replace: boolean) {
    const product = await this.products.findOne({ _id: input.productId, status: 'PUBLISHED' }).setOptions({ crossTenant: true }).lean();
    if (!product) throw notFound('Plat introuvable.');
    const uid = new Types.ObjectId(userId);
    const cart = await this.carts.findOne({ userId: uid });
    const sameRestaurant = !cart?.restaurantId || cart.items.length === 0 || cart.restaurantId.equals(product.restaurantId);
    if (!sameRestaurant && !replace) {
      throw conflict('OTHER_RESTAURANT', 'Votre panier contient des plats d’un autre restaurant. Une commande ne concerne qu’un seul restaurant.');
    }
    const items = sameRestaurant ? (cart?.items ?? []) : [];
    const key = cartKey(input);
    const existing = items.find((i) => i.key === key);
    if (existing) existing.qty = Math.min(99, existing.qty + input.qty);
    else {
      if (items.length >= MAX_LINES) throw unprocessable('CART_FULL', 'Panier plein.');
      items.push({ key, productId: new Types.ObjectId(input.productId), qty: input.qty, variants: input.variants, addons: input.addons, instructions: input.instructions });
    }
    await this.carts.updateOne({ userId: uid }, { restaurantId: product.restaurantId, items }, { upsert: true });
  }

  async setQty(userId: string, key: string, qty: number) {
    const uid = new Types.ObjectId(userId);
    const cart = await this.carts.findOne({ userId: uid });
    if (!cart?.items.some((i) => i.key === key)) throw notFound('Ligne introuvable.');
    const items = qty > 0 ? cart.items.map((i) => (i.key === key ? { ...i, qty: Math.min(99, qty) } : i)) : cart.items.filter((i) => i.key !== key);
    await this.carts.updateOne({ userId: uid }, { items, ...(items.length ? {} : { restaurantId: null }) });
  }

  async clear(userId: string) {
    await this.carts.updateOne({ userId: new Types.ObjectId(userId) }, { items: [], restaurantId: null, couponCode: null });
  }

  async setCoupon(userId: string, code: string | null) {
    await this.carts.updateOne({ userId: new Types.ObjectId(userId) }, { couponCode: code ? code.trim().toUpperCase().slice(0, 20) : null }, { upsert: true });
  }
}
