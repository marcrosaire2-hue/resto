import { randomInt } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { EmailCodePurpose } from '@plateforme/contracts';
import { sha256 } from '../../common/crypto';
import { Mailer } from '../mail/brevo.mailer';

/* Paramètres de sécurité (pas des valeurs commerciales). */
export const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 60;
const MAX_SENDS_PER_HOUR = 5;

@Schema({ collection: 'email_codes', timestamps: { createdAt: true, updatedAt: false } })
export class EmailCode {
  @Prop({ required: true, index: true }) email: string;
  @Prop({ type: String, required: true }) purpose: EmailCodePurpose;
  @Prop({ required: true }) codeHash: string;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) consumedAt: Date | null;
  createdAt: Date;
}
export const EmailCodeSchema = SchemaFactory.createForClass(EmailCode);
// Les codes expirés disparaissent d'eux-mêmes (une heure de marge pour la limite d'envois).
EmailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const hash = (email: string, purpose: string, code: string) => sha256(`${email}:${purpose}:${code}`);
const err = (status: number, error: string, message: string) => new HttpException({ statusCode: status, error, message }, status);

/** Codes temporaires à 6 chiffres envoyés par e-mail : un seul actif par adresse et usage, stocké haché. */
@Injectable()
export class EmailCodeService {
  constructor(@InjectModel(EmailCode.name) private readonly codes: Model<EmailCode>, private readonly mailer: Mailer) {}

  async send(email: string, purpose: EmailCodePurpose) {
    const since = new Date(Date.now() - 3600_000);
    const recent = await this.codes.find({ email, purpose, createdAt: { $gt: since } }).sort({ createdAt: -1 }).lean();
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_S * 1000) {
      const wait = Math.ceil((RESEND_COOLDOWN_S * 1000 - (Date.now() - recent[0].createdAt.getTime())) / 1000);
      throw err(429, 'CODE_TOO_SOON', `Patientez ${wait} secondes avant de demander un nouveau code.`);
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) throw err(429, 'CODE_TOO_MANY', 'Trop de codes demandés. Réessayez dans une heure.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.codes.updateMany({ email, purpose, consumedAt: null }, { consumedAt: new Date() }); // un seul code valide
    const doc = await this.codes.create({ email, purpose, codeHash: hash(email, purpose, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000) });
    try {
      await this.mailer.sendCode(email, code, purpose, CODE_TTL_MIN);
    } catch (e) {
      await this.codes.deleteOne({ _id: doc._id }); // échec d'envoi : ne bloque pas une nouvelle demande
      throw e;
    }
  }

  /** Vérifie et consomme le code. Après 5 erreurs, le code est invalidé. */
  async consume(email: string, purpose: EmailCodePurpose, code: string) {
    const c = await this.codes.findOne({ email, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!c) throw err(400, 'CODE_EXPIRED', 'Code expiré ou introuvable. Demandez un nouveau code.');
    if (c.codeHash !== hash(email, purpose, code)) {
      const attempts = c.attempts + 1;
      await this.codes.updateOne({ _id: c._id }, attempts >= MAX_ATTEMPTS ? { attempts, consumedAt: new Date() } : { attempts });
      throw attempts >= MAX_ATTEMPTS
        ? err(400, 'CODE_LOCKED', 'Trop d’essais : ce code n’est plus valable. Demandez un nouveau code.')
        : err(400, 'CODE_INVALID', `Code incorrect. Il reste ${MAX_ATTEMPTS - attempts} essai${MAX_ATTEMPTS - attempts > 1 ? 's' : ''}.`);
    }
    const r = await this.codes.updateOne({ _id: c._id, consumedAt: null }, { consumedAt: new Date() });
    if (r.modifiedCount !== 1) throw err(400, 'CODE_EXPIRED', 'Code déjà utilisé. Demandez un nouveau code.');
  }
}
