import { describe, expect, it } from "vitest";
import type { CleanRow } from "@/contracts/resolution";
import {
  COMPARISONS,
  COMPARISON_CATEGORIES,
  countTrue,
  pctTrue,
  stdBool,
  stdNum,
  sumNum,
} from "@/lib/comparisons";

let seq = 0;
const row = (values: Record<string, string | number | boolean | null>): CleanRow => ({
  rowId: `r${seq++}`,
  values,
});

describe("standardisation (booleans + text numbers)", () => {
  it("converts Yes/yes/1/true variants to true", () => {
    for (const v of ["Yes", "yes", "1", 1, true, "true", "Y", "TRUE"]) {
      expect(stdBool(v)).toBe(true);
    }
  });

  it("converts No/no/0/false variants to false", () => {
    for (const v of ["No", "no", "0", 0, false, "false", "N"]) {
      expect(stdBool(v)).toBe(false);
    }
  });

  it("returns null for junk", () => {
    for (const v of [null, undefined, "", "maybe", "9NoYes", 5, "null"]) {
      expect(stdBool(v)).toBeNull();
    }
  });

  it("casts text numbers to numeric", () => {
    expect(stdNum("42")).toBe(42);
    expect(stdNum("3.5")).toBe(3.5);
    expect(stdNum(7)).toBe(7);
    expect(stdNum(true)).toBe(1);
    expect(stdNum("No")).toBeNull();
    expect(stdNum("")).toBeNull();
    expect(stdNum(null)).toBeNull();
    expect(stdNum("1,200")).toBe(1200);
  });
});

describe("count / pct / sum helpers", () => {
  const rows = [
    row({ A: "Yes", N: "3" }),
    row({ A: "No", N: 4 }),
    row({ A: "yes", N: "5" }),
    row({ A: null, N: null }),
  ];

  it("countTrue uses standardised booleans", () => {
    expect(countTrue(rows, "A")).toBe(2);
  });

  it("pctTrue is out of all rows", () => {
    expect(pctTrue(rows, "A")).toBe(50);
  });

  it("sumNum casts text numbers", () => {
    expect(sumNum(rows, "N")).toBe(12);
  });
});

describe("funnel cascades", () => {
  const rows = [
    row({ G3_E: "Yes", H1HB: 10, H1HB1: 4, H1HB_4: 2 }),
    row({ G3_E: "Yes", H1HB: 5, H1HB1: 1, H1HB_4: 0 }),
    row({ G3_E: "No", H1HB: 0, H1HB1: 0, H1HB_4: 0 }),
  ];

  it("anemia cascade sums each step", () => {
    const def = COMPARISONS.find((c) => c.id === "anemia-cascade")!;
    const res = def.compute(rows);
    expect(res.kind).toBe("funnel");
    expect(res.series.points.map((p) => p.value)).toEqual([3, 2, 15, 5, 2]);
    expect(res.columnsMissing).toEqual([]);
    expect(res.insight).toContain("drop-off");
  });

  it("PIH cascade sums BP steps", () => {
    const rows2 = [
      row({ G3_C: true, H1BP: 8, H1BP1: 3, H1PB2: 2 }),
      row({ G3_C: false, H1BP: 2, H1BP1: 0, H1PB2: 0 }),
    ];
    const res = COMPARISONS.find((c) => c.id === "pih-cascade")!.compute(rows2);
    expect(res.series.points.map((p) => p.value)).toEqual([2, 1, 10, 3, 2]);
    expect(res.insight).toContain("Screening conversion");
  });

  it("reports missing columns instead of crashing", () => {
    const res = COMPARISONS.find((c) => c.id === "anemia-cascade")!.compute([row({ B2A: "X" })]);
    expect(res.columnsMissing).toContain("H1HB");
    expect(res.insight).toContain("not in this file");
  });
});

