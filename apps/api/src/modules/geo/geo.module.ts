import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminGeoController } from './geo.controller';
import { City, CitySchema, Commune, CommuneSchema, DeliveryFeeRule, DeliveryFeeRuleSchema, DeliveryZone, DeliveryZoneSchema, Neighborhood, NeighborhoodSchema } from './geo.schemas';
import { GeoService } from './geo.service';

export const GEO_MODELS = MongooseModule.forFeature([
  { name: City.name, schema: CitySchema },
  { name: Commune.name, schema: CommuneSchema },
  { name: Neighborhood.name, schema: NeighborhoodSchema },
  { name: DeliveryZone.name, schema: DeliveryZoneSchema },
  { name: DeliveryFeeRule.name, schema: DeliveryFeeRuleSchema },
]);

@Global()
@Module({
  imports: [GEO_MODELS],
  controllers: [AdminGeoController],
  providers: [GeoService],
  exports: [GeoService, GEO_MODELS],
})
export class GeoModule {}
