import type { NormalizedRow } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import { validateRows, type ValidateOptions, type ValidateResult } from "@/schema/engine/validate";
import { workerScope } from "@/lib/workerScope";

export type ValidateRequest = {
  type: "validate";
  payload: {
    rows: NormalizedRow[];
    schemaVersion: string;
    refDate?: string | null;
  };
};

export type ValidateResponse =
  | { ok: true; violations: Violation[]; counts: ValidateResult["counts"]; byRow: Record<string, Violation[]> }
  | { ok: false; error: string };

export async function validatePayload(payload: ValidateRequest["payload"]): Promise<ValidateResult> {
  const { getDatasetSchema } = await import("@/schema");
  const schema = getDatasetSchema(payload.schemaVersion, "vhsnd");
  const options: ValidateOptions = payload.refDate !== undefined ? { refDate: payload.refDate } : {};
  return validateRows(payload.rows, schema, options);
}

const scope = workerScope();
scope.onmessage = async (event: MessageEvent<ValidateRequest>) => {
  if (event.data?.type !== "validate") {
    postResponse({ ok: false, error: "Unknown message type." });
    return;
  }
  try {
    const { violations, counts, byRow } = await validatePayload(event.data.payload);
    const byRowPlain: Record<string, Violation[]> = {};
    for (const [k, v] of byRow) byRowPlain[k] = v;
    postResponse({ ok: true, violations, counts, byRow: byRowPlain });
  } catch (err) {
    postResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

function postResponse(resp: ValidateResponse) {
  scope.postMessage(resp);
}