describe("group-by-block logics", () => {
  const rows = [
    row({ B2A: "BlockA", G3_F: "Yes", H1_F: "Yes", ASHA1: "Yes", H25: 4 }),
    row({ B2A: "BlockA", G3_F: "Yes", H1_F: "No", ASHA1: "No", H25: 6 }),
    row({ B2A: "BlockB", G3_F: "No", H1_F: "No", ASHA1: "No", H25: 0 }),
  ];

  it("GDM bottleneck counts equipment vs tested per block", () => {
    const res = COMPARISONS.find((c) => c.id === "gdm-bottleneck")!.compute(rows);
    expect(res.kind).toBe("grouped-bar");
    const blockA = res.extra!.groups!.find((g) => g.name === "BlockA")!;
    expect(blockA.equipment).toBe(2);
    expect(blockA.tested).toBe(1);
    expect(res.insight).toContain("ratio");
  });

  it("ASHA adoption is % true per block, sorted desc", () => {
    const res = COMPARISONS.find((c) => c.id === "asha-digital-by-block")!.compute(rows);
    expect(res.extra!.groups!.find((g) => g.name === "BlockA")!.value).toBe(50);
    expect(res.extra!.groups!.find((g) => g.name === "BlockB")!.value).toBe(0);
    expect(res.series.points[0].value).toBeGreaterThanOrEqual(res.series.points[1].value);
  });

  it("teleconsult groups by supervisor with mean H25", () => {
    const supRows = [
      row({ C11_1: "Health Worker", H25: 4 }),
      row({ C11_1: "Health Worker", H25: 8 }),
      row({ C11_1: null, H25: 0 }),
    ];
    const res = COMPARISONS.find((c) => c.id === "teleconsult-supervision")!.compute(supRows);
    expect(res.extra!.groups!.find((g) => g.name === "Health Worker")!.value).toBe(6);
    expect(res.extra!.groups!.find((g) => g.name === "No Supervisor")).toBeTruthy();
  });

  it("block scorecard returns 4 radar axes × blocks", () => {
    const res = COMPARISONS.find((c) => c.id === "block-scorecard")!.compute(rows);
    expect(res.kind).toBe("radar");
    expect(res.extra!.groups!.map((g) => g.name)).toEqual(["Equipment", "Diagnostics", "Counseling", "Hygiene"]);
    expect(res.extra!.seriesKeys!.map((s) => s.label)).toEqual(["BlockA", "BlockB"]);
  });
});

describe("service & readiness percentages", () => {
  it("ANC vs PNC averages only over columns present", () => {
    const rows = [
      row({ H1_A: "Yes", H1_C: "Yes", H1_D: "No", H3_A: "Yes", H3_B: "No" }),
      row({ H1_A: "Yes", H1_C: "No", H1_D: "No", H3_A: "No", H3_B: "No" }),
    ];
    const res = COMPARISONS.find((c) => c.id === "anc-pnc-bias")!.compute(rows);
    // ANC (only H1_A/H1_C/H1_D present): (2+1+0)/(2 rows × 3 cols) = 50%
    // PNC (only H3_A/H3_B present): (1+0)/(2 rows × 2 cols) = 25%
    expect(res.series.points[0].value).toBe(50);
    expect(res.series.points[1].value).toBe(25);
    expect(res.columnsMissing).toContain("H1_F");
  });

  it("basic vs advanced sorts descending with tier groups", () => {
    const rows = [row({ H1_A: "Yes", H1_C: "Yes", H1_D: "No", H1_E: "No", H1_F: "No" })];
    const res = COMPARISONS.find((c) => c.id === "basic-vs-advanced")!.compute(rows);
    expect(res.kind).toBe("bar-horizontal");
    expect(res.series.points[0].value).toBe(100);
    expect(res.extra!.barGroups).toHaveLength(5);
    for (let i = 1; i < res.series.points.length; i += 1) {
      expect(res.series.points[i].value).toBeLessThanOrEqual(res.series.points[i - 1].value);
    }
  });

  it("venue privacy/hygiene builds 100%-stacked pairs", () => {
    const rows = [
      row({ B7: "AWC", G21: "Yes", G24: "No" }),
      row({ B7: "Sub-centre", G21: "Yes", G24: "Yes" }),
    ];
    const res = COMPARISONS.find((c) => c.id === "venue-privacy-hygiene")!.compute(rows);
    expect(res.kind).toBe("stacked-100");
    expect(res.extra!.groups).toHaveLength(4);
    const awcPrivacy = res.extra!.groups!.find((g) => g.name === "AWC · Privacy")!;
    expect(awcPrivacy.ok).toBe(100);
    expect(awcPrivacy.notOk).toBe(0);
  });

  it("ANM safety reports the weakest compliance", () => {
    const rows = [row({ H18: "Yes", H20: "No", H21: "Yes" }), row({ H18: "Yes", H20: "No", H21: "Yes" })];
    const res = COMPARISONS.find((c) => c.id === "anm-safety-hygiene")!.compute(rows);
    expect(res.kind).toBe("bar-horizontal");
    expect(res.series.points.find((p) => p.name.includes("Time on vials"))!.value).toBe(0);
    expect(res.insight).toContain("0%");
  });
});

