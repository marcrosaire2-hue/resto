import { isValidObjectId, Types } from 'mongoose';
import { notFound } from './errors';

/** Convertit un identifiant d'URL ; un identifiant mal formé est traité comme introuvable. */
export function toObjectId(id: string): Types.ObjectId {
  if (!isValidObjectId(id) || !/^[a-f0-9]{24}$/i.test(id)) throw notFound();
  return new Types.ObjectId(id);
}
