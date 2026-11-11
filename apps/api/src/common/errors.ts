import { ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';

/** Erreurs métier avec un code stable exploitable par le front. */
export const notFound = (message = 'Ressource introuvable.') =>
  new NotFoundException({ statusCode: 404, error: 'NOT_FOUND', message });
export const forbidden = (message = "Vous n'avez pas l'autorisation d'effectuer cette action.", code = 'FORBIDDEN') =>
  new ForbiddenException({ statusCode: 403, error: code, message });
export const conflict = (code: string, message: string) => new ConflictException({ statusCode: 409, error: code, message });
export const unprocessable = (code: string, message: string) =>
  new HttpException({ statusCode: 422, error: code, message }, HttpStatus.UNPROCESSABLE_ENTITY);
