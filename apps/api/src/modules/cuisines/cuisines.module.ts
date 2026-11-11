import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CuisineCategory, CuisineCategorySchema } from './cuisine.schema';
import { AdminCuisinesController } from './cuisines.controller';
import { CuisinesService } from './cuisines.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: CuisineCategory.name, schema: CuisineCategorySchema }])],
  controllers: [AdminCuisinesController],
  providers: [CuisinesService],
  exports: [CuisinesService],
})
export class CuisinesModule {}
