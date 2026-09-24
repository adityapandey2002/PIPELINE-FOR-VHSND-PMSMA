#!/usr/bin/env node
/**
 * Generates a minimal, valid generic .docx report template with {{placeholder}}
 * markers, plus a placeholder note so docx-templates and Word can open it.
 *
 * This is the "generic" template used until an official letterhead/master is
 * provided. Drop real templates into templates/ and run `npm run embed:templates`
 * to replace it (the embed step scans templates/ and mirror-picks generic files).
 *
 * Usage: `node scripts/make-default-templates.mjs`
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const outFile = resolve(process.cwd(), "templates/default/vhsnd-letter.docx");

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const p = (text, opts = {}) =>
  `<w:p>${opts.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ""}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="${opts.size ?? 22}"/><w:b w:val="${opts.bold ? "1" : "0"}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

const body = [
  p("VHSND MONTHLY REPORT", { center: true, bold: true, size: 32 }),
  p("National Health Mission", { center: true }),
  p(""),
  p("Dataset: {{dataset.name}}", { bold: true, size: 26 }),
  p("Source file: {{dataset.fileName}}"),
  p("Imported on: {{dataset.importedAt}}"),
  p("Schema: {{app.schemaVersion}}"),
  p("Generated at: {{generatedAt}}"),
  p(""),
  p("CLEANING SUMMARY", { bold: true, size: 24 }),
  p("Rows included: {{summary.keptRows}}"),
  p("Rows dropped: {{summary.droppedRows}}"),
  p("Rows pending: {{summary.pendingRows}}"),
  p("Errors found: {{summary.errorCount}}"),
  p("Warnings: {{summary.warningCount}}"),
  p("Unresolved errors: {{summary.unresolvedErrors}}"),
  p("Charts attached: {{charts.length}}"),
  p(""),
  p("CHARTS", { bold: true, size: 24 }),
  p("{{FOR chart IN charts}}"),
  p("{{INS $chart.title}}", { bold: true, size: 22 }),
  p("{{IMAGE chartImage($chart.blobKey)}}"),
  p("{{END-FOR chart}}"),
  p(""),
  p("HEADLINE INDICATORS", { bold: true, size: 24 }),
  p("{{FOR indicator IN indicators}}"),
  p("\u2022 {{INS $indicator.label}}: {{INS $indicator.value}}"),
  p("{{END-FOR indicator}}"),
  p(""),
  p("AUDIT", { bold: true, size: 24 }),
  p("{{FOR a IN audit}}"),
  p("Row {{INS $a.rowId}}: {{INS $a.status}}"),
  p("{{END-FOR a}}"),
  p(""),
  p("Manifest SHA-256: {{manifest}}"),
  p(""),
  p("Generated locally by VHSND Pipeline. Data never leaves this device.", { size: 18 }),
].join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>VHSND Report Template</dc:title><dc:creator>VHSND Pipeline</dc:creator><cp:lastModifiedBy>VHSND Pipeline</cp:lastModifiedBy></cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>VHSND Pipeline</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>NHM</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", rootRels);
zip.file("word/document.xml", documentXml);
zip.file("word/_rels/document.xml.rels", docRels);
zip.file("word/styles.xml", stylesXml);
zip.file("docProps/core.xml", coreXml);
zip.file("docProps/app.xml", appXml);

mkdirSync(join(outFile, ".."), { recursive: true });
writeFileSync(outFile, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`[make-default-templates] Wrote generic DOCX template -> ${outFile}`);