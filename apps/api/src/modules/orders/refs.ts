import { Injectable } from '@nestjs/common';
import { ContractsService } from '../commercial/contracts.service';

/** Regroupe les dépendances commerciales des commandes (évite les imports croisés). */
@Injectable()
export class CommercialModuleRef {
  constructor(readonly contracts: ContractsService) {}
}
