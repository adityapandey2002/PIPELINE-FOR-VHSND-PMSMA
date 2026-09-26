import type { FieldDef, GroupOption, SchemaDef } from "@/schema/dsl";
import { countWithSentinel, ordinalField } from "@/schema/dsl";
import { isDirectChildOf } from "@/schema/engine/groupChildren";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import {
  b,
  cmpDay,
  d,
  fmtDay,
  groupAny,
  groupHasData,
  groupSelected,
  isDefined,
  n,
  t,
} from "@/schema/engine/accessors";
import type { NormalizedRow } from "@/contracts/dataset";

const SCHEMA_VERSION = "2026.1";

/* ------------------------- group option derivation ------------------------- */

function kindOf(suffix: string): GroupOption["kind"] {
  switch (suffix) {
    case "88":
      return "other";
    case "99":
      return "none";
    case "77":
      return "not-applicable";
    case "SP":
      return "specify";
    default:
      return "option";
  }
}

/**
 * Physical columns for a logical group question are `{root}_{suffix}`.
 * Nested groups are resolved through `isDirectChildOf` so a higher group never
 * absorbs a sibling group's columns (e.g. C10 must not claim C10_1_A).
 */
function groupChildren(root: string): GroupOption[] {
  return VHSND_COLUMNS.filter((c) => isDirectChildOf(root, c.code))
    .map((c) => ({ code: c.code, suffix: c.code.slice(root.length + 1) }))
    .map(({ code, suffix }) => ({
      code: suffix,
      kind: kindOf(suffix),
      label: VHSND_COLUMNS.find((c) => c.code === code)!.label,
    }));
}

/* ------------------------------ field curation ------------------------------ */

const groupFields: FieldDef[] = [
  {
    id: "C4",
    label: "Which health workers are available at the session site?",
    type: "group",
    group: { options: groupChildren("C4") },
  },
  {
    id: "C10",
    label: "Which other members have participated in the session?",
    type: "group",
    group: { options: groupChildren("C10") },
  },
  {
    id: "C10_1",
    label: "From whom did you get help regarding preparation or organization at the session venue?",
    type: "group",
    group: { options: groupChildren("C10_1") },
  },
  {
    id: "C11_1",
    label: "Who supervised the session today?",
    type: "group",
    group: { options: groupChildren("C11_1") },
  },
  {
    id: "E3",
    label: "Who brought the vaccine and consumables to today's session?",
    type: "group",
    group: { options: groupChildren("E3") },
  },
  {
    id: "G1",
    label: "Which of the following is available at the session site?",
    type: "group",
    group: { options: groupChildren("G1") },
  },
  {
    id: "G2",
    label: "What diluent is available at the session site?",
    type: "group",
    group: { options: groupChildren("G2") },
  },
  {
    id: "G3",
    label: "Which of the following is available on the session? (Enter yes only for working machines)",
    type: "group",
    group: { options: groupChildren("G3") },
  },
  {
    id: "G12",
    label: "Which of the following is available on the session? (Enter yes only if you can use it)",
    type: "group",
    group: { options: groupChildren("G12") },
  },
  {
    id: "H1",
    label: "Which of the following services are being provided for prenatal check-up",
    type: "group",
    group: { options: groupChildren("H1") },
  },
  {
    id: "H2",
    label: "What information is provided during prenatal counselling?",
    type: "group",
    group: { options: groupChildren("H2") },
  },
  {
    id: "H3",
    label: "What is being done at the VHSND session, post-natal check-up?",
    type: "group",
    group: { options: groupChildren("H3") },
  },
  {
    id: "H4",
    label: "What information is provided during postnatal counselling?",
    type: "group",
    group: { options: groupChildren("H4") },
  },
  {
    id: "H32",
    label: "In which register is the service information being maintained?",
    type: "group",
    group: { options: groupChildren("H32") },
  },
];

