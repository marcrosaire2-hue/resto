import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnlyPlugin } from '../../database/plugins';

@Schema({ _id: false })
export class LedgerEntry {
  @Prop({ type: String, required: true }) account: string;
  @Prop({ type: Number, default: 0, min: 0, validate: Number.isInteger }) debit: number;
  @Prop({ type: Number, default: 0, min: 0, validate: Number.isInteger }) credit: number;
}

/**
 * Transaction du grand livre en partie double : écritures équilibrées, ajout seul.
 * (type, reference) unique : une même commande n'est jamais comptabilisée deux fois.
 */
@Schema({ collection: 'ledger_transactions', timestamps: { createdAt: true, updatedAt: false } })
export class LedgerTransaction {
  @Prop({ type: String, required: true }) type: string;
  @Prop({ type: String, required: true }) reference: string;
  @Prop({ type: Types.ObjectId, default: null }) restaurantId: Types.ObjectId | null;
  @Prop({ type: [LedgerEntry], required: true }) entries: LedgerEntry[];
  @Prop({ type: String, default: null }) description: string | null;
  @Prop({ type: Types.ObjectId, default: null }) createdBy: Types.ObjectId | null;
  createdAt: Date;
}
export const LedgerTransactionSchema = SchemaFactory.createForClass(LedgerTransaction);
LedgerTransactionSchema.index({ type: 1, reference: 1 }, { unique: true });
LedgerTransactionSchema.index({ 'entries.account': 1 });
LedgerTransactionSchema.pre('validate', function () {
  const d = this.entries.reduce((s, e) => s + e.debit, 0);
  const c = this.entries.reduce((s, e) => s + e.credit, 0);
  if (d !== c) throw new Error(`LEDGER_UNBALANCED: débit ${d} ≠ crédit ${c}`);
  if (this.entries.some((e) => (e.debit > 0) === (e.credit > 0))) throw new Error('LEDGER_INVALID_ENTRY: une écriture est soit au débit, soit au crédit');
});
LedgerTransactionSchema.plugin(appendOnlyPlugin);
