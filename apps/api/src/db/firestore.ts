import { Firestore } from '@google-cloud/firestore';
import { randomUUID } from 'crypto';

const PROJECT_ID = process.env['GOOGLE_CLOUD_PROJECT']
  || process.env['GCP_PROJECT']
  || 'gen-lang-client-0078524499';

const DATABASE_ID = process.env['FIRESTORE_DATABASE_ID'] || '(default)';

export const firestore = new Firestore({
  projectId: PROJECT_ID,
  databaseId: DATABASE_ID,
});

console.log(`[Firestore] Initialized Firestore client for project: ${PROJECT_ID}, database: ${DATABASE_ID}`);

export type QueryWhere = Record<string, any>;
export type QueryOrderBy = Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;

export interface FirestoreQueryOptions {
  where?: QueryWhere | undefined;
  orderBy?: QueryOrderBy | undefined;
  take?: number | undefined;
  skip?: number | undefined;
  include?: any;
  select?: any;
}

const isGcpEnvironment = Boolean(
  process.env['K_SERVICE'] ||
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  process.env['GAE_SERVICE'] ||
  process.env['FORCE_FIRESTORE'] === 'true'
);

let globalMemoryFallback = !isGcpEnvironment;
const memoryStore = new Map<string, Map<string, any>>();

if (globalMemoryFallback) {
  console.log('[Firestore] Local development environment detected: Running with local in-memory store.');
} else {
  console.log('[Firestore] GCP Environment detected: Connecting live to Google Cloud Firestore (default).');
}

export class FirestoreCollection<T extends { id?: string; [key: string]: any } = any> {
  constructor(public collectionName: string) {
    if (!memoryStore.has(collectionName)) {
      memoryStore.set(collectionName, new Map());
    }
  }

  private get col() {
    return firestore.collection(this.collectionName);
  }

  private get mem() {
    return memoryStore.get(this.collectionName)!;
  }