function simpleFields(): FieldDef[] {
  const list: FieldDef[] = [];
  const f = (id: string, type: FieldDef["type"], extra: Partial<FieldDef> = {}) =>
    list.push({ id, label: labelOf(id), type, ...extra });
  const yn = (id: string) => f(id, "boolean");
  const cnt = (id: string) => f(id, "integer", { range: { min: 0 } });
  const txt = (id: string) => f(id, "text");
  /** A box a person types into, where "NA" is content rather than filler. */
  const freeTxt = (id: string) => f(id, "text", { freeText: true });
  const choose = (id: string) => f(id, "choice");
  const dat = (id: string, required = false) => f(id, "date", { required });
  const tim = (id: string) => f(id, "time");
  /** Count where the form writes a magic number for "none recorded", a real zero. */
  const cntOrNoData = (id: string, sentinel: number) =>
    list.push(countWithSentinel(id, labelOf(id), sentinel, { meaning: "zero" }));
  /** 0/1/2 style ordered answer that is not a plain yes/no. */
  const ord = (id: string, labels: Record<string, string>) =>
    list.push(ordinalField(id, labelOf(id), [0, 1, 2], labels));

  f("SubmissionDate", "date", { label: "Submission Date" });
  tim("starttime");
  tim("endtime");
  choose("A2");
  freeTxt("A2_SP");
  txt("A3");
  freeTxt("A3_SP");
  choose("B1");
  choose("B2");
  txt("B2A");
  txt("B4");
  freeTxt("B4_1");
  freeTxt("B4_2");
  txt("B5");
  txt("B6");
  choose("B7");
  dat("B8", true);

  yn("C1");
  yn("C2");
  choose("C3");
  freeTxt("C3_SP");
  yn("C5");
  yn("C6");
  yn("C7");
  yn("C8");
  yn("C9");
  yn("C11");

  yn("E1");
  yn("E1_1");
  yn("E2");
  cnt("E2_1");
  cnt("E2_2");
  cnt("E2_3");
  cnt("E2_4");
  cnt("E2_5");
  freeTxt("E3_SP");
  yn("E4");

  freeTxt("G3_SP");
  yn("G11");
  yn("G21");
  yn("G24");

  freeTxt("H1_SP");
  cnt("H1BP");
  cnt("H1BP1");
  cnt("H1PB2");
  cnt("H1HB");
  cnt("H1HB1");
  cnt("H1HB_2");
  cnt("H1HB_3");
  cnt("H1HB_4");
  cnt("H1HB2");
  freeTxt("H2_SP");
  yn("H3A");
  cnt("H3A_1");
  cnt("H3HB1_1");
  cnt("H3HB2_1");
  cnt("H3HB3_1");
  cnt("H3HB4_1");
  cnt("H3HB1_4");
  cnt("H3HB1_5");
  freeTxt("H4_SP");
  yn("H5");
  yn("H5_1");
  cnt("H5_1_1");
  yn("H5_2");
  cnt("H5_2_1");
  yn("H6");
  yn("H6_1");
  cnt("H6_1_1");
  yn("H7");
  yn("H8");
  yn("H9");
  yn("H10");
  yn("H11");
  yn("H12");
  cnt("H12A");
  yn("H12B");
  yn("H13");
  yn("H14");
  yn("H15");
  yn("H16");
  yn("H18");
  freeTxt("H19");
  yn("H20");
  yn("H21");
  yn("H22");
  yn("H23");
  yn("H24");
  cnt("H25");
  txt("H26");
  cnt("H27");
  yn("H28");
  cnt("H29");
  yn("H30");
  yn("H31");
  freeTxt("H32_SP");
  const COUNSEL_SCALE = {
    "0": "Not told",
    "1": "Told, using reference material",
    "2": "Told, without material",
  };
  ord("H33", COUNSEL_SCALE);
  ord("H34", COUNSEL_SCALE);

  yn("ANM1");
  // ANM1 names which ANMOL question applies, so ANM2/3/4 are always
  // applicable. The form writes 99 when she has no data for that question,
  // which is a real zero rather than a missing answer.
  cntOrNoData("ANM2", 99);
  cnt("ANM2_1");
  cntOrNoData("ANM3", 99);
  cnt("ANM3_1");
  cntOrNoData("ANM4", 99);
  cnt("ANM4_1");
  yn("ANM5");
  yn("ANM6");
  yn("ASHA1");
  cnt("ASHA2");
  cnt("ASHA2_1");
  yn("ASHA3");
  yn("ASHA4");
  yn("ASHA5");

  yn("New");
  freeTxt("remarks");

  return list;
}

function labelOf(code: string): string {
  return VHSND_COLUMNS.find((c) => c.code === code)?.label ?? code;
}

const FIELDS: FieldDef[] = [...groupFields, ...simpleFields()];

/* --------------------------- cross-field rules --------------------------- */

