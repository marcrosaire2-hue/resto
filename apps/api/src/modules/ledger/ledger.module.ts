import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LedgerTransaction, LedgerTransactionSchema } from './ledger.schema';
import { LedgerService } from './ledger.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: LedgerTransaction.name, schema: LedgerTransactionSchema }])],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
