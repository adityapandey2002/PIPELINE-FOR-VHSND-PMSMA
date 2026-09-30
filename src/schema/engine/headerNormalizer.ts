import { VHSND_COLUMNS, columnLabel } from "@/schema/columns-vhsnd";

/** Canonical header resolution + display label lookup. */
export interface HeaderMap {
  /** canonicalCode -> original header (for value re-keying). */
  canonicalToOriginal: Record<string, string>;
  /** original header -> canonical code (or the original if unknown). */
  normalize: (header: string) => string;
  /** canonical/source code -> display label. */
  label: (code: string) => string;
  knownColumns: Set<string>;
}

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-");
}

function fuzzyKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FUZZY_MIN_HEADER_WORDS = 3;
const FUZZY_MIN_SHARED_WORDS = 2;
const FUZZY_DICE_THRESHOLD = 0.6;

const HINDI_ALIASES: Record<string, string> = {
  "पर्यवेक्षक का पदनाम": "A2",
  "संस्थान का नाम (big bet)": "A3",
  "राज्य": "B1",
  "जिला": "B2",
  "ब्लॉक का नाम": "B2A",
  "उप स्वास्थ केन्द्र का नाम (hsc/hwc)": "B4",
  "anm 1 का नाम": "B4_1",
  "anm 2 का नाम": "B4_2",
  "सत्र स्थल का नाम": "B5",
  "awc केन्द्र का कोड": "B6",
  "सत्र स्थल का प्रकार": "B7",
  "भ्रमण की तारीख": "B8",
  "क्या सत्र आयोजित किया गया है?": "C1",
  "क्या सत्र माइक्रोप्लान मे दर्शाये स्थान पर ही आयोजित किया जा रहा है": "C2",
  "यदि सत्र आयोजित नही हुआ है तो कारण क्या है?": "C3",
  "सत्र स्थल पर कौन- कौन से स्वास्थ्यकर्मी उपलब्ध हैं ?": "C4",
  "ए.एन.एम.(1)": "C4_A",
  "ए.एन.एम.(2)": "C4_B",
  "आशा": "C4_C",
  "awh सहायका": "C4_E",
  "क्या u-win पोर्टल का उपयोग किया जा रहा है": "C5",
  "क्या यह सत्र u-win पर पंजीकृत है": "C6",
  "क्या टीकाकरण के बाद e- vaccination प्रमाण पत्र बन रहे है": "C8",
  "क्या anmol app में सूचनाओं का संधारण किया जा रहा है?": "C9",
  "सत्र स्थल पर कौन- कौन से अन्य सदस्यों ने भाग लिया हैं ?": "C10",
  "vhsnc के सदस्य (मुखिया के अलावा)": "C10_A",
  "जीविका ग्राम संगठन की स्वास्थय": "C10_B",
  "उप समिति के सदस्य": "C10_C",
  "मुखिया": "C10_D",
  "pri (मुखिया के अलावा)": "C10_E",
  "कोई नहीं": "C10_99",
  "सत्र स्थल पर तैयारी या आयोजन के संबंध मे किन किन से सहयोग मिला ?": "C10_1",
  "क्या स्वास्थ्य या समाजकल्याण विभाग से किसी के द्वारा आज सत्र का पर्यवेक्षण किया गया": "C11",
  "किसके द्वारा आज सत्र का पर्यवेक्षण किया गया": "C11_1",
  "dist. offi cials health": "C11_1_A",
  "dist. offi cials icds": "C11_1_B",
  "आरोग्य दिवस पर सर्वे रजिस्टर उपलब्ध है?": "E1",
  "सर्वे रजिस्टर में पिछले माह नए जन्में बच्चे एवं नए गर्भवती जोड़े गए है?": "E1_1",
  "आरोग्य दिवस पर ड्यूलिस्ट उपलब्ध है?": "E2",
  "इनमे से कितने नाम किशोर-किशोरियों के है": "E2_1",
  "इनमे से कितने नाम योग्य दम्पत्तियों के है": "E2_2",
  "कितनी महिलाओं का tt-1 का टीकाकरण आज ड्यू है?": "E2_3",
  "कितने शिशुओं का पेंटावैलेंट-1 का टीकाकरण आज ड्यू है": "E2_4",
  "आज कितनी महिलाओं की तीसरी/चौथी प्रसवपूर्व जाँच (anc) ड्यू है?": "E2_5",
  "आज के सत्र पर वैक्सीन और कन्स्यूमबल कौन लेकर आया है": "E3",
  "क्या कोल्ड चेन भंडार से इस सत्र की दूरी 1 घंटे से ज्यादा की है": "E4",
  "सत्र स्थल पर निम्न में से क्या- क्या उपलब्ध है?": "G1",
  "rota virus": "G1_E",
  "vit. a": "G1_K",
  "सत्र स्थल पर कौनसी diluent, उपलब्ध है?": "G2",
  "सत्र स्थल पर निम्नलिखित में से क्या क्या उपलब्ध है? (सिर्फ कार्यरत मशीन के लिए हाँ दर्ज करें)": "G3",
  "बड़ों के लिए कार्यरत वजन मशीन": "G3_A",
  "बच्चो के लिए कार्यरत वजन मशीन": "G3_B",
  "बी.पी. मशीन कार्यरत है": "G3_C",
  "आला है (स्टैथौस्कोप) कार्यरत": "G3_D",
  "हिमोग्लोबिन जाँच किट": "G3_E",
  "ग्लूकोमीटर": "G3_F",
  "थर्मामिटर": "G3_G",
  "कार्यरत इंफेनटोमेटेर": "G3_H",
  "कार्यरत स्टेडिओमीटर": "G3_I",
  "पोषण की स्थिति को जाँचने के लिए संदर्भ तालिका उपलब्ध है": "G11",
  "सत्र पर निम्नलिखित में से क्या क्या उपलब्ध है? (उपयोग करने की स्थिति मे हो तभी हाँ दर्ज करें )": "G12",
  "आई.एफ.ए. की नीली गोली": "G12_A",
  "आई.एफ.ए. की गुलाबी गोली": "G12_B",
  "आई.एफ.ए. की लाल गोली": "G12_C",
  "आई.एफ.ए. की सिरप (बड़ों के लिए)": "G12_D",
  "आई.एफ.ए. की की सिरप (बच्चों के लिए)": "G12_E",
  "जिंक की गोली": "G12_F",
  "जिंक की सिरप": "G12_G",
  "अल्वेंडाजोल की गोली/सिरप": "G12_H",
  "कैल्सियम की गोली": "G12_I",
  "गर्भनिरोधक गोली (ओ.सी.पी.)": "G12_J",
  "आपातकालीन गर्भनिरोधक गोली (ई.सी.पी.)": "G12_K",
  "कण्डोम": "G12_L",
  "युरिनस्ट्रिप डिपिस्टीक": "G12_M",
  "यूरिन प्रेगनेन्सी कीट": "G12_N",
  "अंतरा इन्जेक्शन": "G12_O",
  "anc के दौरान गर्भवती महिला की ब्यक्तिगत गोपनीयता सुनिश्चित करने के लिए क्या उचित स्थान उपलब्ध है": "G21",
  "साबुन तथा पानी कि सुविधा उपलब्ध है": "G24",
  "प्रसव पूर्व जाँच के लिए निम्न में से कोन कोन सी सेवाएं दी जा रही है": "H1",
  "वजन माप": "H1_A",
  "कद माप": "H1_B",
  "बी.पी. जाँच": "H1_C",
  "हीमोग्लोबिन जाँच": "H1_D",
  "पेशाब जाँच": "H1_E",
  "शुगर जांच": "H1_F",
  "इनमें से कोई नहीं": "H1_99",
  "लागू नहीं": "H1_77",
  "ए.एन.एम. ने कितनी गर्भवती महिलाओं का बी.पी मापा? अवलोकन कर संख्या दर्ज करें": "H1BP",
  "ए.एन.एम. ने वैसी कितनी गर्भवती महिलाओं में उच्च रक्तचाप की पहचान किया?": "H1BP1",
  "ए.एन.एम. ने वैसी कितनी गर्भवती महिलाओं को रेफर किया जिनमे उच्च रक्तचाप की पहचान किया गया": "H1PB2",
  "खून की कमी (एनेमिया) की जाँच करने के लिए ए. एन.एम. ने कितनी गर्भवती महिलाओं का खून का नमूना लिया? अवलोकन कर संख्या दर्ज करें": "H1HB",
  "ए. एन. एम. ने वैसी कितनी गर्भवती महिलाओं का पहचान किया जिसे खून की कमी है? संख्या दर्ज करेंi": "H1HB1",
  "खून की कमी (एनेमिया) वाली गर्भवती महिलाओं मे से कितने को moderate anemia था": "H1HB_2",
  "खून की कमी (एनेमिया) वाली गर्भवती महिलाओं मे से कितने को sever anemia था": "H1HB_3",
  "खून की कमी (एनेमिया) वाली गर्भवती महिलाओं मे से कितनी महिलाओं को ये बताया गया की आप को moderate या sever एनेमिया है": "H1HB_4",
  "पहचान की गयी महिलाओं में से कितनी महिलाओं को रेफर किया गया ?": "H1HB2",
  "प्रसवपूर्व परामर्श अंतर्गत क्या जानकारी दी जा रही है": "H2",
  "प्रसवपूर्व जाँच का महत्व": "H2_A",
  "टेटनस टीकाकरण का महत्व": "H2_B",
  "आइ एफ ए का महत्व": "H2_C",
  "कैल्सीअम का महत्व": "H2_D",
  "गर्भावस्था के दौरान खतरे के लक्षणों की जानकारी एवं जरूरी सलाह": "H2_E",
  "शिशु जन्म की तैयारी": "H2_F",
  "पूरक पोषाहार का महत्व": "H2_G",
  "प्रसव-पश्चात जांच के लिए कुल कितनी धात्री माताएं सत्र पर आई थी": "H3A",
  "संख्या": "H3A_1",
  "vhsnd सत्र पर , प्रसव-पश्चात जांच में क्या क्या किया जा रहा है?": "H3",
  "बुखार की जाँच": "H3_A",
  "अत्यधिक रक्तस्राव": "H3_B",
  "पेट दर्द": "H3_C",
  "खून की जांच": "H3_D",
  "नौ": "H3_77",
  "खून की कमी (एनेमिया) की जाँच करने के लिए ए. एन.एम. ने कितनी धात्री माताओं का खून का नमूना लिया? अवलोकन कर संख्या दर्ज करें": "H3HB1_1",
  "ए. एन. एम. ने वैसी कितनी धात्री माताओं का पहचान किया जिसे खून की कमी है? संख्या दर्ज करेंi": "H3HB2_1",
  "खून की कमी (एनेमिया) वाली धात्री माताओं मे से कितने को moderate anemia था?": "H3HB3_1",
  "खून की कमी (एनेमिया) वाली धात्री माताओं मे से कितने को sever anemia था?": "H3HB4_1",
  "खून की कमी (एनेमिया) वाली धात्री माताओं मे से कितनी महिलाओं को ये बताया गया की आप को moderate या sever एनेमिया है?": "H3HB1_4",
  "पहचान की गयी धात्री माताओं में से कितनी धात्री माताओं को रेफर किया गया ?": "H3HB1_5",
  "प्रसव-पश्चात परामर्श अंतर्गत क्या जानकारी दी जा रही है": "H4",
  "प्रसव-पश्चात साफ सफाई": "H4_A",
  "स्तनपान का महत्व": "H4_B",
  "पौष्टिक आहार की जानकारी": "H4_C",
  "नवजात की आवश्यक देखभाल": "H4_D",
  "नियमित टीकाकरण": "H4_E",
  "डायरिया से बचाव एवं ओ.आर.एस. का महत्व": "H4_F",
  "बीमार बच्चों की पहचान एवं रेफरल": "H4_G",
  "परिवार नियोजन परामर्श": "H4_H",
  "क्या लाल आई.एफ.ए. गोली का वितरण किया गया": "H5",
  "क्या प्रसवपूर्व जांच (गर्भवती महिलाओं को) के समय वितरण किया गया": "H5_1",
  "ज्यादातर गर्भवती महिलाओं को एक बार मे ifa की कितनी गोली दी जा रही थी": "H5_1_1",
  "क्या प्रसव पश्चात ( धात्री माताओं) लाल आई.एफ.ए. गोली वितरण किया गया": "H5_2",
  "ज्यादातर धात्री माताओं को एक बार मे ifa की कितनी गोली दी जा रही थी": "H5_2_1",
  "क्या सत्र स्थल पर किशोर—किशोरी को कोई भी सेवाएँ प्रदान की जा रही है": "H6",
  "क्या सत्र स्थल पर नीली आई.एफ.ए. गोली का वितरण किया गया": "H6_1",
  "ज्यादातर किशोरियों को एक बार मे कितनी गोली दी जा रही है": "H6_1_1",
  "क्या सत्र स्थल पर कैल्सियम की गोली का वितरण किया जा रहा है": "H7",
  "क्या गर्भवती महिलाओं को अल्वेंडाजोल का वितरण (द्वितीय तिमाही में ) किया जा रहा है": "H8",
  "क्या सत्र स्थल पर ड्यू लिस्ट के अनुसार योग्य दम्पति उपस्थित हैं": "H9",
  "क्या ओ.सी.पी. का वितरण किया जा रहा है": "H10",
  "क्या ई.सी.पी. का वितरण किया जा रहा है": "H11",
  "क्या सत्र पर स्तनपान हेतु सलाह दिया जा रहा है": "H12",
  "एफएलडब्ल्यू द्वारा लाभार्थियों के साथ परिवार नियोजन एवं इसके महत्व पर चर्चा की गई?": "H12B",
  "क्या 6 माह से 5 वर्ष के बच्चों का पोषण स्तर का आकलन उम्र,वजन और लंबाई/ऊंचाई के आधार पर से किया जा रहा है": "H13",
  "क्या खतरे के लक्षण वाली महिलाओं को चिन्हित कर रेफर किया जा रहा है": "H14",
  "क्या खतरे के लक्षण वाले बच्चों को चिन्हित कर रेफर किया जा रहा है": "H15",
  "क्या उपरोक्त दिये जा रहे सेवाओं का संधारण mcp कार्ड में किया जा रहा है": "H16",
  "क्या ए.एन.एम. सीरिंज को प्रयोग करने के बाद हब कटर से काट रही है?": "H18",
  "यदि नही, तो संबंधित कारण :": "H19",
  "क्या ए.एन.एम. खोले गए सभी वैक्सीन वॉयलों पर खोलने की तिथि एवं समय लिख रही है?": "H20",
  "क्या टीकाकर्मी घोले गए बीसीजी/एम. आर./जे.ई. वॉयल को निर्धारित अवधि (4 घंटा) के बाद भी प्रयोग कर रही है?": "H21",
  "क्या स्वास्थकर्मी द्वारा अभिभावकों को 4 महत्वपूर्ण संदेश दिया जा रहा है?": "H22",
  "क्या स्वास्थकर्मी टीकाकरण के बाद लाभार्थियों को 30 मिनट तक रूकने की सलाह दे रहे है?": "H23",
  "सत्र स्थल पर टेली-परामर्श किया गया?": "H24",
  "स्पोक द्वारा कितने टेलीकंसल्टेशन आयोजित किए गए हैं ?": "H25",
  "यदि परामर्श नहीं हुआ तो शून्य परामर्श के क्या कारण हैं?": "H26",
  "सत्र के दोरान आप के द्वारा कितने टेलीकंसल्टेशन देखे गए संख्या": "H27",
  "क्या जरूरत पड़ने पर टेलीकंसल्टेशन के दोरान रेफर भी किया जा रहा है।": "H28",
  "सत्र स्थल पर कुल कितने नए mcp कार्ड उपलब्ध हैं ?": "H29",
  "क्या आज किसी गर्भवती महिलाओं का पंजीकरण किया गया": "H30",
  "क्या दी जा रही सेवाओं की जानकारी रजिस्टर मे भी संधारित की जा रही है": "H31",
  "आर.सी.एच.पंजी": "H32_A",
  "रफ रजिस्टर": "H32_B",
  "पीएल/जीएफ ने वीएचएसएनडी साइट का दौरा किया - संदर्भ सामग्री-1 का उपयोग करके लाभार्थियों को एफपी के महत्व के बारे में बताया।": "H33",
  "पीएल/जीएफ ने वीएचएसएनडी साइट का दौरा किया - संदर्भ सामग्री-1 का उपयोग करके एफएलडब्ब्ल्यू को एफपी के महत्व के बारे में बताया।": "H34",
  "गर्भवती महिलाओं की संख्या": "ANM2_1",
  "2 वर्ष से छोटे बच्चों की संख्या": "ANM3_1",
  "15 से 49 वर्ष के महिलाओं की संख्या": "ANM4_1",
  "क्या एनम dvdms ( e -aushadhi ) के माध्यम से दवा का मांग (indent) कर रही हैं ?": "ANM5",
  "क्या एनम dvdms ( e -aushadhi ) के माध्यम से दवा का वितरण (distribution) कर रही हैं ?": "ANM6",
  "परिवारों की संख्या": "ASHA2_1",
  "क्या सत्र पर लाभार्थियों का abha -id बन रहा हैं ?": "ASHA3",
  "क्या आप (आशा) fplmis app के द्वारा परिवार नियोजन सामग्री का मांग कर रही हैं ?": "ASHA4",
  "क्या आप (आशा) fplmis app के द्वारा परिवार नियोजन सामग्री का वितरण कर रही हैं ?": "ASHA5",
  "क्या सत्र पर स्कैन & शेयर की सेवा उपलब्ध हैं ?": "New",
  "टिप्पणी": "remarks",
  "Name of ANM Yes": "B4_1",
  "Name of ANM": "B4_1",
  "How many of these women have been referred to PMSMA?": "H1PB2",
  "Comment": "remarks",
};

