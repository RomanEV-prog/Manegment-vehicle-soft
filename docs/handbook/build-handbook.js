// eVersum SUMS Handbook — generator (.docx)
//
//   NODE_PATH="$(npm root -g)" node docs/handbook/build-handbook.js
//
// Vsebina je tukaj, da ostane usklajena z orodjem (isti repozitorij). Besedilo je
// v angleščini (za eVersum in TÜV SÜD). Kar mora potrditi eVersum, je označeno
// z [TO BE CONFIRMED] in rumeno podlago — nič od tega ni izmišljeno.

const fs = require("fs");
const path = require("path");
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} = require("docx");

const VERSION = "0.3 (draft)";
const DATE = "29 September 2026";
const TBC = "[TO BE CONFIRMED]";

// ─── Gradniki ────────────────────────────────────────────────────────────────
const FONT = "Arial";
const TABLE_W = 9638; // A4 z robovi 2 cm (DXA)

// Besedilo z označevanjem: **krepko**, [TO BE CONFIRMED ...] rumeno
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[TO BE CONFIRMED[^\]]*\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t, bold: true, highlight: "yellow", ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const p = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120 }, ...opts });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const h1Same = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullets = (items, ref = "bullets") =>
  items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 60 } }));
const steps = (items, ref) =>
  items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 60 } }));

const border = { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = TABLE_W / total;
  const w = widths.map((x) => Math.round(x * scale));
  w[w.length - 1] += TABLE_W - w.reduce((a, b) => a + b, 0);
  const cell = (text, i, head) =>
    new TableCell({
      borders,
      width: { size: w[i], type: WidthType.DXA },
      shading: head ? { fill: "E5E7EB", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: String(text)
        .split("\n")
        .map((line) => new Paragraph({ children: runs(line, { size: 18, bold: head || undefined }) })),
    });
  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      ...(headers ? [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) })] : []),
      // tabela brez glave: prvi stolpec je oznaka (sivo, krepko)
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, !headers && i === 0)) })),
    ],
  });
}
const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

// ─── Vsebina ─────────────────────────────────────────────────────────────────

const cover = [
  new Paragraph({ children: [new TextRun({ text: "eVersum", bold: true, size: 40, color: "1F2937" })], spacing: { before: 1800, after: 1200 } }),
  new Paragraph({ children: [new TextRun({ text: "SUMS Handbook", bold: true, size: 56 })], spacing: { after: 200 } }),
  new Paragraph({ children: [new TextRun({ text: "Software Update Management System according to UN Regulation No. 156", size: 28, color: "374151" })], spacing: { after: 600 } }),
  p(`**Version:** ${VERSION}`),
  p(`**Date:** ${DATE}`),
  p(`**Status:** Draft for review by eVersum (J. Zdun) — not released`),
  p(`**Document owner:** ${TBC}`),
  p("**Handbook ID / chapter numbering:** no previous SUMS handbook exists at eVersum; this document defines the structure (J. Zdun, 28 Sep 2026)."),
  new Paragraph({ children: [], spacing: { after: 600 } }),
  new Paragraph({
    shading: { fill: "FEF3C7", type: ShadingType.CLEAR, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: "D97706", space: 6 } },
    children: [new TextRun({ text: "Scope limitation — Over-the-air (OTA) updates are excluded. ", bold: true }), new TextRun("eVersum vehicles receive software updates exclusively in the workshop, performed by eVersum software engineers. Paragraph 7.1.4 of UN R156 is not applicable. This statement applies to this handbook and to all reports generated by the SUMS tool.")],
    spacing: { after: 120 },
  }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ children: [new TextRun({ text: "Contents", bold: true, size: 30 })], spacing: { after: 160 } }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
];

const docControl = [
  h1("1 Document control"),
  table(["Version", "Date", "Author", "Change"], [
    ["0.1 (draft)", DATE, "R. Adler", "First draft — describes the SUMS tool and maps it to UN R156 §7.1 and the TÜV SÜD self-assessment."],
    ["0.2 (draft)", "25 September 2026", "R. Adler", "Exports for authorities (register PDF, CSV), CSV import for migration (5.9), security controls extended (5.8, 4.9)."],
    [VERSION, DATE, "R. Adler", "Answers of J. Zdun (28 Sep 2026) incorporated: RXSWIN convention and storage on the vehicle (BCU, DID), read-back after flashing, system schemes baseline, readme naming, roles, vehicle types, notification, no migration from Helix. Open points reduced to chapter 7."],
  ], [15, 18, 17, 50]),
  gap(),
  table(["Role", "Name", "Signature / date"], [
    ["Prepared", "R. Adler", ""],
    ["Reviewed", `J. Zdun, Head of Systems and Security ${TBC}`, ""],
    ["Approved", TBC, ""],
  ], [25, 45, 30]),
];

