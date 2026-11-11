import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MenuController } from './menu.controller';
import { MenuCategory, MenuCategorySchema, Product, ProductSchema } from './menu.schemas';
import { MenuService } from './menu.service';

export const MENU_MODELS = MongooseModule.forFeature([
  { name: MenuCategory.name, schema: MenuCategorySchema },
  { name: Product.name, schema: ProductSchema },
]);

@Global()
@Module({ imports: [MENU_MODELS], controllers: [MenuController], providers: [MenuService], exports: [MenuService, MENU_MODELS] })
export class MenuModule {}
