import { Body, Controller, Get, Global, Module, Param, Post, Put, Req } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { promotionSchema } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, CurrentTenant, requestMeta, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { Promotion, PromotionSchema } from './promotion.schema';
import { PromotionsService } from './promotions.service';

@ApiTags('restaurant')
@Controller('restaurants/:restaurantId/promotions')
class PromotionsController {
  constructor(private readonly service: PromotionsService) {}
  @Get() @RequirePermission('promotions.manage')
  list(@CurrentTenant() t: TenantContext) { return this.service.list(t.restaurantId); }
  @Post() @RequirePermission('promotions.manage')
  create(@CurrentTenant() t: TenantContext, @Body(new ZodPipe(promotionSchema)) b: z.output<typeof promotionSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.save(t.restaurantId, null, b, a.userId, requestMeta(r));
  }
  @Put(':id') @RequirePermission('promotions.manage')
  update(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body(new ZodPipe(promotionSchema)) b: z.output<typeof promotionSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.save(t.restaurantId, toObjectId(id), b, a.userId, requestMeta(r));
  }
}

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Promotion.name, schema: PromotionSchema }])],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