const intro = [
  h1("2 Introduction"),
  h2("2.1 Purpose"),
  p("This handbook describes how eVersum manages software updates of its vehicles in accordance with UN Regulation No. 156 (Software Update Management System, SUMS). It explains which processes are used, who is responsible for them, which records are kept and how the eVersum SUMS tool supports and enforces those processes. It is intended as the reference document for the Approval Authority and the Technical Service (TÜV SÜD) and as the working instruction for the eVersum staff involved."),
  p("The handbook follows the structure of the TÜV SÜD self-assessment for UN R156. Chapter 7 maps every requirement of §7.1 to the process step and to the evidence produced by the tool."),
  h2("2.2 Scope"),
  ...bullets([
    `Vehicle types: the **IAV VHH 6.9m** vehicles are the first to be homologated for UN-ECE R156 (J. Zdun, 28 Sep 2026); model code ${TBC}. The e-Shuttle MK II-400 (ES03) is kept in the tool as the reference example from the R156 SUMS Overview diagram.`,
    "Software in scope: all software relevant to a type-approved system and grouped under an RXSWIN, for all ECUs listed in the ECU register (in-house and supplier ECUs).",
    "Update method: re-flashing in the workshop by eVersum engineers. No over-the-air updates; no updates performed by the vehicle user.",
    "RXSWIN on the vehicle: the RXSWIN is stored in the memory of the Body Control Unit (BCU) as a DID and is readable through the OBD port with the UDS service ReadDataByIdentifier (§7.2.1.2). A declaration of software versions to the Approval Authority instead of an on-vehicle RXSWIN (§7.2.1.2.2) is therefore not required.",
    "Out of scope: diagnostic functions, OTA (§7.1.4), vehicle production processes other than recording the end-of-line configuration.",
  ]),
  h2("2.3 Replacement of the previous implementation"),
  p("The SUMS was previously implemented in Helix ALM (RXSWIN documents, Initial End of Line Configuration and Software Update documents with baselining). The eVersum SUMS tool implements the same data model — see the R156 SUMS Overview diagram — so that every Helix record type has a one-to-one counterpart. The ERP system (work orders, collections of vehicles) and the Egnyte software repository remain in use and are linked from the tool."),
  p("Migration: Helix contains only examples, no live SUMS data (J. Zdun, 28 Sep 2026). The SUMS tool therefore starts fresh; nothing is migrated. The examples from the overview diagram (R48SWIN001) and the VCU readme (R100SWIN001) are loaded as reference data and will be removed before production use."),
  h2("2.4 References"),
  table(["Reference", "Document"], [
    ["[R156]", "UN Regulation No. 156 — Uniform provisions concerning the approval of vehicles with regards to software update and software update management system"],
    ["[ID]", "Interpretation Document for UN R155/R156 (ECE/TRANS/WP.29/2025/45)"],
    ["[ISO 24089]", "ISO 24089:2023 Road vehicles — Software update engineering"],
    ["[ISO 27001]", "ISO/IEC 27001 Information security management systems"],
    ["[POL]", "M1-DO-007 Cybersecurity Management Policy (eVersum, 15.04.2025)"],
    ["[DMP]", "SUMS Dokumentenmanagement-Prozess (eVersum, 01.07.2025)"],
    ["[SA]", "TÜV SÜD UNR156 SUMS Self-assessment eVersum v1.0"],
    ["[OVW]", "R156 SUMS Overview (eVersum diagram)"],
  ], [18, 82]),
  h2("2.5 Terms and abbreviations"),
  table(["Term", "Meaning"], [
    ["RXSWIN", "Regulation X Software Identification Number — identifier of the software relevant to the type-approved system under UN-ECE regulation X (§2.3 R156). eVersum convention: R<regulation number>SWIN<sequence>, e.g. R48SWIN001 (exterior lighting, UN-ECE R48, BCU), R100SWIN001 (powertrain / HV system, UN-ECE R100, VCU). One RXSWIN per regulation; an ECU may host software belonging to several RXSWINs."],
    ["DID", "Data identifier read with the UDS service ReadDataByIdentifier (0x22); the RXSWIN is held in the BCU under a DID"],
    ["System Schemes Baseline", "Version of the system schemes document set on Egnyte, identified by its version, format 'eShuttle <project> - System Schemes - v.<x.y>'"],
    ["Baseline", "Numbered, released state of all software belonging to one RXSWIN (versions, files, SHA-256 checksums, compatible hardware, change log)"],
    ["SU document", "Software Update document — record of one software update according to §7.1.2.5"],
    ["EOL configuration", "Initial End of Line Configuration — software and hardware configuration of a vehicle when it leaves production"],
    ["LKC", "Last Known Configuration — the most recent recorded configuration of a vehicle (VIN)"],
    ["SHA-256", "Cryptographic hash used as integrity validation data of software and configuration files"],
    ["V&V", "Verification and validation"],
    ["ECU", "Electronic control unit"],
    ["ERP WO", "Work order in the eVersum ERP system"],
  ], [22, 78]),
];

