import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { GeoService } from './geo.service';

const oid = z.string().regex(/^[a-f0-9]{24}$/i);
const nameSchema = z.object({ name: z.string().trim().min(2).max(80) });
const childSchema = nameSchema.extend({ parentId: oid });
const patchSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), active: z.boolean().optional() });
const zoneSchema = z.object({ name: z.string().trim().min(2).max(80), active: z.boolean().default(true), neighborhoodIds: z.array(oid).max(500) });
const feeSchema = z.object({
  fromZoneId: oid, toZoneId: oid,
  customerFee: z.number().int().min(0).max(100_000),
  courierPay: z.number().int().min(0).max(100_000),
});
const kind = z.enum(['city', 'commune', 'neighborhood']);

@ApiTags('admin')
@Controller('admin/geo')
export class AdminGeoController {
  constructor(private readonly geo: GeoService) {}

  @Get()
  @RequirePermission('admin.zones.manage')
  async all() {
    return { tree: await this.geo.tree(false), ...(await this.geo.listZones()) };
  }

  @Post('cities')
  @RequirePermission('admin.zones.manage')
  city(@Body(new ZodPipe(nameSchema)) b: z.output<typeof nameSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.createCity(b.name, a.userId, requestMeta(r));
  }

  @Post('communes')
  @RequirePermission('admin.zones.manage')
  commune(@Body(new ZodPipe(childSchema)) b: z.output<typeof childSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.createCommune(toObjectId(b.parentId), b.name, a.userId, requestMeta(r));
  }

  @Post('neighborhoods')
  @RequirePermission('admin.zones.manage')
  neighborhood(@Body(new ZodPipe(childSchema)) b: z.output<typeof childSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.createNeighborhood(toObjectId(b.parentId), b.name, a.userId, requestMeta(r));
  }

  @Patch(':kind/:id')
  @RequirePermission('admin.zones.manage')
  update(@Param('kind') k: string, @Param('id') id: string, @Body(new ZodPipe(patchSchema)) b: z.output<typeof patchSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.update(new ZodPipe(kind).transform(k), toObjectId(id), b, a.userId, requestMeta(r));
  }

  @Post('zones')
  @RequirePermission('admin.zones.manage')
  createZone(@Body(new ZodPipe(zoneSchema)) b: z.output<typeof zoneSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.saveZone(null, b, a.userId, requestMeta(r));
  }

  @Put('zones/:id')
  @RequirePermission('admin.zones.manage')
  updateZone(@Param('id') id: string, @Body(new ZodPipe(zoneSchema)) b: z.output<typeof zoneSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.saveZone(toObjectId(id), b, a.userId, requestMeta(r));
  }

  @Post('fee-rules')
  @RequirePermission('admin.zones.manage')
  fee(@Body(new ZodPipe(feeSchema)) b: z.output<typeof feeSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.geo.setFeeRule(b, a.userId, requestMeta(r));
  }
}
