import { Body, Controller, Get, Global, Module, Param, Put, Req } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RequirePermission } from '../rbac/require-permission';
import { RestaurantContract, RestaurantContractSchema } from './contract.schema';
import { ContractsService } from './contracts.service';

const contractSchema = z.object({
  commissionRateBps: z.number().int().min(0).max(10_000),
  reference: z.string().trim().max(80).optional(),
});

@ApiTags('admin')
@Controller('admin/restaurants/:id/contract')
class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  @RequirePermission('commercial.commissions.view')
  get(@Param('id') id: string) {
    return this.service.history(String(toObjectId(id)));
  }

  @Put()
  @RequirePermission('commercial.commissions.edit')
  set(@Param('id') id: string, @Body(new ZodPipe(contractSchema)) b: z.output<typeof contractSchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.service.set(toObjectId(id), b, a.userId, requestMeta(r));
  }
}

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: RestaurantContract.name, schema: RestaurantContractSchema }])],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class CommercialModule {}