const overview = [
  h1("3 SUMS overview"),
  h2("3.1 Systems"),
  table(["System", "Content", "Role in the SUMS"], [
    ["eVersum SUMS tool", "Vehicle types, ECU register, RXSWIN register with baselines, Software Update documents, target vehicles, vehicle configurations (EOL / LKC), audit trail", "System of record for all R156 information; enforces the process rules"],
    ["Egnyte software repository", "Software and configuration files per ECU, readme files", "Secure storage of the binaries; referenced by hyperlink from the SUMS tool"],
    ["ERP system", "Collections of vehicles, work orders per VIN", "Production and service orders; linked by work order number; reads the LKC from the SUMS tool"],
  ], [22, 45, 33]),
  gap(),
  p(`Hosting of the SUMS tool: ${TBC} — currently a preview instance on a dedicated server (EU, Hetzner); production operation on the eVersum local server. Coverage of the SUMS tool server by the eVersum ISO 27001 ISMS ${TBC}.`),
  h2("3.2 Roles and responsibilities"),
  table(["Role in the tool", "Typical function", "Permissions"], [
    ["Administrator", "Head of Systems and Security", "All functions; user management; release of baselines and SU documents; V&V sign-off"],
    ["System engineer", "System engineers", "Release of baselines and SU documents; V&V sign-off; all editing functions"],
    ["Software engineer", "Software engineers (also perform the re-flash in the workshop)", "Create and edit drafts (baselines, SU documents); SHA-256 verification before flashing; recording of update results incl. RXSWIN read-back; recording of EOL configuration"],
    ["Auditor", "Technical Service / Approval Authority, internal audit", "Read only"],
  ], [20, 35, 45]),
  gap(),
  p("Every user has a personal account; shared accounts are not permitted. Every change in the tool is recorded in the audit trail with the user, time, and the state before and after (see 4.9). User accounts are created by an administrator with a random initial password."),
  p(`Authentication: local accounts with personal passwords (minimum 12 characters). Integration with eVersum AD / SSO ${TBC}.`),
  h2("3.3 Process overview"),
  ...steps([
    "**Register** the vehicle type, its ECUs and the RXSWINs (chapter 5.1).",
    "**Release a software baseline** for an RXSWIN when new software is ready: versions, files, SHA-256, compatible hardware, change log; publish the readme to Egnyte (5.2).",
    "**Document the software update** in an SU document: purpose, dependencies, affected RXSWINs, type approval assessment, execution and safety conditions, V&V sign-off, target vehicles with compatibility confirmation; then release it (5.3).",
    "**Execute** the update in the workshop: verify the file SHA-256 against the register, flash, record the result per vehicle — the tool records the new Last Known Configuration (5.4).",
    "**Notify** the vehicle user / fleet manager and record the notification (5.5).",
    "**Provide information** to authorities on request from the tool (5.7).",
  ], "steps-overview"),
];

