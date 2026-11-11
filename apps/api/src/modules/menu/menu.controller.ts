import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { menuCategorySchema, productSchema } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, CurrentTenant, requestMeta, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { MenuService } from './menu.service';

const orderSchema = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100) });
const availabilitySchema = z.object({ available: z.boolean() });

@ApiTags('restaurant')
@Controller('restaurants/:restaurantId/menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @RequirePermission('menu.view')
  get(@CurrentTenant() t: TenantContext, @Query('archived') archived?: string) {
    return this.menu.menu(t.restaurantId, archived === '1');
  }

  @Post('categories')
  @RequirePermission('menu.edit')
  createCategory(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(menuCategorySchema)) b: z.output<typeof menuCategorySchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.createCategory(t.restaurantId, b, a.userId, requestMeta(r));
  }

  @Put('categories/order')
  @RequirePermission('menu.edit')
  @HttpCode(204)
  reorder(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(orderSchema)) b: z.output<typeof orderSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.reorderCategories(t.restaurantId, b.ids, a.userId, requestMeta(r));
  }

  @Put('categories/:id')
  @RequirePermission('menu.edit')
  updateCategory(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body(new ZodPipe(menuCategorySchema)) b: z.output<typeof menuCategorySchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.updateCategory(t.restaurantId, toObjectId(id), b, a.userId, requestMeta(r));
  }

  @Delete('categories/:id')
  @RequirePermission('menu.edit')
  @HttpCode(204)
  deleteCategory(@CurrentTenant() t: TenantContext, @Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.deleteCategory(t.restaurantId, toObjectId(id), a.userId, requestMeta(r));
  }

  @Post('products')
  @RequirePermission('menu.edit')
  createProduct(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(productSchema)) b: z.output<typeof productSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.createProduct(t.restaurantId, b, a.userId, requestMeta(r));
  }

  @Put('products/:id')
  @RequirePermission('menu.edit')
  updateProduct(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body(new ZodPipe(productSchema)) b: z.output<typeof productSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.updateProduct(t.restaurantId, toObjectId(id), b, a.userId, requestMeta(r));
  }

  @Post('products/:id/publish')
  @RequirePermission('menu.publish')
  publish(@CurrentTenant() t: TenantContext, @Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.setStatus(t.restaurantId, toObjectId(id), 'PUBLISHED', a.userId, requestMeta(r));
  }

  @Post('products/:id/unpublish')
  @RequirePermission('menu.publish')
  unpublish(@CurrentTenant() t: TenantContext, @Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.setStatus(t.restaurantId, toObjectId(id), 'DRAFT', a.userId, requestMeta(r));
  }

  @Post('products/:id/archive')
  @RequirePermission('menu.edit')
  archive(@CurrentTenant() t: TenantContext, @Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.setStatus(t.restaurantId, toObjectId(id), 'ARCHIVED', a.userId, requestMeta(r));
  }

  @Patch('products/:id/availability')
  @RequirePermission('menu.availability.toggle')
  availability(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body(new ZodPipe(availabilitySchema)) b: z.output<typeof availabilitySchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.menu.setAvailability(t.restaurantId, toObjectId(id), b.available, a.userId, requestMeta(r));
  }
}
