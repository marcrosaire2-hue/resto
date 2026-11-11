import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { toObjectId } from '../../common/object-id';
import { Public } from '../../common/request-context';
import { CuisinesService } from '../cuisines/cuisines.service';
import { GeoService } from '../geo/geo.service';
import { CatalogService, CatalogSort } from './catalog.service';

const SORTS: CatalogSort[] = ['popular', 'rating', 'new', 'prep'];

/** Catalogue public : aucune donnée privée (finances, employés, contrats) n'est exposée ici. */
@ApiTags('catalogue')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly cuisines: CuisinesService, private readonly geo: GeoService) {}

  @Get('cuisines')
  async listCuisines() {
    return (await this.cuisines.list(true)).map(({ id, name, slug, imageUrl, emoji }) => ({ id, name, slug, imageUrl, emoji }));
  }

  @Get('zones')
  zones() {
    return this.geo.tree(true);
  }

  @Get('delivery-zones')
  async deliveryZones() {
    const { zones } = await this.geo.listZones();
    return zones.filter((z) => z.active).map(({ id, name }) => ({ id, name }));
  }

  @Get('restaurants')
  restaurants(@Query('q') q?: string, @Query('cuisine') cuisine?: string, @Query('open') open?: string, @Query('sort') sort?: string, @Query('limit') limit?: string) {
    return this.catalog.listRestaurants({
      q: q?.slice(0, 80) || undefined, cuisine, openNow: open === '1',
      sort: SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : 'popular',
      limit: Number(limit) > 0 ? Number(limit) : 50,
    });
  }

  @Get('restaurants/:slug')
  restaurant(@Param('slug') slug: string) {
    return this.catalog.restaurantBySlug(slug.slice(0, 120));
  }

  @Get('products/:id')
  product(@Param('id') id: string) {
    return this.catalog.product(toObjectId(id));
  }

  @Get('search')
  search(@Query('q') q?: string) {
    const term = (q ?? '').trim().slice(0, 80);
    if (term.length < 2) return { restaurants: [], products: [] };
    return this.catalog.search(term);
  }
}