const records = [
  h1("4 Records kept in the SUMS tool"),
  p("All records below are held in a single PostgreSQL database of the SUMS tool. Records that represent a released state are protected against modification at database level (database triggers), not only by the user interface; a change always creates a new record or a new revision, and the previous one remains readable."),
  h2("4.1 Vehicle type"),
  p("Name and model code of the vehicle type. RXSWINs, ECUs and SU documents are defined per vehicle type."),
  h2("4.2 ECU register (§7.1.1.2)"),
  p("Per vehicle type: ECU name, system, supplier, eVersum part number and the UN-ECE regulation the ECU is relevant to."),
  h2("4.3 Installed ECUs per vehicle"),
  p("Per VIN and ECU: serial number, hardware version and batch number. A change after the end-of-line configuration automatically creates a new Last Known Configuration."),
  h2("4.4 RXSWIN register (§7.1.2.3)"),
  p("Each RXSWIN is a record with its identifier (eVersum convention R<regulation>SWIN<sequence>, enforced by the tool), the vehicle type, a description of the system functionality, the regulations affected (the regulation named in the identifier is added automatically) and where the RXSWIN is stored on the vehicle (ECU — the BCU — and DID). Its software is described by numbered baselines:"),
  table(["Field (per ECU in a baseline)", "Content"], [
    ["ECU / part number / supplier", "From the ECU register"],
    ["SW version, SW file name", "Unique identification of the software"],
    ["SW file SHA-256", "Integrity validation data (method: SHA-256)"],
    ["Config version, config file, config SHA-256", "Configuration / parameter file, if applicable"],
    ["Compatible hardware", "Hardware precondition (§7.1.1.7)"],
    ["Egnyte folder", "Hyperlink to the files in the software repository"],
    ["Change log, description", "Content of the change"],
  ], [35, 65]),
  gap(),
  p("Baseline life cycle: **draft** (editable) → **released** (read-only) → **superseded** (when the next baseline is released; remains visible and exportable). A baseline can only be released by an administrator or system engineer and only if every file has a valid SHA-256 checksum. A change to released software always requires a new baseline, which starts as a copy of the current released one."),
  h2("4.5 Software Update document (§7.1.2.5)"),
  table(["Field", "R156 reference"], [
    ["Document ID (SU-<year>-<no.>), revision, title", "Unique identification"],
    ["Purpose of the update", "§7.1.2.5 (a)"],
    ["Dependencies identified, system schemes baseline (version of the system schemes on Egnyte, e.g. 'eShuttle X - System Schemes - v.1.9'), new hardware required", "§7.1.1.5, §7.1.2.5 (b), (g)"],
    ["Affected RXSWINs with baseline before and after", "§7.1.2.3, §7.1.2.5 (c)"],
    ["Type approval update necessary (yes/no) + justification", "§7.1.1.8–10, §7.1.2.5 (d), (e)"],
    ["Affected UN-ECE requirements / tests", "§7.1.1.8, §7.1.2.5 (d), (e)"],
    ["Approval granted, approval number and date", "§7.1.2.5 (f)"],
    ["Execution conditions, safe state conditions", "§7.1.2.5 (g)"],
    ["Actions required from the user / a competent person", "§7.1.2.5 (g)"],
    ["Safety / security confirmation", "§7.1.2.5 (h)"],
    ["V&V status (pass/fail), method and evidence, engineering sign-off (name, time)", "§7.1.3.3, §7.1.2.5 (i)"],
    ["User notification required; notified by / when / how", "§7.1.1.11"],
    ["Target vehicles with compatibility confirmation, execution result and RXSWIN read-back", "§7.1.1.6, §7.1.1.7, §7.1.2.4, §7.1.1.4"],
    ["ERP work order (number and link), Egnyte folder", "Links to ERP and repository"],
  ], [60, 40]),
  gap(),
  p("SU document life cycle: **draft** → **released** → **superseded** (by a new revision). The tool refuses the release until all required fields are complete, the V&V is passed and signed, every affected RXSWIN points to a released baseline and every target vehicle has a confirmed compatibility. Any change of the content after the V&V sign-off resets the sign-off. After release only two things can be recorded: the execution result per target vehicle (including whether the RXSWIN read back from the vehicle matches) and the user notification."),
  h2("4.6 Target vehicles (§7.1.2.4)"),
  p("List of VINs per SU document. Only vehicles of the SU document's vehicle type can be added. For each vehicle the tool shows its Last Known Configuration and whether the installed baseline matches the expected 'baseline before' of every affected RXSWIN (match / mismatch / already installed / no configuration recorded). Compatibility is confirmed per vehicle with name and time."),
  h2("4.7 Vehicle configurations (§7.1.2.2)"),
  p("Immutable snapshots per VIN: the **Initial End of Line configuration** (once per vehicle) and every subsequent **Last Known Configuration**. A snapshot contains the installed baseline of every RXSWIN with all software versions and SHA-256 checksums and the installed ECUs with serial number, hardware version and batch. A new LKC is recorded automatically after each successful software update (reason: SU document and revision) and after each change of installed ECU hardware."),
  p(`Type approval relevant vehicle or system parameters (§7.1.2.2, 4th criterion) ${TBC} — define which parameters are to be recorded with the configuration.`),
  h2("4.8 Reports"),
  ...bullets([
    "**Readme** per ECU software in a baseline — same structure as the Helix readme, file name '<ECU name> <software version> Readme' (e.g. 'VCU ES03v02_vcu1_1_2_115 Readme.pdf'); stored in the ECU software folder on Egnyte.",
    "**Software Update report** (PDF) — the complete SU record per §7.1.2.5 including target vehicles and results.",
    "**Last Known Configuration** per VIN — in the tool and through the ERP interface (JSON).",
    "**RXSWIN register** (PDF) — all RXSWINs of a vehicle type with every baseline (including superseded ones), all software versions and SHA-256 checksums, and the Software Update documents that changed them.",
    "**Vehicle configurations** (CSV) — the Last Known Configuration of every vehicle, one row per VIN and ECU.",
    "**Audit trail** — filterable by record, action, user and date; exportable as CSV.",
  ]),
  h2("4.9 Audit trail"),
  p("Every creation, change, release, supersession, signature, verification, execution, notification, import, failed login and ERP read access is written to the audit trail with: user (name), action, record, time, state before and after, and client IP address."),
  p("The audit trail is append-only and this is enforced by the database: the application connects with a restricted database role that may only read and insert audit entries, and a database trigger rejects any update or deletion. The restricted role is not the owner of the tables and therefore cannot disable the protection triggers of released records either."),
];

