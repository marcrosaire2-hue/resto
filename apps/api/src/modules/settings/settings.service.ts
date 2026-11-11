import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { SETTING_KEYS, SettingKey, SETTINGS } from '@plateforme/contracts';
import { AuditService } from '../audit/audit.service';
import { PlatformSetting } from './platform-setting.schema';

export type SettingValue<K extends SettingKey> = z.output<(typeof SETTINGS)[K]['schema']>;

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(PlatformSetting.name) private readonly model: Model<PlatformSetting>,
    private readonly audit: AuditService,
  ) {}

  /** `null` = non configuré. Les fonctionnalités dépendantes doivent alors refuser d'agir. */
  async get<K extends SettingKey>(key: K): Promise<SettingValue<K> | null> {
    const doc = await this.model.findOne({ key }).lean();
    if (!doc || doc.value === null) return null;
    const r = SETTINGS[key].schema.safeParse(doc.value);
    return r.success ? (r.data as SettingValue<K>) : null;
  }

  async list() {
    const docs = await this.model.find({ key: { $in: SETTING_KEYS } }).lean();
    const byKey = new Map(docs.map((d) => [d.key, d]));
    return SETTING_KEYS.map((key) => ({
      key,
      label: SETTINGS[key].label,
      value: byKey.get(key)?.value ?? null,
      configured: byKey.get(key)?.value != null,
      updatedAt: byKey.get(key)?.updatedAt ?? null,
    }));
  }

  async set(key: SettingKey, value: unknown, actorUserId: string, meta: { ip: string | null; userAgent: string | null }) {
    const parsed = SETTINGS[key].schema.parse(value);
    const before = await this.model.findOne({ key }).lean();
    await this.model.updateOne(
      { key },
      { value: parsed, updatedBy: new Types.ObjectId(actorUserId) },
      { upsert: true },
    );
    await this.audit.record({
      actorUserId, scope: 'platform', action: 'settings.update', entity: 'platform_setting', entityId: key,
      before: before?.value ?? null, after: parsed, ...meta,
    });
    return { key, value: parsed };
  }
}
