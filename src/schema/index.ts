import { projectSchema, stableStringify, type SchemaDef } from "./dsl";
import { VHSND_SCHEMA } from "./versions/v2026-1";

export const SCHEMA_VERSION = "2026.1";
export const SUPPORTED_DATASET_KINDS = ["vhsnd"] as const;
export type SupportedDatasetKind = (typeof SUPPORTED_DATASET_KINDS)[number];

const SCHEMAS: Record<string, SchemaDef> = {
  [SCHEMA_VERSION]: VHSND_SCHEMA,
};

export function getSchema(version: string = SCHEMA_VERSION): SchemaDef {
  const schema = SCHEMAS[version];
  if (!schema) {
    throw new Error(`Unknown schema version "${version}".`);
  }
  return schema;
}

export function getDatasetSchema(version: string, kind: string) {
  const schema = getSchema(version);
  const ds = schema.datasets[kind];
  if (!ds) throw new Error(`Schema ${version} has no dataset "${kind}".`);
  return ds;
}

/** Canonical JSON (stable key order) of a schema definition for audit. */
export function canonicalSchemaJson(version: string = SCHEMA_VERSION): string {
  return stableStringify(projectSchema(getSchema(version)));
}

/** Deterministic content hash (SHA-256 hex) of the schema definition. */
export async function computeSchemaHash(version: string = SCHEMA_VERSION): Promise<string> {
  const json = canonicalSchemaJson(version);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}