const processes = [
  h1("5 Processes"),
  h2("5.1 Registering vehicle types, ECUs and RXSWINs"),
  table(null, [
    ["Responsible", "Administrator / system engineer (vehicle types); software or system engineer (ECUs, RXSWINs)"],
    ["Input", "Type approval documentation, list of ECUs relevant to type-approved systems"],
    ["Output", "Vehicle type, ECU register, RXSWINs with description and regulations affected"],
  ], [20, 80]),
  gap(),
  ...steps([
    "Create the vehicle type (name, model code).",
    "Register every ECU relevant to a type-approved system: name, system, supplier, eVersum part number, UN-ECE regulation.",
    "Create one RXSWIN per UN-ECE regulation whose type-approved system contains software, named R<regulation number>SWIN<sequence> (e.g. R48SWIN001 for the exterior lighting software in the BCU, R100SWIN001 for the powertrain / HV software in the VCU). The tool adds the regulation from the identifier automatically; add further regulations if the same software affects more than one. An ECU may belong to several RXSWINs — when its software changes, every RXSWIN it belongs to is analysed.",
    `Record where the RXSWIN is stored on the vehicle: the BCU and the DID under which it is readable via UDS ReadDataByIdentifier. DID value: ${TBC}.`,
  ], "steps-51"),
  h2("5.2 Releasing a software baseline"),
  table(null, [
    ["Trigger", "New or changed software / configuration file for an ECU belonging to an RXSWIN"],
    ["Responsible", "Software engineer (draft); administrator or system engineer (release)"],
    ["Output", "Released baseline; readme PDF on Egnyte"],
  ], [20, 80]),
  gap(),
  ...steps([
    "Open a new baseline for the RXSWIN. It starts as a copy of the current released baseline.",
    "For each changed ECU enter the SW version, file name, configuration version, compatible hardware, Egnyte link and change log.",
    "Compute the SHA-256 of the software (and configuration) file with the built-in tool. The file is hashed locally in the browser and is not uploaded; the result is stored in the baseline.",
    "Peer review of the draft baseline (change log, compatible hardware, checksums).",
    "Release the baseline. The tool checks that every file has a valid SHA-256. The baseline becomes read-only; the previous one becomes superseded.",
    "Download the readme PDF of each changed ECU ('<ECU name> <software version> Readme') and store it in the ECU software folder on Egnyte next to the software file.",
  ], "steps-52"),
  h2("5.3 Software Update document"),
  table(null, [
    ["Trigger", "Decision to update vehicles in the field or in production to a new baseline"],
    ["Responsible", "Software engineer (draft); administrator / system engineer (V&V sign-off, release)"],
    ["Output", "Released SU document; Software Update report (PDF)"],
  ], [20, 80]),
  gap(),
  ...steps([
    "Create the SU document for the vehicle type: title and purpose of the update.",
    "Identify dependencies: systems and interfaces affected, based on the latest system schemes baseline on Egnyte (record its version, e.g. 'eShuttle X - System Schemes - v.1.9'); state whether new hardware is required.",
    "Add the affected RXSWINs and the new baseline for each; the tool records the baseline before.",
    "Assess the effect on type approval: decide whether a type approval update is necessary and justify the decision; list the affected UN-ECE requirements / tests; if an update of the approval is necessary, record the approval number and date once granted.",
    "Define the execution: conditions, safe state, actions required from the user or a competent person, and the confirmation that the update is conducted safely and securely.",
    "Add the target vehicles (VINs). Check the Last Known Configuration shown for each vehicle against the expected baseline before and against the compatible hardware in the baseline; confirm compatibility per vehicle or remove the vehicle.",
    "Perform verification and validation; the administrator / system engineer records pass or fail with method and evidence (engineering sign-off). Any later change of the content resets the sign-off.",
    "Release the SU document. The tool refuses the release if any condition is missing and lists what is missing.",
    "A later change requires a new revision; V&V and compatibility confirmations are repeated.",
  ], "steps-53"),
  h2("5.4 Execution of the update in the workshop"),
  table(null, [
    ["Precondition", "Released SU document with the vehicle listed as target"],
    ["Responsible", "eVersum software engineer"],
    ["Output", "Recorded result; new Last Known Configuration"],
  ], [20, 80]),
  gap(),
  ...steps([
    "Establish the execution conditions and the safe state defined in the SU document.",
    "Obtain the software file from the Egnyte repository only.",
    "Before flashing, use 'Verify file' on the baseline item: the tool computes the SHA-256 of the file and compares it with the register. Only a MATCH result allows flashing. Every verification (match or mismatch) is recorded in the audit trail with the technician's name.",
    "Flash the ECU.",
    "Read back the RXSWIN from the vehicle: read the RXSWIN DID from the BCU with the UDS service ReadDataByIdentifier (0x22) over the OBD port and compare the value with the RXSWIN identifier in the register (§7.1.1.4).",
    "Record the result (success / failed / rolled back) for the VIN in the SU document, together with the read-back result (matches / does not match) and the value read. A success automatically records the new Last Known Configuration of the vehicle. A recorded result cannot be overwritten.",
  ], "steps-54"),
  h2("5.5 User notification"),
  p("If the SU document requires notification, the fleet manager / customer is informed by e-mail about the update and its purpose — one notification per SU document. The person who sent the notification records it in the SU document (method, time). The tool records who made the entry."),
  p("The tool does not send the e-mail; it records that the notification was sent, by whom and when (MVP scope agreed with J. Zdun, 28 Sep 2026)."),
  h2("5.6 End-of-line configuration"),
  p("When a vehicle leaves production, the software engineer records the Initial End of Line configuration: the installed baseline of every RXSWIN, the configuration ID, the system schemes baseline, the V&V status and the ERP work order. The installed ECUs (serial number, hardware version, batch) are entered per vehicle. The EOL configuration can be recorded only once and is read-only."),
  h2("5.7 Information for the Approval Authority and the Technical Service"),
  p("On request, the following information is provided directly from the tool: the RXSWIN register with all baselines (RXSWIN register PDF, readme PDFs), the SU documents with target vehicles and results (Software Update report PDF), the Last Known Configuration of every vehicle (CSV) or of a single VIN, and the audit trail (CSV). Access for an assessor can be granted through a read-only account."),
  h2("5.8 Access management, integrity and backup"),
  ...bullets([
    "Personal user accounts with role-based permissions (3.2); accounts are deactivated, not deleted, when a person leaves. Passwords of at least 12 characters; users change their own password, administrators can reset it to a one-time random password.",
    "Deactivation, role changes and password changes take effect immediately: every request is checked against the user record; access tokens are valid for 15 minutes; the long-lived session token is held in an HttpOnly cookie that scripts cannot read.",
    "Login protection: limited number of failed login attempts; failed logins are recorded in the audit trail; HTTPS only; server firewall allows only HTTPS and SSH (key-based).",
    "Released records and the audit trail are protected against modification by database triggers; the application uses a restricted database role that cannot disable them.",
    "Links to external systems (Egnyte, ERP) accept only http(s) addresses; CSV exports are protected against spreadsheet formula injection.",
    `Database backup: automatic daily dump at 03:30, verified before it replaces the previous copy, kept for 14 days on the server. Off-site copy, retention period for production and periodic restore test ${TBC}.`,
    "ERP read access uses a dedicated API key stored only on the server.",
  ]),
];

