# Database ER Diagram (conceptual)

IndexedDB has no foreign keys; the relationships below are **logical, enforced in application code** by
the `datasetId` carried on every child record. Rendered as an ER diagram because that is how the data
actually relates. Based on `PROJECT_CONTEXT.md` §6.4.

## Diagram

```mermaid
erDiagram
    DATASET ||--|| VALIDATION_CACHE : "cached result of"
    DATASET ||--o{ ROW_RESOLUTION : "has decisions"
    DATASET ||--o{ SAVED_CHART : "contains"
    SAVED_CHART ||--o| CHART_BLOB : "image referenced by blobKey"
    DATASET ||--o{ ROW : "holds"
    ROW ||--o{ VIOLATION : "raises"
    ROW ||--o| ROW_RESOLUTION : "decided by"
    DATASET ||--o{ HEADER_OVERRIDE : "matched by file name"

    DATASET {
        string id PK "crypto.randomUUID()"
        string name
        string fileName
        string schemaVersion "2026.1"
        string schemaHash "SHA-256 of canonical schema"
        string importedAt
        int totalRows
        string presentColumns "codes the source file physically held"
    }
    ROW {
        string rowId PK
        object values "Record<code, CellValue>"
    }
    VIOLATION {
        string rowId FK
        string code
        string fieldId "nullable"
        string ruleId "nullable"
        string severity "error | warning | info"
        string category
        string rawValue
    }
    ROW_RESOLUTION {
        string datasetId PK
        string rowId PK
        string status "pending | keep | drop | override"
        string justification "required for drop/override"
        string keptViolations "codes or __all"
        string decidedAt
    }
    VALIDATION_CACHE {
        string datasetId PK
        object violations
        object counts
        string validatedAt
    }
    SAVED_CHART {
        string id PK
        string datasetId FK
        string kind
        string title
        string blobKey FK
        string createdAt
    }
    CHART_BLOB {
        string blobKey PK "datasetId/chartId.png"
        bytes bytes "AES-GCM encrypted PNG"
    }
    HEADER_OVERRIDE {
        string fileName PK
        object overrides "header text -> field code"
    }
```

## Explanation

- Two IndexedDB databases: `vhsnd-pipeline` v2 (`src/lib/storage/idb.ts:23-26`, stores created in
  `onupgradeneeded` at `:30-45`) and `pipeline-crypto` (separate `idb-keyval` store holding the
  AES-256-GCM key under `app-key-v1`, `src/lib/crypto.ts:3`).
- `ds` stores encrypted `DatasetSnapshot`s keyed by `snapshot.id`; `res` stores per-dataset
  `Record<rowId, RowResolution>` keyed by `datasetId`; `chart` stores `StoredChartMeta`; `blob`
  stores captured PNG bytes keyed by `` `${datasetId}/${chartId}.png` ``; `validation` stores the
  `ValidationCache`; `ui` stores header overrides (`hdr:<fileName>`) plus Zustand workflow persistence.
- Every child record carries `datasetId`; `ROW`/`VIOLATION`/`ROW_RESOLUTION` are logical children of
  `DATASET` even though `ds` holds rows inside the snapshot.
- `HEADER_OVERRIDE` is keyed by `fileName` (not `datasetId`): saved manual header matches replay on
  the next read of a file with the same name (`src/app/ingest/page.tsx` F3).
- All values are encrypted at rest (AES-GCM, fresh 12-byte IV per operation); `eraseAllLocalData()`
  deletes both databases (`src/lib/storage/idb.ts:260-273`).

## Key files cited

| Concern | Files |
|---|---|
| DB declaration / upgrade | `src/lib/storage/idb.ts:23-45` |
| Read/write helpers | `src/lib/storage/idb.ts` (`saveDataset`, `loadDataset`, `listDatasets`, `deleteDataset`, `saveResolutions`, `loadResolutions`, `saveChartMeta`, `loadChartMetas`, `deleteChart`, `saveChartBlob`, `loadChartBlob`, `saveValidation`, `loadValidation`, `saveHeaderOverrides`, `loadHeaderOverrides`, `eraseAllLocalData`) |
| Crypto key store | `src/lib/crypto.ts:3,18,59-82` |
| Encryption scheme | `src/lib/crypto.ts:20,41-49,53` |
| Wipe | `src/lib/storage/idb.ts:260-273` |
| Contracts | `src/contracts/dataset.ts`, `src/contracts/violation.ts`, `src/contracts/resolution.ts`, `src/contracts/chart.ts` |
