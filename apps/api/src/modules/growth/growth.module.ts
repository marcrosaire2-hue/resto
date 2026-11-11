import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Post, Put, Req } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { adCampaignSchema, couponSchema, homeSectionSchema, planSchema } from '@plateforme/contracts';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { GROWTH_SCHEMAS } from './growth.schemas';
import { GrowthService } from './growth.service';

const subscribeBody = z.object({ planId: z.string().regex(/^[a-f0-9]{24}$/i) });

@ApiTags('admin')
@Controller('admin')
class GrowthController {
  constructor(private readonly g: GrowthService) {}

  @Get('coupons') @RequirePermission('commercial.coupons.manage') coupons() { return this.g.listCoupons(); }
  @Post('coupons') @RequirePermission('commercial.coupons.manage') createCoupon(@Body(new ZodPipe(couponSchema)) b: z.output<typeof couponSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.saveCoupon(null, b, a.userId, requestMeta(r)); }
  @Put('coupons/:id') @RequirePermission('commercial.coupons.manage') updateCoupon(@Param('id') id: string, @Body(new ZodPipe(couponSchema)) b: z.output<typeof couponSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.saveCoupon(toObjectId(id), b, a.userId, requestMeta(r)); }

  @Get('plans') @RequirePermission('commercial.plans.manage') plans() { return this.g.listPlans(); }
  @Post('plans') @RequirePermission('commercial.plans.manage') createPlan(@Body(new ZodPipe(planSchema)) b: z.output<typeof planSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.savePlan(null, b, a.userId, requestMeta(r)); }
  @Put('plans/:id') @RequirePermission('commercial.plans.manage') updatePlan(@Param('id') id: string, @Body(new ZodPipe(planSchema)) b: z.output<typeof planSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.savePlan(toObjectId(id), b, a.userId, requestMeta(r)); }
  @Get('subscriptions') @RequirePermission('commercial.plans.manage') subscriptions() { return this.g.subscriptions(); }
  @Post('restaurants/:id/subscription') @RequirePermission('commercial.plans.manage')
  subscribe(@Param('id') id: string, @Body(new ZodPipe(subscribeBody)) b: z.output<typeof subscribeBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.subscribe(toObjectId(id), toObjectId(b.planId), a.userId, requestMeta(r)); }

  @Get('ads') @RequirePermission('commercial.ads.manage') ads() { return this.g.listAds(); }
  @Post('ads') @RequirePermission('commercial.ads.manage') createAd(@Body(new ZodPipe(adCampaignSchema)) b: z.output<typeof adCampaignSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.saveAd(null, b, a.userId, requestMeta(r)); }
  @Put('ads/:id') @RequirePermission('commercial.ads.manage') updateAd(@Param('id') id: string, @Body(new ZodPipe(adCampaignSchema)) b: z.output<typeof adCampaignSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.saveAd(toObjectId(id), b, a.userId, requestMeta(r)); }

  @Get('home-sections') @RequirePermission('admin.content.manage') sections() { return this.g.listSections(); }
  @Post('home-sections') @RequirePermission('admin.content.manage') createSection(@Body(new ZodPipe(homeSectionSchema)) b: z.output<typeof homeSectionSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.saveSection(null, b, a.userId, requestMeta(r)); }
  @Put('home-sections/:id') @RequirePermission('admin.content.manage') updateSection(@Param('id') id: string, @Body(new ZodPipe(homeSectionSchema)) b: z.output<typeof homeSectionSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.saveSection(toObjectId(id), b, a.userId, requestMeta(r)); }
  @Delete('home-sections/:id') @HttpCode(204) @RequirePermission('admin.content.manage') deleteSection(@Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.g.deleteSection(toObjectId(id), a.userId, requestMeta(r)); }
}

@Global()
@Module({ imports: [MongooseModule.forFeature(GROWTH_SCHEMAS)], controllers: [GrowthController], providers: [GrowthService], exports: [GrowthService] })
export class GrowthModule {}