// Kartiranje zahtev — [zahteva, kako izpolnjeno, dokaz, odprto]
const mapping = [
  ["7.1.1.1 Secure storing and sharing", "All R156 information is held in the SUMS tool (single database) with role-based access, personal accounts, HTTPS, audit trail and database-level protection of released records. Software binaries on Egnyte with restricted permissions. Information can be provided on request (5.7).", "Chapter 4, 5.7, 5.8; audit trail; access roles", `ISO 27001 scope incl. tool server ${TBC}; backup policy ${TBC}`],
  ["7.1.1.2 Identification of software versions", "ECU register + baselines: SW version, file name, SHA-256 of SW and config file, compatible hardware; per vehicle: ECU serial number, HW version, batch.", "RXSWIN register, readme PDF, vehicle configuration", ""],
  ["7.1.1.3 Management of RXSWIN information", "RXSWIN held at the manufacturer (register) and on the vehicle (DID in the BCU, readable via UDS over OBD). Before/after state: SU document records baseline before and after per affected RXSWIN; LKC per VIN shows the installed baseline. Update of information = new baseline (5.2).", "RXSWIN register (storage ECU / DID), SU document, LKC", `DID value ${TBC}`],
  ["7.1.1.4 Verification of software versions", "Expected versions and checksums per VIN are available from the LKC. File verification by SHA-256 before flashing is recorded. After flashing the RXSWIN is read back from the BCU via UDS ReadDataByIdentifier and the result (match / mismatch) is recorded per vehicle.", "LKC, verification and read-back entries in audit trail, SU report section 7", ""],
  ["7.1.1.5 Interdependencies", "SU document: dependencies identified, system schemes baseline (version of the system schemes on Egnyte), affected RXSWINs; V&V sign-off.", "SU report sections 1–3", ""],
  ["7.1.1.6 Identification of target vehicles", "Target vehicles on VIN level per SU document. Error prevention: only vehicles of the correct vehicle type can be selected; the LKC of each vehicle is compared with the expected baseline before; compatibility confirmed per VIN; ERP work order linked.", "SU report section 7", ""],
  ["7.1.1.7 Confirmation of compatibility", "Before release: per VIN the LKC (software and hardware) is shown against the baseline before; compatible hardware listed in the baseline and readme; confirmation per VIN with name/time; release blocked until all are confirmed; regression testing covered by V&V sign-off.", "SU report section 7; audit trail", ""],
  ["7.1.1.8 Effect on type approval", "Required decision 'type approval update necessary' with justification; affected UN-ECE requirements / tests; release blocked without them.", "SU report section 4", ""],
  ["7.1.1.9 Changed functionality", "Same assessment as 7.1.1.8; justification must address information package, test results and functions.", "SU report section 4", `Guidance text for the justification ${TBC}`],
  ["7.1.1.10 Changes compared to registration", "Dependencies and type approval assessment in the SU document.", "SU report sections 1 and 4", ""],
  ["7.1.1.11 User information", "Notification required flag; notification recorded (who, when, method); one notification per SU document; no user action needed (workshop update). The e-mail itself is sent outside the tool.", "SU report section 6", ""],
  ["7.1.1.12 Information to authorities", "RXSWIN register (PDF), SU documents with target vehicles (PDF), vehicle configurations and audit trail (CSV) are exported directly from the tool.", "5.7", ""],
  ["7.1.2.1 Documentation of processes", "This handbook; processes 5.1–5.9 apply to every vehicle type in scope (first: IAV VHH 6.9m).", "This document", ""],
  ["7.1.2.2 Configuration before/after update", "EOL configuration and LKC snapshots per VIN with SW versions, SHA-256, ECU hardware identification; SU document records baseline before/after.", "Vehicle configuration history", `Type approval relevant vehicle / system parameters ${TBC}`],
  ["7.1.2.3 RXSWIN register", "Auditable register: baselines numbered, released baselines read-only, superseded baselines kept; SW versions and SHA-256 for all software of each RXSWIN; method SHA-256; SU document lists affected RXSWINs.", "RXSWIN register, audit trail", ""],
  ["7.1.2.4 Target vehicles", "VIN list per SU document with compatibility confirmation, execution result and RXSWIN read-back.", "SU report section 7", ""],
  ["7.1.2.5 (a)–(f)", "Purpose; dependencies; affected RXSWINs (type-approved systems); type approval decision + justification; affected requirements; approval granted with number and date.", "SU report sections 1, 2, 4", ""],
  ["7.1.2.5 (g)", "Execution conditions; new hardware required; safe state; actions required from the user / a competent person.", "SU report sections 1, 5", ""],
  ["7.1.2.5 (h)", "Safety / security confirmation with justification of how the conditions are met.", "SU report section 5", ""],
  ["7.1.2.5 (i)", "V&V status pass/fail, method and evidence incl. adequacy of the method, engineering sign-off with name and time.", "SU report section 3", ""],
  ["7.1.3.1 Prevention of manipulation", "SHA-256 recorded at release; file verified against the register before flashing (recorded); only released baselines can be targeted by a released SU document; files only from the restricted Egnyte repository; suppliers do not deliver binaries for re-flash.", "Baselines, verification entries", ""],
  ["7.1.3.2 Protection of the update process", "Restricted repository access; SHA-256 cross-check; physical protection of vehicle update access points (covers, security bolts, tamper-evident seals); tool access control and audit trail.", "5.4, 5.8", `ISO 27001 evidence ${TBC}`],
  ["7.1.3.3 Verification and validation", "V&V sign-off required before an SU document can be released.", "SU report section 3", `V&V procedure document reference ${TBC}`],
  ["7.1.4.1 / 7.1.4.2 OTA", "Not applicable — no over-the-air updates (see scope statement).", "Cover page, 2.2", ""],
];

