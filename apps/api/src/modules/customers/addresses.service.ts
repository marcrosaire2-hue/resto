import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { addressSchema } from '@plateforme/contracts';
import { notFound, unprocessable } from '../../common/errors';
import { GeoService } from '../geo/geo.service';
import { CustomerAddress } from './customer.schemas';

const MAX_ADDRESSES = 10;

@Injectable()
export class AddressesService {
  constructor(@InjectModel(CustomerAddress.name) private readonly model: Model<CustomerAddress>, private readonly geo: GeoService) {}

  async list(userId: string) {
    const docs = await this.model.find({ userId: new Types.ObjectId(userId), archivedAt: null }).sort({ isDefault: -1, createdAt: 1 }).lean();
    const names = await this.geo.namesFor(docs.map((d) => d.neighborhoodId));
    return docs.map((d) => ({
      id: String(d._id), label: d.label, neighborhoodId: String(d.neighborhoodId), streetLandmark: d.streetLandmark,
      instructions: d.instructions, lat: d.lat, lng: d.lng, isDefault: d.isDefault,
      neighborhood: names.get(String(d.neighborhoodId))?.neighborhood ?? null, commune: names.get(String(d.neighborhoodId))?.commune ?? null,
    }));
  }

  async get(userId: string, id: string) {
    const d = await this.model.findOne({ _id: id, userId: new Types.ObjectId(userId), archivedAt: null }).lean();
    if (!d) throw notFound('Adresse introuvable.');
    return d;
  }

  private async clearDefault(userId: Types.ObjectId) {
    await this.model.updateMany({ userId, isDefault: true }, { isDefault: false });
  }

  async create(userId: string, input: z.output<typeof addressSchema>) {
    const uid = new Types.ObjectId(userId);
    if ((await this.model.countDocuments({ userId: uid, archivedAt: null })) >= MAX_ADDRESSES) throw unprocessable('TOO_MANY_ADDRESSES', `Maximum ${MAX_ADDRESSES} adresses.`);
    if (!(await this.geo.resolveNeighborhood(input.neighborhoodId))) throw unprocessable('UNKNOWN_NEIGHBORHOOD', 'Quartier inconnu ou non desservi.');
    const first = !(await this.model.exists({ userId: uid, archivedAt: null }));
    if (input.isDefault) await this.clearDefault(uid);
    const d = await this.model.create({ ...input, userId: uid, neighborhoodId: new Types.ObjectId(input.neighborhoodId), isDefault: input.isDefault || first });
    return { id: String(d._id) };
  }

  async update(userId: string, id: string, input: z.output<typeof addressSchema>) {
    const uid = new Types.ObjectId(userId);
    await this.get(userId, id);
    if (!(await this.geo.resolveNeighborhood(input.neighborhoodId))) throw unprocessable('UNKNOWN_NEIGHBORHOOD', 'Quartier inconnu ou non desservi.');
    if (input.isDefault) await this.clearDefault(uid);
    await this.model.updateOne({ _id: id, userId: uid }, { ...input, neighborhoodId: new Types.ObjectId(input.neighborhoodId) });
    return { id };
  }

  /** Archivage (les commandes passées gardent leur instantané d'adresse). */
  async remove(userId: string, id: string) {
    const uid = new Types.ObjectId(userId);
    const d = await this.get(userId, id);
    await this.model.updateOne({ _id: id, userId: uid }, { archivedAt: new Date(), isDefault: false });
    if (d.isDefault) {
      const next = await this.model.findOne({ userId: uid, archivedAt: null }).sort({ createdAt: 1 });
      if (next) await this.model.updateOne({ _id: next._id }, { isDefault: true });
    }
  }
}