const HINDI_SUFFIXES = ["का", "की", "के", "में", "से", "पर", "है", "हैं", "को", "के", "की", "का", "के"];

function stemWord(word: string): string {
  let w = word.toLowerCase().trim();
  for (const suffix of HINDI_SUFFIXES) {
    if (w.endsWith(suffix) && w.length > suffix.length + 1) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

function nearWordMatch(header: string, candidates: LabelCandidate[]): string | undefined {
  const headerWords = fuzzyKey(header).split(" ").filter(Boolean);
  if (headerWords.length === 0) return undefined;
  const headerStems = headerWords.map(stemWord);
  let best: LabelCandidate | undefined;
  let bestScore = -1;
  let ambiguous = false;
  for (const candidate of candidates) {
    const candidateStems = candidate.words.map(stemWord);
    let score = 0;
    for (const hs of headerStems) {
      for (const cs of candidateStems) {
        if (hs === cs) {
          score += 2;
        } else if (levenshtein(hs, cs) <= 1) {
          score += 1;
        }
      }
    }
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = candidate;
      ambiguous = false;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      ambiguous = true;
    }
  }
  return best && !ambiguous && bestScore >= 4 ? best.code : undefined;
}

interface LabelCandidate {
  code: string;
  words: string[];
  wordSet: Set<string>;
}

function fuzzyLabelMatch(header: string, candidates: LabelCandidate[]): string | undefined {
  const headerWords = fuzzyKey(header).split(" ").filter(Boolean);
  if (headerWords.length < FUZZY_MIN_HEADER_WORDS) return undefined;
  const headerSet = new Set(headerWords);
  let best: LabelCandidate | undefined;
  let bestScore = -1;
  let ambiguous = false;
  for (const candidate of candidates) {
    let shared = 0;
    for (const w of headerWords) {
      if (candidate.wordSet.has(w)) shared += 1;
    }
    if (shared < FUZZY_MIN_SHARED_WORDS) continue;
    const headerInLabel = headerWords.every((w) => candidate.wordSet.has(w));
    const labelInHeader = candidate.words.every((w) => headerSet.has(w));
    const containment = headerInLabel || labelInHeader;
    const dice = (2 * shared) / (headerWords.length + candidate.words.length);
    if (!containment && dice < FUZZY_DICE_THRESHOLD) continue;
    const score = containment ? 1 + shared / (headerWords.length + candidate.words.length) : dice;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = candidate;
      ambiguous = false;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      ambiguous = true;
    }
  }
  return best && !ambiguous ? best.code : undefined;
}

