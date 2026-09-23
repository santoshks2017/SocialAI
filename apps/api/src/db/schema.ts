import { Prisma } from '../generated/client/index.js';

// Schema metadata for the Firestore adapter, read from the generated Prisma client's DMMF.

export interface FieldDef {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;
  isList: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  isUpdatedAt?: boolean;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
}

/** A relation seen from one model: related docs have `remote[i] === local[i]`. */
export interface RelationDef {
  name: string;
  target: string;
  isList: boolean;
  fkHere: boolean;
  local: string[];
  remote: string[];
}

export interface ModelDef {
  name: string;
  dbName: string | null;
  fields: Map<string, FieldDef>;
  scalars: FieldDef[];
  relations: Map<string, RelationDef>;
  compoundUniques: Map<string, string[]>;
}

interface RawModel {
  name: string;
  dbName: string | null;
  fields: FieldDef[];
  primaryKey: { name: string | null; fields: string[] } | null;
  uniqueIndexes: Array<{ name: string | null; fields: string[] }>;
}

const rawModels = Prisma.dmmf.datamodel.models as unknown as RawModel[];
const models = new Map<string, ModelDef>();

for (const raw of rawModels) {
  const fields = new Map(raw.fields.map((f) => [f.name, f]));
  const compoundUniques = new Map<string, string[]>();
  for (const idx of [...raw.uniqueIndexes, ...(raw.primaryKey ? [raw.primaryKey] : [])]) {
    if (idx.fields.length > 1) compoundUniques.set(idx.name ?? idx.fields.join('_'), idx.fields);
  }
  models.set(raw.name, {
    name: raw.name,
    dbName: raw.dbName,
    fields,
    scalars: raw.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum'),
    relations: new Map(),
    compoundUniques,
  });
}

for (const raw of rawModels) {
  const model = models.get(raw.name)!;
  for (const f of raw.fields) {
    if (f.kind !== 'object') continue;
    const from = f.relationFromFields ?? [];
    if (from.length > 0) {
      model.relations.set(f.name, {
        name: f.name, target: f.type, isList: f.isList, fkHere: true,
        local: from, remote: f.relationToFields ?? [],
      });
      continue;
    }
    const other = rawModels.find((m) => m.name === f.type)?.fields.find(
      (o) => o.kind === 'object' && o.relationName === f.relationName && o !== f && (o.relationFromFields ?? []).length > 0,
    );
    if (!other) continue;
    model.relations.set(f.name, {
      name: f.name, target: f.type, isList: f.isList, fkHere: false,
      local: other.relationToFields ?? [], remote: other.relationFromFields ?? [],
    });
  }
}

export function getModel(name: string | undefined): ModelDef | undefined {
  return name ? models.get(name) : undefined;
}

/** `dealerUser` -> `DealerUser`, when such a model exists. */
export function modelForAccessor(accessor: string): string | undefined {
  const name = accessor.charAt(0).toUpperCase() + accessor.slice(1);
  return models.has(name) ? name : undefined;
}

export function defaultCollectionName(modelName: string): string {
  const dbName = models.get(modelName)?.dbName;
  if (dbName) return dbName;
  return modelName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + 's';
}