const migration = [
  h2("5.9 Migration and bulk import"),
  p("Existing records can be imported from CSV files (e.g. an ERP export of VINs or a Helix export of baseline data). Every import shows a preview first; nothing is saved until the user confirms it, and the import is only possible when every row is valid (all-or-nothing). Each import is recorded in the audit trail with the imported content."),
  ...bullets([
    "**Vehicles:** VIN, name and year per vehicle type. VINs already registered are skipped.",
    "**Baseline items:** one row per ECU (name or eVersum part number) with software version, files, SHA-256 checksums, compatible hardware, Egnyte link and change log — only into a draft baseline, which is then reviewed and released as described in 5.2.",
  ]),
];

const compliance = [
  h1("6 Compliance mapping to UN R156 §7.1"),
  p("The table maps each requirement to the process and the evidence produced. The column 'Open' lists what eVersum still has to confirm or provide; these items are also collected in chapter 7."),
  table(["Requirement", "How it is fulfilled", "Evidence", "Open"], mapping, [18, 44, 20, 18]),
];

const open = [
  h1("7 Open points"),
  p("Items still to be confirmed by eVersum before the handbook is released (questions 1–10 of 25 Sep 2026 were answered by J. Zdun on 28 Sep 2026 and are incorporated):"),
  table(["#", "Topic", "Question"], [
    ["1", "RXSWIN DID", "Under which DID is the RXSWIN readable from the BCU (UDS ReadDataByIdentifier)? To be entered in the RXSWIN register."],
    ["2", "Vehicle type", "Model code of the IAV VHH 6.9m; ECUs and RXSWINs of this vehicle type; TÜV assessment date."],
    ["3", "Type approval parameters", "Which vehicle / system parameters must be recorded with the configuration (§7.1.2.2)."],
    ["4", "ERP", "Identifier used by the ERP (Nejc) to link to the SUMS — currently the work order number; ERP read access to the Last Known Configuration is available (API key)."],
    ["5", "Egnyte", "Folder structure for the readme files (file naming agreed: '<ECU name> <software version> Readme')."],
    ["6", "Hosting, ISO 27001, backup", "Production server, ISMS coverage of the SUMS server, off-site backup and restore policy; AD / SSO."],
    ["7", "Document control", "Document owner and approver of this handbook."],
    ["8", "Part numbers", "From the overview diagram: is the eVersum part number up-revised when the software is updated?"],
  ], [5, 22, 73]),
];

// ─── Dokument ────────────────────────────────────────────────────────────────

const numberingRefs = ["bullets", "steps-overview", "steps-51", "steps-52", "steps-53", "steps-54"];
const doc = new Document({
  creator: "eVersum SUMS",
  title: "eVersum SUMS Handbook",
  description: "UN R156 Software Update Management System handbook",
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: FONT, color: "1F2937" }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: "2D5D9F" }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 21, bold: true, font: FONT }, paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: numberingRefs.map((ref) => ({
      reference: ref,
      levels: [{
        level: 0,
        format: ref === "bullets" ? LevelFormat.BULLET : LevelFormat.DECIMAL,
        text: ref === "bullets" ? "•" : "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 300 } } },
      }],
    })),
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `eVersum SUMS Handbook — v${VERSION}`, size: 16, color: "6B7280" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: "6B7280" })] })] }) },
    children: [...cover, ...docControl, ...intro, ...overview, ...records, ...processes, ...migration, ...compliance, ...open],
  }],
});

const out = path.join(__dirname, "eVersum-SUMS-Handbook-draft.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("OK", out, buf.length, "bytes");
});