function gNoneSuffixes(root: string): string[] {
  const g = FIELDS.find((f) => f.id === root && f.type === "group");
  return g?.group?.options.filter((o) => o.kind === "none" || o.kind === "not-applicable").map((o) => o.code) ?? [];
}
function gSpecifySuffix(): string {
  return "SP";
}
function gOptionSuffixes(root: string): string[] {
  const g = FIELDS.find((f) => f.id === root && f.type === "group");
  return g?.group?.options.filter((o) => o.kind === "option").map((o) => o.code) ?? [];
}
function gOtherSuffixes(root: string): string[] {
  const g = FIELDS.find((f) => f.id === root && f.type === "group");
  return g?.group?.options.filter((o) => o.kind === "other").map((o) => o.code) ?? [];
}
function gSpecifySuffixes(root: string): string[] {
  const g = FIELDS.find((f) => f.id === root && f.type === "group");
  return g?.group?.options.filter((o) => o.kind === "specify").map((o) => o.code) ?? [];
}

interface RuleSpec {
  id: string;
  code: string;
  severity: "error" | "warning" | "info";
  category: "clinical-contradiction" | "sequence" | "coherence" | "date" | "required";
  description: string;
  appliesTo(r: NormalizedRow, ctx: { refDate: string | null }): boolean;
  violates(r: NormalizedRow, ctx: { refDate: string | null }): boolean;
  describe(r: NormalizedRow, ctx: { refDate: string | null }): string;
}

function toCrossField(out: RuleSpec[]) {
  return out;
}