describe("supply chain logics", () => {
  it("urine cross-tab counts all four cells", () => {
    const rows = [
      row({ G12_M: "Yes", H1_E: "Yes" }),
      row({ G12_M: "Yes", H1_E: "No" }),
      row({ G12_M: "Yes", H1_E: "No" }),
      row({ G12_M: "No", H1_E: "No" }),
    ];
    const res = COMPARISONS.find((c) => c.id === "urine-crosstab")!.compute(rows);
    expect(res.kind).toBe("heatmap");
    const cells = res.extra!.matrix!.cells;
    expect(cells[0][0]).toBe(1); // supply yes, test yes
    expect(cells[0][1]).toBe(2); // supply yes, test no → negligence
    expect(cells[1][1]).toBe(1);
    expect(res.insight).toContain("behaviour failed");
  });

  it("IFA box plot filters outliers > 180", () => {
    const rows = [
      row({ H5_1_1: 30 }),
      row({ H5_1_1: 40 }),
      row({ H5_1_1: 50 }),
      row({ H5_1_1: 60 }),
      row({ H5_1_1: 900 }), // outlier
    ];
    const res = COMPARISONS.find((c) => c.id === "ifa-distribution")!.compute(rows);
    expect(res.kind).toBe("box");
    const box = res.extra!.boxes!.find((b) => b.name.includes("H5_1_1"))!;
    expect(box.max).toBe(60);
    expect(box.n).toBe(4);
    expect(box.med).toBe(45);
  });

  it("FP supply vs counseling computes both gauges", () => {
    const rows = [
      row({ G12_J: "Yes", H12B: "Yes" }),
      row({ G12_J: "No", G12_K: "No", H12B: "No" }),
      row({ G12_K: "Yes", H12B: "No" }),
    ];
    const res = COMPARISONS.find((c) => c.id === "fp-supply-vs-counsel")!.compute(rows);
    expect(res.kind).toBe("gauge");
    expect(res.extra!.gauges![0].value).toBeCloseTo(66.7, 1);
    expect(res.extra!.gauges![1].value).toBeCloseTo(33.3, 1);
  });
});

describe("counseling logics", () => {
  it("prenatal pareto sorts desc with cumulative reaching 100", () => {
    const rows = [row({ H2_A: "Yes", H2_B: "Yes", H2_E: "No" }), row({ H2_A: "Yes", H2_B: "No", H2_E: "No" })];
    const res = COMPARISONS.find((c) => c.id === "prenatal-counseling")!.compute(rows);
    expect(res.kind).toBe("pareto");
    const groups = res.extra!.groups!;
    expect(Number(groups[0].value)).toBeGreaterThanOrEqual(Number(groups[groups.length - 1].value));
    expect(Number(groups[groups.length - 1].cum)).toBe(100);
    expect(res.insight).toContain("Danger signs");
  });

  it("PNC neglect scopes to attended mothers and flags ignored", () => {
    const rows = [
      row({ H3A: 5, H3_99: "Yes", H4_99: "No" }),
      row({ H3A: 3, H3_99: "No", H4_99: "No" }),
      row({ H3A: 0, H3_99: "Yes", H4_99: "No" }), // not attended → out of scope
    ];
    const res = COMPARISONS.find((c) => c.id === "pnc-neglect")!.compute(rows);
    expect(res.kind).toBe("donut");
    expect(res.series.points[0].value).toBe(1); // cared
    expect(res.series.points[1].value).toBe(1); // ignored
    expect(res.insight).toContain("2 mother(s) in scope");
  });
});

