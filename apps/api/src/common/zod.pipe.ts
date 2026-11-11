import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valide et transforme une entrée avec un schéma Zod partagé (@plateforme/contracts). */
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