/** Build a header normalizer for the VHSND form. */
export function buildHeaderMap(): HeaderMap {
  const known = new Set<string>();
  const knownByUpper = new Map<string, string>();
  const aliasToCanonical = new Map<string, string>();
  const candidates: LabelCandidate[] = [];

  for (const col of VHSND_COLUMNS) {
    known.add(col.code);
    knownByUpper.set(col.code.toUpperCase(), col.code);
    const nk = normalizeKey(col.code);
    if (!aliasToCanonical.has(nk)) aliasToCanonical.set(nk, col.code);
    if (col.label && col.label.toLowerCase() !== col.code.toLowerCase()) {
      const nl = normalizeKey(col.label);
      if (!aliasToCanonical.has(nl)) aliasToCanonical.set(nl, col.code);
    }
    if (col.label) {
      const words = fuzzyKey(col.label).split(" ").filter(Boolean);
      if (words.length > 0) {
        candidates.push({ code: col.code, words, wordSet: new Set(words) });
      }
    }
  }

  for (const [hindi, code] of Object.entries(HINDI_ALIASES)) {
    const key = normalizeKey(hindi);
    if (!aliasToCanonical.has(key)) aliasToCanonical.set(key, code);
    if (!known.has(code)) {
      known.add(code);
      knownByUpper.set(code.toUpperCase(), code);
    }
  }

  const CODE_TOKEN =
    /[A-Z]+\d+[A-Z0-9]*(?:_[A-Z0-9]+)*|\b(?:SubmissionDate|starttime|endtime|New)\b/gi;

  function codeTokenIn(header: string): string | undefined {
    for (const m of header.matchAll(CODE_TOKEN)) {
      const hit = knownByUpper.get(m[0].toUpperCase());
      if (hit) return hit;
    }
    return undefined;
  }

  const memo = new Map<string, string>();

  function resolve(header: string): string {
    const exact = aliasToCanonical.get(normalizeKey(header));
    if (exact) return exact;
    const token = codeTokenIn(header);
    if (token) return token;
    const stripped = header.replace(/^\s*\d+[\s.)\-–—]*/, "").trim();
    if (stripped) {
      const viaLabel = aliasToCanonical.get(normalizeKey(stripped));
      if (viaLabel) return viaLabel;
    }
    const fuzzy = fuzzyLabelMatch(header, candidates);
    if (fuzzy) return fuzzy;
    const near = nearWordMatch(header, candidates);
    if (near) return near;
    return header;
  }

  return {
    knownColumns: known,
    canonicalToOriginal: {},
    normalize(header: string) {
      const cached = memo.get(header);
      if (cached !== undefined) return cached;
      const out = resolve(header);
      memo.set(header, out);
      return out;
    },
    label(code: string) {
      return columnLabel(code);
    },
  };
}

export function normalizeDistributionHeaders(headers: string[]): string[] {
  return headers.map(normalizeKey);
}
