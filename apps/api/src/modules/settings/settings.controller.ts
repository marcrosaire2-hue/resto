import { BadRequestException, Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isSettingKey, SETTINGS } from '@plateforme/contracts';
import { notFound } from '../../common/errors';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { RequirePermission } from '../rbac/require-permission';
import { SettingsService } from './settings.service';

@ApiTags('admin')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('admin.settings.view')
  list() {
    return this.settings.list();
  }

  @Put(':key')
  @RequirePermission('admin.settings.edit')
  async set(@Param('key') key: string, @Body() body: { value?: unknown }, @CurrentAuth() a: AuthContext, @Req() req: AppRequest) {
    if (!isSettingKey(key)) throw notFound('Paramètre inconnu.');
    const r = SETTINGS[key].schema.safeParse(body?.value);
    if (!r.success) {
      throw new BadRequestException({
        statusCode: 400, error: 'VALIDATION_ERROR', message: 'Valeur invalide.',
        issues: r.error.issues.map((i) => ({ path: 'value', message: i.message })),
      });
    }
    return this.settings.set(key, r.data, a.userId, requestMeta(req));
  }
}