describe("digital health logics", () => {
  it("register reality counts each register type", () => {
    const rows = [row({ H32_A: "Yes", H32_B: "No" }), row({ H32_B: "Yes", H32_88: "No" })];
    const res = COMPARISONS.find((c) => c.id === "register-reality")!.compute(rows);
    expect(res.kind).toBe("pie");
    expect(res.series.points.map((p) => p.value)).toEqual([1, 1, 0]);
  });

  it("MCP gap counts >3 services but not maintained", () => {
    const rows = [
      row({ H1_A: "Yes", H1_B: "Yes", H1_C: "Yes", H1_D: "Yes", H1_E: "No", H1_F: "No", H16: "No" }), // 4 done, not in MCP → gap
      row({ H1_A: "Yes", H1_B: "Yes", H1_C: "Yes", H1_D: "No", H1_E: "No", H1_F: "No", H16: "Yes" }), // 3 done → no gap
      row({ H1_A: "Yes", H1_B: "Yes", H1_C: "Yes", H1_D: "Yes", H1_E: "Yes", H1_F: "No", H16: "No" }), // 5 done → gap
    ];
    const res = COMPARISONS.find((c) => c.id === "mcp-gap")!.compute(rows);
    expect(res.kind).toBe("scatter");
    expect(res.series.points[0].value).toBe(2);
    expect(res.extra!.scatter).toHaveLength(3);
    expect(res.insight).toContain("2 site(s)");
  });
});

describe("vulnerable demographics logics", () => {
  it("teen/couple waffle scopes to due-list rows", () => {
    const rows = [
      row({ E2_1: 3, E2_2: 0, H9: "Yes" }),
      row({ E2_1: 0, E2_2: 5, H9: "No" }),
      row({ E2_1: 0, E2_2: 0, H9: "Yes" }), // no due list → out of scope
    ];
    const res = COMPARISONS.find((c) => c.id === "teen-couple-attraction")!.compute(rows);
    expect(res.kind).toBe("waffle");
    expect(res.extra!.waffle!.total).toBe(2);
    expect(res.extra!.waffle!.filled).toBe(1);
    expect(res.insight).toContain("50%");
  });

  it("danger sign gap reports both percentages", () => {
    const rows = [
      row({ H14: "Yes", H15: "No" }),
      row({ H14: "Yes", H15: "No" }),
      row({ H14: "No", H15: "No" }),
      row({ H14: "No", H15: "No" }),
    ];
    const res = COMPARISONS.find((c) => c.id === "danger-sign-gap")!.compute(rows);
    expect(res.series.points[0].value).toBe(50);
    expect(res.series.points[1].value).toBe(0);
  });

  it("ANC dropout gauge divides sums", () => {
    const rows = [
      row({ E2_5: 4, H1BP: 20 }),
      row({ E2_5: 6, H1BP: 30 }),
    ];
    const res = COMPARISONS.find((c) => c.id === "anc-dropout-gauge")!.compute(rows);
    expect(res.kind).toBe("gauge");
    expect(res.extra!.gauges![0].value).toBe(20);
    expect(res.insight).toContain("drop out");
  });
});

describe("registry integrity", () => {
  it("has 20 comparisons across 6 categories", () => {
    expect(COMPARISONS).toHaveLength(20);
    const cats = new Set(COMPARISONS.map((c) => c.category));
    expect(cats.size).toBe(COMPARISON_CATEGORIES.length);
    for (const cat of COMPARISON_CATEGORIES) {
      expect(COMPARISONS.some((c) => c.category === cat)).toBe(true);
    }
  });

  it("every comparison runs on empty rows without crashing", () => {
    for (const def of COMPARISONS) {
      const res = def.compute([]);
      expect(res.kind).toBeTruthy();
      expect(typeof res.insight).toBe("string");
      expect(res.series.stats).toBeTruthy();
    }
  });

  it("every comparison runs on unrelated rows without crashing", () => {
    const junk = [row({ Foo: "bar", Baz: 12 }), row({ Foo: null, Baz: "No" })];
    for (const def of COMPARISONS) {
      const res = def.compute(junk);
      expect(res.columnsMissing.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const ids = COMPARISONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