  private serializeDoc(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const result: any = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      if (v instanceof Date) {
        result[k] = v.toISOString();
      } else if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') {
        result[k] = (v as any).toDate().toISOString();
      } else if (v && typeof v === 'object') {
        result[k] = this.serializeDoc(v);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  private matchesFilter(doc: any, where?: QueryWhere): boolean {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;

      if (key === 'OR' && Array.isArray(value)) {
        const matchesAny = value.some((cond) => this.matchesFilter(doc, cond));
        if (!matchesAny) return false;
        continue;
      }

      if (key === 'AND' && Array.isArray(value)) {
        const matchesAll = value.every((cond) => this.matchesFilter(doc, cond));
        if (!matchesAll) return false;
        continue;
      }

      if (key === 'NOT') {
        if (this.matchesFilter(doc, value)) return false;
        continue;
      }

      const docVal = doc[key];

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        if ('in' in value && Array.isArray(value.in)) {
          if (!value.in.includes(docVal)) return false;
          continue;
        }
        if ('notIn' in value && Array.isArray(value.notIn)) {
          if (value.notIn.includes(docVal)) return false;
          continue;
        }
        if ('not' in value) {
          if (docVal === value.not) return false;
          continue;
        }
        if ('equals' in value) {
          if (docVal !== value.equals) return false;
          continue;
        }
        if ('gte' in value) {
          const comp = value.gte instanceof Date ? value.gte.toISOString() : value.gte;
          if (docVal < comp) return false;
          continue;
        }
        if ('lte' in value) {
          const comp = value.lte instanceof Date ? value.lte.toISOString() : value.lte;
          if (docVal > comp) return false;
          continue;
        }
        if ('gt' in value) {
          const comp = value.gt instanceof Date ? value.gt.toISOString() : value.gt;
          if (docVal <= comp) return false;
          continue;
        }
        if ('lt' in value) {
          const comp = value.lt instanceof Date ? value.lt.toISOString() : value.lt;
          if (docVal >= comp) return false;
          continue;
        }
        if ('contains' in value && typeof docVal === 'string') {
          const isCaseInsensitive = value.mode === 'insensitive';
          const needle = isCaseInsensitive ? String(value.contains).toLowerCase() : String(value.contains);
          const haystack = isCaseInsensitive ? docVal.toLowerCase() : docVal;
          if (!haystack.includes(needle)) return false;
          continue;
        }
        if ('startsWith' in value && typeof docVal === 'string') {
          if (!docVal.startsWith(value.startsWith)) return false;
          continue;
        }
      } else {
        const compVal = value instanceof Date ? value.toISOString() : value;
        if (docVal !== compVal) return false;
      }
    }
    return true;
  }

  async findUnique(options: { where: QueryWhere; include?: any; select?: any }): Promise<(T & Record<string, any>) | null> {
    if (options.where.id && Object.keys(options.where).length === 1) {
      if (!globalMemoryFallback) {
        try {
          const snap = await this.col.doc(String(options.where.id)).get();
          if (!snap.exists) return null;
          return this.serializeDoc({ id: snap.id, ...snap.data() }) as (T & Record<string, any>);
        } catch (err: any) {
          globalMemoryFallback = true;
          const memDoc = this.mem.get(String(options.where.id));
          return memDoc ? (this.serializeDoc(memDoc) as (T & Record<string, any>)) : null;
        }
      } else {
        const memDoc = this.mem.get(String(options.where.id));
        return memDoc ? (this.serializeDoc(memDoc) as (T & Record<string, any>)) : null;
      }
    }
    return this.findFirst(options);
  }

  async findFirst(options: FirestoreQueryOptions = {}): Promise<(T & Record<string, any>) | null> {
    const list = await this.findMany({ ...options, take: 1 });
    return list[0] ?? null;
  }

  async findMany(options: FirestoreQueryOptions = {}): Promise<Array<T & Record<string, any>>> {
    let docs: Array<T & Record<string, any>> = [];

    if (!globalMemoryFallback) {
      try {
        const snap = await this.col.get();
        docs = snap.docs.map((d) => this.serializeDoc({ id: d.id, ...d.data() }) as (T & Record<string, any>));
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
          docs = Array.from(this.mem.values());
        } else {
          console.error(`[Firestore:${this.collectionName}] findMany error:`, err.message);
          docs = Array.from(this.mem.values());
        }
      }
    } else {
      docs = Array.from(this.mem.values());
    }

    // Filter in-memory for rich operator support (case-insensitive, OR, compound queries)
    if (options.where) {
      docs = docs.filter((d) => this.matchesFilter(d, options.where));
    }

    // Sort
    if (options.orderBy) {
      const orderEntries = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
      for (const order of orderEntries) {
        for (const [key, dir] of Object.entries(order)) {
          docs.sort((a, b) => {
            const valA = a[key] ?? '';
            const valB = b[key] ?? '';
            if (valA === valB) return 0;
            if (dir === 'desc') return valA > valB ? -1 : 1;
            return valA > valB ? 1 : -1;
          });
        }
      }
    }

    // Pagination
    if (options.skip) {
      docs = docs.slice(options.skip);
    }
    if (options.take !== undefined) {
      docs = docs.slice(0, options.take);
    }

    return docs;
  }

  async create(options: { data: any; include?: any; select?: any }): Promise<T & Record<string, any>> {
    const id = options.data.id || randomUUID();
    const now = new Date().toISOString();
    const docData = {
      ...options.data,
      id,
      created_at: options.data.created_at || now,
      updated_at: now,
    };

    this.mem.set(id, docData);

    if (!globalMemoryFallback) {
      try {
        await this.col.doc(id).set(docData, { merge: true });
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
        }
      }
    }

    return this.serializeDoc(docData) as (T & Record<string, any>);
  }

  async createMany(options: { data: any[] }): Promise<{ count: number }> {
    const now = new Date().toISOString();
    for (const item of options.data) {
      const id = item.id || randomUUID();
      const docData = { ...item, id, created_at: item.created_at || now, updated_at: now };
      this.mem.set(id, docData);
    }

    if (!globalMemoryFallback) {
      try {
        const batch = firestore.batch();
        for (const item of options.data) {
          const id = item.id || randomUUID();
          const docData = { ...item, id, created_at: item.created_at || now, updated_at: now };
          batch.set(this.col.doc(id), docData, { merge: true });
        }
        await batch.commit();
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
        }
      }
    }

    return { count: options.data.length };
  }

  async update(options: { where: QueryWhere; data: any; include?: any }): Promise<T & Record<string, any>> {
    let target = await this.findUnique({ where: options.where });
    if (!target) {
      target = await this.findFirst({ where: options.where });
    }
    if (!target || !target.id) {
      throw new Error(`Record to update not found in ${this.collectionName}`);
    }

    const now = new Date().toISOString();
    const updatedData = {
      ...target,
      ...options.data,
      updated_at: now,
    };

    this.mem.set(target.id, updatedData);

    if (!globalMemoryFallback) {
      try {
        await this.col.doc(target.id).set(updatedData, { merge: true });
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
        }
      }
    }

    return this.serializeDoc(updatedData) as (T & Record<string, any>);
  }

  async updateMany(options: { where?: QueryWhere | undefined; data: any }): Promise<{ count: number }> {
    const records = await this.findMany(options.where ? { where: options.where } : {});
    const now = new Date().toISOString();

    for (const record of records) {
      if (record.id) {
        this.mem.set(record.id, { ...record, ...options.data, updated_at: now });
      }
    }

    if (!globalMemoryFallback) {
      try {
        const batch = firestore.batch();
        for (const record of records) {
          if (record.id) {
            const ref = this.col.doc(record.id);
            batch.set(ref, { ...record, ...options.data, updated_at: now }, { merge: true });
          }
        }
        await batch.commit();
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
        }
      }
    }

    return { count: records.length };
  }

  async upsert(options: { where: QueryWhere; create: any; update: any }): Promise<T & Record<string, any>> {
    const existing = await this.findFirst({ where: options.where });
    if (existing) {
      return this.update({ where: { id: existing.id }, data: options.update });
    }
    return this.create({ data: options.create });
  }

  async delete(options: { where: QueryWhere }): Promise<T> {
    const target = await this.findFirst({ where: options.where });
    if (!target || !target.id) {
      throw new Error(`Record to delete not found in ${this.collectionName}`);
    }

    this.mem.delete(target.id);

    if (!globalMemoryFallback) {
      try {
        await this.col.doc(target.id).delete();
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
        }
      }
    }

    return target;
  }

  async deleteMany(options: { where?: QueryWhere | undefined } = {}): Promise<{ count: number }> {
    const records = await this.findMany(options.where ? { where: options.where } : {});
    for (const r of records) {
      if (r.id) this.mem.delete(r.id);
    }

    if (!globalMemoryFallback) {
      try {
        const batch = firestore.batch();
        for (const r of records) {
          if (r.id) batch.delete(this.col.doc(r.id));
        }
        await batch.commit();
      } catch (err: any) {
        if (err.message?.includes('Could not load the default credentials') || err.code === 7) {
          globalMemoryFallback = true;
        }
      }
    }

    return { count: records.length };
  }

  async count(options: { where?: QueryWhere | undefined } = {}): Promise<number> {
    const list = await this.findMany(options.where ? { where: options.where } : {});
    return list.length;
  }

  async groupBy(options: { by: string[]; _count?: any; _sum?: any; where?: QueryWhere }): Promise<any[]> {
    const docs = await this.findMany(options.where ? { where: options.where } : {});
    const groups = new Map<string, any>();

    for (const doc of docs) {
      const key = options.by.map((f) => String(doc[f] ?? '')).join('::');
      if (!groups.has(key)) {
        const entry: any = { _count: { _all: 0 } };
        for (const f of options.by) {
          entry[f] = doc[f];
        }
        groups.set(key, entry);
      }
      const g = groups.get(key);
      g._count._all += 1;
    }

    return Array.from(groups.values());
  }
}
