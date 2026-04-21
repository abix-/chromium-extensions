// Legacy-name shim. The migrator now lives in migrate_storage.mjs
// because v3 anchors options + allowlist in addition to config.
// This module re-exports the current API under the legacy name so
// existing callers keep working without a coordinated rename.

export {
  migrateStorageSchema as migrateConfigSchema,
  CURRENT_SCHEMA_VERSION,
} from "./migrate_storage.mjs";
