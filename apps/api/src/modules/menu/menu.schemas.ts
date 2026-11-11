import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { tenantScopedPlugin } from '../../database/plugins';

@Schema({ collection: 'menu_categories', timestamps: true })
export class MenuCategory {
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: String, required: true, trim: true }) name: string;
  @Prop({ type: Number, default: 0 }) sort: number;
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);
MenuCategorySchema.index({ restaurantId: 1, sort: 1 });
MenuCategorySchema.plugin(tenantScopedPlugin);

@Schema({ _id: false })
export class VariantOption { @Prop({ type: String, required: true }) id: string; @Prop({ type: String, required: true }) name: string; @Prop({ type: Number, required: true }) priceDelta: number; }
@Schema({ _id: false })
export class VariantGroup { @Prop({ type: String, required: true }) id: string; @Prop({ type: String, required: true }) name: string; @Prop({ type: [VariantOption], default: [] }) options: VariantOption[]; }
@Schema({ _id: false })
export class AddonOption { @Prop({ type: String, required: true }) id: string; @Prop({ type: String, required: true }) name: string; @Prop({ type: Number, required: true }) price: number; @Prop({ type: Boolean, default: true }) available: boolean; }
@Schema({ _id: false })
export class AddonGroup {
  @Prop({ type: String, required: true }) id: string; @Prop({ type: String, required: true }) name: string;
  @Prop({ type: Number, default: 0 }) min: number; @Prop({ type: Number, default: 1 }) max: number;
  @Prop({ type: [AddonOption], default: [] }) options: AddonOption[];
}

export type ProductStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Plat. Un plat déjà commandé n'est jamais supprimé : il est archivé (les commandes gardent leurs instantanés). */
@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) menuCategoryId: Types.ObjectId;
  @Prop({ type: String, required: true, trim: true }) name: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger }) basePrice: number;
  @Prop({ type: [String], default: [] }) images: string[];
  @Prop({ type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' }) status: ProductStatus;
  @Prop({ type: Boolean, default: true }) available: boolean;
  @Prop({ type: [String], default: [] }) allergens: string[];
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ type: Number, default: null }) prepMinutes: number | null;
  @Prop({ type: [VariantGroup], default: [] }) variantGroups: VariantGroup[];
  @Prop({ type: [AddonGroup], default: [] }) addonGroups: AddonGroup[];
  @Prop({ type: Number, default: 0 }) sort: number;
  @Prop({ type: String, default: '' }) searchText: string;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ restaurantId: 1, status: 1, menuCategoryId: 1, sort: 1 });
ProductSchema.plugin(tenantScopedPlugin);
