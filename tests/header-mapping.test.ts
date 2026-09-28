import { describe, expect, it } from "vitest";
import { normalizeAoa } from "@/schema/engine/normalize";
import { buildHeaderMap } from "@/schema/engine/headerNormalizer";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";
import { parsePayload } from "@/workers/parseWorker";

const header = buildHeaderMap();
const known = header.knownColumns;
const resolve = (label: string) => header.normalize(label);
const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
const source = {
  fileName: "mapped.xlsx",
  sheetName: "Sheet1",
  sizeBytes: 1,
  headerRow: 1,
  importedAt: "2026-09-28T00:00:00.000Z",
};

const UNKNOWN_TITLE = "Ward code extra";

describe("titles the schema cannot place", () => {
  it("lists them so the import screen can ask what they are", () => {
    const parsed = normalizeAoa(
      [
        ["SubmissionDate", UNKNOWN_TITLE, "Block name"],
        ["2025-11-12", "7", "MUZAFFARPUR"],
        ["2025-11-13", "8", "BEGUSARAI"],
      ],
      schema.fields,
      source,
      known,
      resolve,
    );
    expect(parsed.unmappedHeaders).toEqual([UNKNOWN_TITLE]);
    expect(parsed.presentColumns).toContain("B2A");
    expect(parsed.presentColumns).toContain(UNKNOWN_TITLE);
  });

  it("says nothing when every title matches", () => {
    const parsed = normalizeAoa(
      [
        ["SubmissionDate", "Block name"],
        ["2025-11-12", "MUZAFFARPUR"],
      ],
      schema.fields,
      source,
      known,
      resolve,
    );
    expect(parsed.unmappedHeaders).toBeUndefined();
  });

  it("stops listing a title once the user has pointed it at a field", () => {
    const parsed = normalizeAoa(
      [
        ["SubmissionDate", UNKNOWN_TITLE, "Block name"],
        ["2025-11-12", "7", "MUZAFFARPUR"],
        ["2025-11-13", "8", "BEGUSARAI"],
      ],
      schema.fields,
      source,
      known,
      resolve,
      false,
      { [UNKNOWN_TITLE]: "A2" },
    );
    expect(parsed.unmappedHeaders).toBeUndefined();
    expect(parsed.presentColumns).toContain("A2");
    expect(parsed.presentColumns).not.toContain(UNKNOWN_TITLE);
    expect(parsed.headerMap[UNKNOWN_TITLE]).toBe("A2");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].values.A2).toBeDefined();
  });

  it("applies a title-keyed match beside the form's own code row", () => {
    const codes = VHSND_COLUMNS.slice(0, 10).map((c) => c.code);
    const labels = VHSND_COLUMNS.slice(0, 10).map((c) => c.label);
    const target = VHSND_COLUMNS[10];
    const parsed = normalizeAoa(
      [
        [...labels, UNKNOWN_TITLE],
        [...codes, UNKNOWN_TITLE],
        [...codes.map(() => "Yes"), "7"],
      ],
      schema.fields,
      source,
      known,
      resolve,
      false,
      { [UNKNOWN_TITLE]: target.code },
    );
    expect(parsed.unmappedHeaders).toBeUndefined();
    expect(parsed.presentColumns).toContain(target.code);
    expect(parsed.rows[0].values[target.code]).toBeDefined();
  });

  it("matches through a workbook read, without touching the other columns", async () => {
    const csv = ["SubmissionDate,Ward code extra,Block name"]
      .concat(["2025-11-12,7,MUZAFFARPUR"], ["2025-11-13,8,BEGUSARAI"])
      .join("\n");
    const buffer = new TextEncoder().encode(csv);
    const base = {
      fileName: "mapped.csv",
      sizeBytes: buffer.byteLength,
      importedAt: "2026-09-28T00:00:00.000Z",
    };
    const bytes = () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const before = await parsePayload({ buffer: bytes() as ArrayBuffer, ...base });
    expect(before.unmappedHeaders).toEqual([UNKNOWN_TITLE]);
    expect(before.rows[0].values.A2).toBeUndefined();

    const after = await parsePayload({
      buffer: bytes() as ArrayBuffer,
      ...base,
      headerOverrides: { [UNKNOWN_TITLE]: "A2" },
    });
    expect(after.unmappedHeaders).toBeUndefined();
    expect(after.rows).toHaveLength(2);
    expect(after.rows[0].values.A2).toBeDefined();
    expect(after.rows[0].values.B2A).toBe("MUZAFFARPUR");
  });
});
