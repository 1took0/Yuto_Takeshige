import Dexie, { type EntityTable } from "dexie";
import type { Settings, StoreEquipment, Workout } from "@/lib/types";

/**
 * ローカル保存層（IndexedDB / Dexie）
 * 将来のクラウド同期に備え、全レコードに id と updatedAt を持たせる。
 * 同期は「このテーブルの updatedAt より新しいもの」を差分転送する想定。
 */
export interface KV {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class TrainingDB extends Dexie {
  workouts!: EntityTable<Workout, "id">;
  storeEquipment!: EntityTable<StoreEquipment, "key">;
  settings!: EntityTable<Settings, "id">;
  kv!: EntityTable<KV, "key">;

  constructor(name = "training-coach") {
    super(name);
    this.version(1).stores({
      workouts: "id, trainingDate, storeId, status, updatedAt",
      storeEquipment: "key, storeId, equipmentId",
      settings: "id",
      kv: "key",
    });
  }
}

let _db: TrainingDB | null = null;
export function db(): TrainingDB {
  if (!_db) _db = new TrainingDB();
  return _db;
}

/** テスト用に差し替え可能にする */
export function setDb(instance: TrainingDB | null) {
  _db = instance;
}
