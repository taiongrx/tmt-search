export type ConceptType = 'SUBS' | 'VTM' | 'GP' | 'TP' | 'GPU' | 'TPU' | 'GPP' | 'TPP';

export interface Concept {
  id: string;
  type: ConceptType;
  fsn: string;
  mfr?: string;
  date?: string;
  // Extra detailed TPU attributes from MasterTMT:
  strength?: string;
  dosageForm?: string;
  contValue?: string;
  contUnit?: string;
  dispUnit?: string;
  tradeName?: string;
  activeIngredient?: string;
  statusLabel?: string;
}

export interface SearchItem {
  id: string;
  fsn: string;
  mfr?: string;
  tradeName?: string;
}

export interface MetaInfo {
  version: string;
  releaseDate: string;
  conceptCounts: Record<ConceptType, number>;
  totalConcepts: number;
  totalRelations: number;
}

export interface RelationNode {
  id: string;
  type: ConceptType;
}

export interface ConceptRelation {
  parents: RelationNode[];
  children: RelationNode[];
}

export type RelationsMap = Record<string, ConceptRelation>;

export interface LocalDrugItem {
  localCode: string;
  localName: string;
  strength?: string;
  dosageForm?: string;
  // Mapped output:
  mappedTmtId?: string;
  mappedTmtFsn?: string;
  mappedTmtType?: ConceptType;
  mappedAtcCode?: string;
  confidence?: number;
  matchType?: 'exact' | 'fuzzy' | 'none' | 'manual';
}
