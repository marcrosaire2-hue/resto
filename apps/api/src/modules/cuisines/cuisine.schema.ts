import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Catégories de la marketplace (Cuisine africaine, Grillades…), administrables. */
@Schema({ collection: 'cuisine_categories', timestamps: true })
export class CuisineCategory {
  @Prop({ type: String, required: true, trim: true }) name: string;
  @Prop({ type: String, required: true, unique: true }) slug: string;
  @Prop({ type: String, default: null }) imagePublicId: string | null;
  @Prop({ type: String, default: null }) emoji: string | null;
  @Prop({ type: Number, default: 0 }) sort: number;
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export const CuisineCategorySchema = SchemaFactory.createForClass(CuisineCategory);
