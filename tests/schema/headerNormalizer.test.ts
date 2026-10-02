import { describe, expect, it } from "vitest";
import { buildHeaderMap } from "@/schema/engine/headerNormalizer";

describe("buildHeaderMap", () => {
  const map = buildHeaderMap();

  it("maps exact codes", () => {
    expect(map.normalize("B8")).toBe("B8");
    expect(map.normalize("C10_A")).toBe("C10_A");
    expect(map.normalize("SubmissionDate")).toBe("SubmissionDate");
  });

  it("maps exact labels", () => {
    expect(map.normalize("Date of visit")).toBe("B8");
  });

  it("maps codes embedded in longer headers", () => {
    expect(map.normalize("8. B8")).toBe("B8");
    expect(map.normalize("Date of visit (B8)")).toBe("B8");
    expect(map.normalize("B8 - Date of visit")).toBe("B8");
  });

  it("maps number-prefixed labels", () => {
    expect(map.normalize("8. Date of visit")).toBe("B8");
    expect(map.normalize("08) Date of visit")).toBe("B8");
    expect(map.normalize("7. New")).toBe("New");
  });

  it("maps en-dash / em-dash separators", () => {
    expect(map.normalize("Date of visit – B8")).toBe("B8");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(map.normalize("  date   of  visit ")).toBe("B8");
  });

  it("leaves genuinely unknown headers untouched", () => {
    expect(map.normalize("Some unrelated column")).toBe("Some unrelated column");
    expect(map.normalize("")).toBe("");
  });

  it("does not mis-map arbitrary letter-digit strings", () => {
    // "ANM" + "1" is not a contiguous known code token.
    expect(map.normalize("ANM 1")).toBe("ANM 1");
    expect(map.normalize("ANM1")).toBe("ANM1");
  });

  it("reads the ANM U-WIN question as C7", () => {
    expect(map.normalize("क्या ANM U-WIN पर पंजीकृत है")).toBe("C7");
  });

  it("keeps stray Hindi titles off the numeric-labelled H13", () => {
    // Devanagari that is not the nutrition question used to be one edit away
    // from H13's "6" and "5", so unrelated titles all read as H13.
    const stray = [
      "वीएचएसएनडी साइट पर लगाये गए अंतरा की कुल संख्या (Ask and observe)",
      "क्या ANM के द्वारा ANMOL App में सूचनाओं का संधारण किया जा रहा है?",
      "ANMOL App के ANM डैशबोर्ड मे कितनी गर्भवती महिला पंजीकृत हैं ?",
      "पीएल/जीएफ ने वीएचएसएनडी साइट का दौरा किया - एएफएलडब्ल्यू द्वारा चर्चा",
      "इनमें से कोई नहीं",
      "उप समिति के सदस्य",
      "जीविका ग्राम संगठन की स्वास्थय",
    ];
    for (const title of stray) expect(map.normalize(title)).not.toBe("H13");
  });

  it("still reads H13 from its own Hindi and English titles", () => {
    expect(
      map.normalize(
        "Is the nutritional status of children aged 6 months to 5 years being assessed based on age, weight and length/height?",
      ),
    ).toBe("H13");
    expect(
      map.normalize(
        "क्या 6 माह से 5 वर्ष के बच्चों का पोषण स्तर का आकलन उम्र,वजन और लंबाई/ऊंचाई के आधार पर से किया जा रहा है",
      ),
    ).toBe("H13");
  });
});