export const VHSND_CROSS_FIELD_RULES = toCrossField([
  /* ----- ANC / anemia numeric chains (prenatal) ----- */
  {
    id: "X001",
    code: "HIGH_BP_MEASURED_LT_IDENTIFIED",
    severity: "error",
    category: "clinical-contradiction",
    description:
      "Pregnant women identified with high blood pressure cannot exceed the number whose blood pressure was measured.",
    appliesTo: (r) => n(r, "H1BP") !== null && n(r, "H1BP1") !== null,
    violates: (r) => (n(r, "H1BP1") ?? 0) > (n(r, "H1BP") ?? 0),
    describe: (r) =>
      `High-BP identified (${n(r, "H1BP1")}) exceeds BP-measured (${n(r, "H1BP")}).`,
  },
  {
    id: "X002",
    code: "HIGH_BP_REFERRED_GT_IDENTIFIED",
    severity: "error",
    category: "clinical-contradiction",
    description: "High-BP referrals cannot exceed women identified with high blood pressure.",
    appliesTo: (r) => n(r, "H1BP1") !== null && n(r, "H1PB2") !== null,
    violates: (r) => (n(r, "H1PB2") ?? 0) > (n(r, "H1BP1") ?? 0),
    describe: (r) =>
      `High-BP referred (${n(r, "H1PB2")}) exceeds identified (${n(r, "H1BP1")}).`,
  },
  {
    id: "X003",
    code: "ANEMIC_GT_SAMPLED",
    severity: "error",
    category: "clinical-contradiction",
    description: "Women identified as anemic cannot exceed women tested for anemia.",
    appliesTo: (r) => n(r, "H1HB") !== null && n(r, "H1HB1") !== null,
    violates: (r) => (n(r, "H1HB1") ?? 0) > (n(r, "H1HB") ?? 0),
    describe: (r) => `Anemic identified (${n(r, "H1HB1")}) exceeds tested (${n(r, "H1HB")}).`,
  },
  {
    id: "X004",
    code: "ANEMIA_MOD_SEV_GT_IDENTIFIED",
    severity: "error",
    category: "clinical-contradiction",
    description: "Moderate + severe anemia counts cannot exceed the total identified as anemic.",
    appliesTo: (r) =>
      n(r, "H1HB1") !== null && (n(r, "H1HB_2") !== null || n(r, "H1HB_3") !== null),
    violates: (r) =>
      (n(r, "H1HB_2") ?? 0) + (n(r, "H1HB_3") ?? 0) > (n(r, "H1HB1") ?? 0),
    describe: (r) =>
      `Moderate+severe (${(n(r, "H1HB_2") ?? 0) + (n(r, "H1HB_3") ?? 0)}) exceeds identified (${n(r, "H1HB1")}).`,
  },
  {
    id: "X005",
    code: "ANEMIA_INFORMED_GT_IDENTIFIED",
    severity: "warning",
    category: "clinical-contradiction",
    description: "Women told of their anemia status cannot exceed those identified as anemic.",
    appliesTo: (r) => n(r, "H1HB1") !== null && n(r, "H1HB_4") !== null,
    violates: (r) => (n(r, "H1HB_4") ?? 0) > (n(r, "H1HB1") ?? 0),
    describe: (r) =>
      `Informed of anemia (${n(r, "H1HB_4")}) exceeds identified (${n(r, "H1HB1")}).`,
  },
  {
    id: "X006",
    code: "ANEMIA_REFERRED_GT_IDENTIFIED",
    severity: "warning",
    category: "clinical-contradiction",
    description: "Anemia referrals cannot exceed women identified as anemic.",
    appliesTo: (r) => n(r, "H1HB1") !== null && n(r, "H1HB2") !== null,
    violates: (r) => (n(r, "H1HB2") ?? 0) > (n(r, "H1HB1") ?? 0),
    describe: (r) => `Anemia referred (${n(r, "H1HB2")}) exceeds identified (${n(r, "H1HB1")}).`,
  },

  /* ----- postnatal (lactating mothers) numeric chains ----- */
  {
    id: "X007",
    code: "PNC_ANEMIC_GT_SAMPLED",
    severity: "error",
    category: "clinical-contradiction",
    description: "Lactating mothers identified as anemic cannot exceed those tested.",
    appliesTo: (r) => n(r, "H3HB1_1") !== null && n(r, "H3HB2_1") !== null,
    violates: (r) => (n(r, "H3HB2_1") ?? 0) > (n(r, "H3HB1_1") ?? 0),
    describe: (r) =>
      `PNC anemic identified (${n(r, "H3HB2_1")}) exceeds tested (${n(r, "H3HB1_1")}).`,
  },
  {
    id: "X008",
    code: "PNC_ANEMIA_MOD_SEV_GT_IDENTIFIED",
    severity: "error",
    category: "clinical-contradiction",
    description: "Moderate + severe anemia among lactating mothers cannot exceed total identified.",
    appliesTo: (r) =>
      n(r, "H3HB2_1") !== null && (n(r, "H3HB3_1") !== null || n(r, "H3HB4_1") !== null),
    violates: (r) =>
      (n(r, "H3HB3_1") ?? 0) + (n(r, "H3HB4_1") ?? 0) > (n(r, "H3HB2_1") ?? 0),
    describe: (r) =>
      `PNC moderate+severe (${(n(r, "H3HB3_1") ?? 0) + (n(r, "H3HB4_1") ?? 0)}) exceeds identified (${n(r, "H3HB2_1")}).`,
  },
  {
    id: "X009",
    code: "PNC_ANEMIA_INFORMED_GT_IDENTIFIED",
    severity: "warning",
    category: "clinical-contradiction",
    description: "Lactating mothers told of anemia status cannot exceed those identified.",
    appliesTo: (r) => n(r, "H3HB2_1") !== null && n(r, "H3HB1_4") !== null,
    violates: (r) => (n(r, "H3HB1_4") ?? 0) > (n(r, "H3HB2_1") ?? 0),
    describe: (r) =>
      `PNC informed of anemia (${n(r, "H3HB1_4")}) exceeds identified (${n(r, "H3HB2_1")}).`,
  },
  {
    id: "X010",
    code: "PNC_ANEMIA_REFERRED_GT_IDENTIFIED",
    severity: "warning",
    category: "clinical-contradiction",
    description: "PNC anemia referrals cannot exceed lactating mothers identified as anemic.",
    appliesTo: (r) => n(r, "H3HB2_1") !== null && n(r, "H3HB1_5") !== null,
    violates: (r) => (n(r, "H3HB1_5") ?? 0) > (n(r, "H3HB2_1") ?? 0),
    describe: (r) =>
      `PNC referred (${n(r, "H3HB1_5")}) exceeds identified (${n(r, "H3HB2_1")}).`,
  },
  {
    id: "X011",
    code: "PNC_SAMPLED_GT_ATTENDED",
    severity: "warning",
    category: "clinical-contradiction",
    description: "Lactating mothers tested for anemia cannot exceed those who attended PNC.",
    // H3A records *whether* anyone attended; H3A_1 records how many.
    appliesTo: (r) => n(r, "H3A_1") !== null && n(r, "H3HB1_1") !== null,
    violates: (r) => (n(r, "H3HB1_1") ?? 0) > (n(r, "H3A_1") ?? 0),
    describe: (r) =>
      `PNC tested (${n(r, "H3HB1_1")}) exceeds PNC attendees (${n(r, "H3A_1")}).`,
  },

  /* ----- session status coherence ----- */
  {
    id: "X012",
    code: "SESSION_NOT_HELD_WITH_SERVICES",
    severity: "warning",
    category: "coherence",
    description:
      "Session was not held, yet antenatal/postnatal service data was recorded. Either the session status or the service data is wrong.",
    appliesTo: (r) => b(r, "C1") === false,
    violates: (r) =>
      isDefined(r, "C2") ||
      groupHasData(r, "H1", gOptionSuffixes("H1")) ||
      isDefined(r, "H1BP") ||
      isDefined(r, "H1HB") ||
      isDefined(r, "H3A") ||
      isDefined(r, "H5"),
    describe: () =>
      "Session marked as not held, but C2/H1/H1BP/H1HB/H3A/H5 contain data.",
  },
  {
    id: "X013",
    code: "SESSION_HELD_WITH_REASON",
    severity: "error",
    category: "coherence",
    description: "A reason for the session not being held was given although the session was held.",
    appliesTo: (r) => b(r, "C1") === true,
    violates: (r) => isDefined(r, "C3"),
    describe: () => "Session was held (C1 = yes) but a not-held reason (C3) is recorded.",
  },
  {
    id: "X014",
    code: "SESSION_NOT_HELD_REASON_REQUIRED",
    severity: "error",
    category: "required",
    description: "When a session was not held, a reason is required.",
    appliesTo: (r) => b(r, "C1") === false,
    violates: (r) => !isDefined(r, "C3"),
    describe: () => "Session not held (C1 = no) but no reason (C3) was recorded.",
  },
  {
    id: "X015",
    code: "SYRINGE_NOT_CUT_REASON_REQUIRED",
    severity: "error",
    category: "required",
    description: "When syringes are not being cut, the relevant reasons must be recorded.",
    appliesTo: (r) => b(r, "H18") === false,
    violates: (r) => !isDefined(r, "H19"),
    describe: () => "Syringe not cut with hub cutter (H18 = no) but no reason (H19) recorded.",
  },
  {
    id: "X016",
    code: "DILUTED_VIAL_USED_AFTER_PERIOD",
    severity: "error",
    category: "clinical-contradiction",
    description:
      "Using a diluted BCG/MR/JE vial after the prescribed 4-hour period is an unsafe vaccination practice.",
    appliesTo: (r) => b(r, "H21") !== null,
    violates: (r) => b(r, "H21") === true,
    describe: () =>
      "Diluted BCG/MR/JE vial is being used after the 4-hour period (unsafe practice).",
  },

  /* ----- tele-consultation coherence ----- */
  {
    id: "X017",
    code: "TELECONSULT_DATA_WITHOUT_CONSULT",
    severity: "warning",
    category: "coherence",
    description:
      "No tele-consultation happened, yet tele-consultation counts were recorded.",
    appliesTo: (r) => b(r, "H24") === false,
    violates: (r) => isDefined(r, "H25") || (n(r, "H27") ?? 0) > 0,
    describe: () =>
      "Tele-consultation = no, but an H25/H27 tele-consultation count is recorded.",
  },
  {
    id: "X018",
    code: "CONSULT_UNITS_GT_ZERO_CONSISTENT",
    severity: "info",
    category: "coherence",
    description: "Tele-consultations attended should match consultations conducted by Spoke.",
    appliesTo: (r) => n(r, "H25") !== null && n(r, "H27") !== null,
    violates: (r) => (n(r, "H27") ?? 0) > (n(r, "H25") ?? 0),
    describe: (r) =>
      `Attended tele-consultations (${n(r, "H27")}) exceed conducted (${n(r, "H25")}).`,
  },

  /* ----- date/time sanity ----- */
  {
    id: "X019",
    code: "VISIT_DATE_AFTER_SUBMISSION",
    severity: "error",
    category: "date",
    description: "The session visit date cannot be after the form submission date.",
    appliesTo: (r) => d(r, "B8") !== null && d(r, "SubmissionDate") !== null,
    violates: (r) => cmpDay(d(r, "B8")!, d(r, "SubmissionDate")!) > 0,
    describe: (r) =>
      `Visit date (${fmtDay(d(r, "B8"))}) is after submission date (${fmtDay(d(r, "SubmissionDate"))}).`,
  },
  {
    id: "X020",
    code: "VISIT_DATE_IN_FUTURE",
    severity: "warning",
    category: "date",
    description: "The session visit date is after the reference (latest submission) date.",
    appliesTo: (r, ctx) => d(r, "B8") !== null && ctx.refDate !== null,
    violates: (r, ctx) => cmpDay(d(r, "B8")!, ctx.refDate!) > 0,
    describe: (r) => `Visit date (${fmtDay(d(r, "B8"))}) is in the future.`,
  },
  {
    id: "X021",
    code: "END_BEFORE_START",
    severity: "error",
    category: "sequence",
    description: "The form end time cannot be earlier than its start time.",
    appliesTo: (r) => t(r, "starttime") !== null && t(r, "endtime") !== null,
    violates: (r) => (t(r, "endtime") ?? "") < (t(r, "starttime") ?? ""),
    describe: (r) =>
      `End time (${fmtDay(t(r, "endtime"))}) is before start time (${fmtDay(t(r, "starttime"))}).`,
  },

  /* ----- select-multiple internal coherence (generic over groups) ----- */
  ...groupFields.flatMap((g): RuleSpec[] => {
    const root = g.id;
    const noneSuffixes = gNoneSuffixes(root);
    const optionSuffixes = gOptionSuffixes(root);
    const specify = gSpecifySuffix();
    const out: RuleSpec[] = [];

    // X022 is only reachable when the group actually offers both a
    // "None"/"Not applicable" choice and at least one real option. Without a
    // none-choice `appliesTo` can never be true, and without real options
    // `violates` can never be true -- the rule would be dead weight.
    if (noneSuffixes.length > 0 && optionSuffixes.length > 0) {
      out.push({
        id: `X022-${root}`,
        code: "NONE_SELECTED_WITH_OPTIONS",
        severity: "warning",
        category: "coherence",
        description: `"None of the above" cannot be selected together with other options in ${root}.`,
        appliesTo: (r) => groupAny(r, root, noneSuffixes),
        violates: (r) => groupAny(r, root, optionSuffixes),
        describe: () => `"None"/"Not applicable" selected along with other options in ${root}.`,
      });
    }

    // X023 needs both halves of the comparison: a free-text "_SP" column to be
    // filled, and an "Others" (88) option to have been selected. Without the
    // "_SP" column it can never apply; without an "88" option nothing can
    // select it, so it would fire on every free-text entry.
    const hasSpecify = gSpecifySuffixes(root).length > 0;
    const hasOther = gOtherSuffixes(root).length > 0;
    if (hasSpecify && hasOther) {
      out.push({
        id: `X023-${root}`,
        code: "SPECIFY_WITHOUT_OTHER",
        severity: "warning",
        category: "coherence",
        description: `The "Others (specify)" text in ${root} is filled but the "Others" option is not selected.`,
        appliesTo: (r) => isDefined(r, `${root}_${specify}`),
        violates: (r) => !groupSelected(r, root, "88"),
        describe: () => `"Others (specify)" (${root}_SP) filled without selecting the Others option.`,
      });
    }
    return out;
  }),

  /* ----- app/dashboard coherence ----- */
  {
    id: "X024",
    code: "ANMOL_DATA_WITHOUT_ANM",
    severity: "info",
    category: "coherence",
    description:
      "ANMOL app counts are recorded although no ANM is reported available at the session.",
    appliesTo: (r) =>
      groupSelected(r, "C4", "A") === false && groupSelected(r, "C4", "B") === false,
    violates: (r) =>
      isDefined(r, "ANM1") ||
      isDefined(r, "ANM2") ||
      isDefined(r, "ANM3") ||
      isDefined(r, "ANM4"),
    describe: () =>
      "ANMOL app fields filled though no ANM/ANM-2 is available at the session site.",
  },
  {
    id: "X025",
    code: "ASHA_DATA_WITHOUT_ASHA",
    severity: "info",
    category: "coherence",
    description: "m-ASHA app data is recorded although no ASHA worker is reported at the session.",
    appliesTo: (r) =>
      groupSelected(r, "C4", "C") === false,
    violates: (r) => isDefined(r, "ASHA1") || isDefined(r, "ASHA2"),
    describe: () => "m-ASHA fields filled though no ASHA (Hope) worker is available at the site.",
  },
]);

function labelFor(id: string): string {
  return labelOf(id);
}

export const VHSND_FIELDS: FieldDef[] = FIELDS;
export function vhsndLabel(id: string): string {
  return labelFor(id);
}

const knownColumns: string[] = VHSND_COLUMNS.map((c) => c.code);

export const VHSND_SCHEMA: SchemaDef = {
  version: SCHEMA_VERSION,
  datasets: {
    vhsnd: {
      sourceKind: "odk",
      fields: FIELDS,
      crossFieldRules: VHSND_CROSS_FIELD_RULES,
      knownColumns,
    },
  },
};
