// Vsebina pomoči v aplikaciji (EN / SL). Imena gumbov v **zvezdicah** se morajo ujemati
// z napisi v messages/*.json — ob preimenovanju gumba popravi tudi tukaj.

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  route?: string;
  ref?: string;          // odstavek UN R156
  steps: string[];
  tips?: string[];
}

export interface SetupStep {
  key: "vehicle_types" | "ecus" | "rxswins" | "released_baselines" | "vehicles" | "eol_configurations" | "released_updates" | "executed_updates";
  title: string;
  hint: string;
  route: string;
  topic: string;
}

interface HelpContent {
  setupTitle: string;
  setupIntro: string;
  setupDone: string;
  setup: SetupStep[];
  topics: HelpTopic[];
}

const en: HelpContent = {
  setupTitle: "Getting started",
  setupIntro: "Set up the SUMS in this order. Each step turns green when it is done.",
  setupDone: "Setup complete — the SUMS is ready for software updates.",
  setup: [
    { key: "vehicle_types", title: "Create a vehicle type", hint: "ECUs, RXSWINs and Software Updates belong to a vehicle type.", route: "/ecus", topic: "ecus" },
    { key: "ecus", title: "Register the ECUs", hint: "Every ECU relevant to a type-approved system, with eVersum part number.", route: "/ecus", topic: "ecus" },
    { key: "rxswins", title: "Create the RXSWINs", hint: "One record per RXSWIN with the regulations it covers.", route: "/rxswins", topic: "rxswins" },
    { key: "released_baselines", title: "Release a software baseline", hint: "Software versions and SHA-256 checksums of each RXSWIN.", route: "/rxswins", topic: "baseline" },
    { key: "vehicles", title: "Register the vehicles", hint: "VINs per vehicle type — one by one or by CSV import.", route: "/fleet", topic: "fleet" },
    { key: "eol_configurations", title: "Record end-of-line configurations", hint: "The software each vehicle had when it left production.", route: "/fleet", topic: "vehicle" },
    { key: "released_updates", title: "Release a Software Update", hint: "The §7.1.2.5 document with target vehicles and V&V sign-off.", route: "/software-updates", topic: "software-updates" },
    { key: "executed_updates", title: "Record an executed update", hint: "The workshop result per vehicle — creates the new Last Known Configuration.", route: "/software-updates", topic: "execution" },
  ],
  topics: [
    {
      id: "overview",
      title: "Overview",
      summary: "What needs attention: drafts waiting for release, released updates not yet executed, vehicles without an end-of-line configuration, and recent activity.",
      route: "/sums",
      steps: [
        "Use the lists as a to-do list — click an entry to open it.",
        "**Software Updates in draft** wait for completion and release by an administrator or QC manager.",
        "**Released updates not yet executed** still have target vehicles without a recorded result.",
        "**Vehicles without end-of-line configuration** need their initial configuration recorded before their updates can be checked against it.",
      ],
    },
    {
      id: "ecus",
      title: "Vehicle types and ECU register",
      summary: "Unique identification of the components of type-approved systems.",
      route: "/ecus",
      ref: "§7.1.1.2",
      steps: [
        "Administrators and QC managers create a vehicle type with **New vehicle type** (name and model code).",
        "Select the vehicle type and click **New ECU**.",
        "Enter the ECU name, eVersum part number, system, supplier and the UN-ECE regulation the ECU is relevant to.",
        "Use the pencil icon to correct an entry. Every change is recorded in the audit trail.",
      ],
      tips: ["The ECU name is unique per vehicle type; the part number is used by the CSV import to match rows."],
    },
    {
      id: "rxswins",
      title: "RXSWIN register",
      summary: "Each RXSWIN is a record with numbered baselines that list all software relevant to it.",
      route: "/rxswins",
      ref: "§7.1.2.3",
      steps: [
        "Click **New RXSWIN**, choose the vehicle type and enter the identifier (e.g. R48SWIN001), the description and the regulations affected.",
        "Open the RXSWIN and click **Open new baseline** to describe its software (see 'Software baseline').",
        "**Register PDF** exports the complete register with all baselines — including superseded ones — for the Technical Service.",
      ],
      tips: ["An RXSWIN identifier may contain uppercase letters, digits and - _ . ; the numbering convention is defined by eVersum."],
    },
    {
      id: "baseline",
      title: "Software baseline",
      summary: "A baseline is the released state of all software of one RXSWIN. Once released it is read-only.",
      route: "/rxswins",
      ref: "§7.1.2.3, §7.1.3.1",
      steps: [
        "In the RXSWIN, click **Open new baseline** and enter the reason for the change. The draft starts as a copy of the current released baseline.",
        "Click **Add ECU software** (or the pencil icon on an existing row) and enter the SW version, file name, compatible hardware, Egnyte folder and change log.",
        "Click **Compute from file** next to the SHA-256 field and select the software file. The checksum is computed in your browser — the file is not uploaded.",
        "Repeat for the configuration file if the ECU has one.",
        "Have the draft peer-reviewed, then an administrator or QC manager clicks **Release baseline**. The previous baseline becomes superseded.",
        "Click **Readme PDF** on each changed ECU and store the readme in the ECU software folder on Egnyte.",
      ],
      tips: [
        "Release is only possible when every file has a valid SHA-256 checksum.",
        "Many ECUs at once: use **Import CSV** in the draft baseline.",
        "A released baseline cannot be edited — open a new baseline instead.",
      ],
    },
    {
      id: "software-updates",
      title: "Software Update document",
      summary: "Documentation of one software update for a vehicle type, with every item required by §7.1.2.5.",
      route: "/software-updates",
      ref: "§7.1.1.5–11, §7.1.2.4, §7.1.2.5",
      steps: [
        "Click **New Software Update**, choose the vehicle type and enter the title and purpose.",
        "Section 1: list the dependencies and the system schemes baseline; state whether new hardware is required.",
        "Section 2: **Add RXSWIN** and select the new baseline. The tool records the baseline before automatically.",
        "Section 4: decide whether a type approval update is necessary and justify it; list the affected UN-ECE requirements.",
        "Section 5: execution conditions, safe state, actions required from the user and the safety confirmation.",
        "Section 7: **Add vehicles**. Check the 'Last known config' column for each vehicle, then **Confirm** its compatibility.",
        "**Save changes**, then an administrator or QC manager records the verification with **Sign V&V**.",
        "The yellow box lists what is still missing. When it turns green, click **Release**.",
        "**PDF report** exports the complete record.",
      ],
      tips: [
        "Changing the content after the V&V sign-off resets it — sign again after the last change.",
        "A released document can only be changed by **New revision**; V&V and compatibility are confirmed again.",
        "'Does not match baseline before' in the Last known config column means the vehicle has different software than the update expects.",
      ],
    },
    {
      id: "execution",
      title: "Executing an update in the workshop",
      summary: "Verify the file before flashing and record the result for each vehicle.",
      route: "/software-updates",
      ref: "§7.1.3.1, §7.1.2.2",
      steps: [
        "Establish the execution conditions and the safe state given in the released Software Update document.",
        "Take the software file from the Egnyte repository only.",
        "Open the RXSWIN, find the ECU in the released baseline and click **Verify file**. Select the file you are about to flash.",
        "Flash only on a green MATCH. A MISMATCH means the file must not be used. Every check is recorded in the audit trail with your name.",
        "After flashing, open the Software Update document and record the result for the VIN: **Success**, **Failed** or **Rolled back**.",
        "A success automatically records the vehicle's new Last Known Configuration.",
      ],
      tips: ["A recorded result cannot be changed."],
    },
    {
      id: "fleet",
      title: "Vehicles (VIN register)",
      summary: "All vehicles per vehicle type — the target vehicles of software updates.",
      route: "/fleet",
      ref: "§7.1.1.6, §7.1.2.4",
      steps: [
        "Select the vehicle type and click **New vehicle** (VIN, name, year) — or **Import CSV** for many vehicles.",
        "Click a vehicle to open its configuration.",
        "**Configurations CSV** exports the Last Known Configuration of every vehicle.",
      ],
    },
    {
      id: "vehicle",
      title: "Vehicle configuration",
      summary: "Installed ECUs and the configuration history of one VIN. Every record is immutable.",
      route: "/fleet",
      ref: "§7.1.2.2, §7.1.1.7",
      steps: [
        "When the vehicle leaves production, click **Record end-of-line configuration** and select the installed baseline of each RXSWIN. This is done once per vehicle.",
        "Enter the serial number, HW version and batch of each installed ECU and click **Save ECUs**.",
        "After a successful software update the new Last Known Configuration appears automatically; the history keeps every previous one.",
      ],
      tips: ["Changing ECU hardware data after end of line also creates a new Last Known Configuration."],
    },
    {
      id: "import",
      title: "Importing from CSV",
      summary: "Migrate existing data from the ERP or Helix.",
      steps: [
        "Click **Import CSV** (Vehicles page, or in a draft baseline) and **Download template**.",
        "Fill in the template in Excel and save it as CSV (comma or semicolon separated).",
        "Choose the file. The preview lists what will be created, what is skipped and any errors per row.",
        "Fix errors and choose the file again. Import is only possible when every row is valid.",
      ],
      tips: ["Imports are recorded in the audit trail with their content."],
    },
    {
      id: "sha256",
      title: "SHA-256 tool",
      summary: "Compute the checksum of any file and compare it with a reference value.",
      route: "/sha256",
      steps: [
        "Drop a file on the tool or click to select it. The file stays on your computer.",
        "Paste a reference checksum (e.g. from a readme) to compare.",
      ],
      tips: ["To record a verification against the register before flashing, use **Verify file** on the baseline item instead."],
    },
    {
      id: "audit",
      title: "Audit trail",
      summary: "Every change in the SUMS with user, time and the state before and after.",
      route: "/audit",
      ref: "§7.1.1.1, §7.1.1.12",
      steps: [
        "Filter by action, record type or date.",
        "Click an entry to see the state before and after the change.",
        "**Export CSV** exports the filtered entries for the Technical Service.",
      ],
      tips: ["The audit trail cannot be edited or deleted — this is enforced by the database."],
    },
    {
      id: "users",
      title: "Users and passwords",
      summary: "Personal accounts with roles; every entry in the SUMS is attributable to a person.",
      route: "/settings",
      steps: [
        "Change your own password under **Change password** (at least 12 characters).",
        "Administrators create users with **New user** (use **Generate** for a random password) and pass the password on securely.",
        "**Reset password** sets a new random password that is shown once; the user should change it after logging in.",
        "Deactivate users who leave — they are not deleted, so their entries remain attributable.",
      ],
      tips: [
        "Roles: Administrator (everything), QC manager (release, V&V sign-off), Technician (drafts, verification, results), Partner viewer (read only).",
      ],
    },
  ],
};

const sl: HelpContent = {
  setupTitle: "Prvi koraki",
  setupIntro: "SUMS postavi v tem vrstnem redu. Korak se obarva zeleno, ko je narejen.",
  setupDone: "Postavitev končana — SUMS je pripravljen za posodobitve programske opreme.",
  setup: [
    { key: "vehicle_types", title: "Ustvari tip vozila", hint: "ECU-ji, RXSWIN-i in Software Update so vezani na tip vozila.", route: "/ecus", topic: "ecus" },
    { key: "ecus", title: "Vpiši ECU-je", hint: "Vsak ECU, pomemben za homologiran sistem, z eVersum številko dela.", route: "/ecus", topic: "ecus" },
    { key: "rxswins", title: "Ustvari RXSWIN-e", hint: "En zapis na RXSWIN z uredbami, ki jih pokriva.", route: "/rxswins", topic: "rxswins" },
    { key: "released_baselines", title: "Izdaj baseline programske opreme", hint: "Verzije programske opreme in SHA-256 za vsak RXSWIN.", route: "/rxswins", topic: "baseline" },
    { key: "vehicles", title: "Vpiši vozila", hint: "VIN-i po tipu vozila — posamezno ali z uvozom CSV.", route: "/fleet", topic: "fleet" },
    { key: "eol_configurations", title: "Zapiši konfiguracije ob koncu linije", hint: "Programska oprema, ki jo je imelo vozilo ob izhodu iz proizvodnje.", route: "/fleet", topic: "vehicle" },
    { key: "released_updates", title: "Izdaj Software Update", hint: "Dokument po §7.1.2.5 s ciljnimi vozili in podpisom V&V.", route: "/software-updates", topic: "software-updates" },
    { key: "executed_updates", title: "Zapiši izvedeno posodobitev", hint: "Rezultat iz delavnice za vozilo — ustvari novo zadnjo znano konfiguracijo.", route: "/software-updates", topic: "execution" },
  ],
  topics: [
    {
      id: "overview",
      title: "Pregled",
      summary: "Kaj čaka: osnutki za izdajo, izdane posodobitve brez izvedbe, vozila brez konfiguracije ob koncu linije in zadnja aktivnost.",
      route: "/sums",
      steps: [
        "Sezname uporabljaj kot seznam opravil — klik odpre zapis.",
        "**Software Update v osnutku** čaka na dokončanje in izdajo (administrator ali QC manager).",
        "**Izdane posodobitve, še neizvedene** imajo ciljna vozila brez zapisanega rezultata.",
        "**Vozila brez konfiguracije ob koncu linije** potrebujejo začetno konfiguracijo, da se posodobitve lahko preverijo proti njej.",
      ],
    },
    {
      id: "ecus",
      title: "Tipi vozil in register ECU",
      summary: "Enolična identifikacija komponent homologiranih sistemov.",
      route: "/ecus",
      ref: "§7.1.1.2",
      steps: [
        "Administrator ali QC manager ustvari tip vozila z **Nov tip vozila** (ime in oznaka modela).",
        "Izberi tip vozila in klikni **Nov ECU**.",
        "Vpiši ime ECU, eVersum številko dela, sistem, dobavitelja in uredbo UN-ECE, za katero je ECU pomemben.",
        "S svinčnikom popraviš vnos. Vsaka sprememba gre v revizijsko sled.",
      ],
      tips: ["Ime ECU je enolično znotraj tipa vozila; številko dela uporablja uvoz CSV za prepoznavanje vrstic."],
    },
    {
      id: "rxswins",
      title: "Register RXSWIN",
      summary: "Vsak RXSWIN je zapis z oštevilčenimi baseline-i, ki naštejejo vso pripadajočo programsko opremo.",
      route: "/rxswins",
      ref: "§7.1.2.3",
      steps: [
        "Klikni **Nov RXSWIN**, izberi tip vozila in vpiši oznako (npr. R48SWIN001), opis in prizadete uredbe.",
        "Odpri RXSWIN in klikni **Odpri nov baseline**, da opišeš programsko opremo (glej »Baseline programske opreme«).",
        "**Register PDF** izvozi celoten register z vsemi baseline-i — tudi nadomeščenimi — za tehnično službo.",
      ],
      tips: ["Oznaka RXSWIN sme vsebovati velike črke, številke in - _ . ; konvencijo številčenja določi eVersum."],
    },
    {
      id: "baseline",
      title: "Baseline programske opreme",
      summary: "Baseline je izdano stanje vse programske opreme enega RXSWIN-a. Po izdaji je samo za branje.",
      route: "/rxswins",
      ref: "§7.1.2.3, §7.1.3.1",
      steps: [
        "V RXSWIN-u klikni **Odpri nov baseline** in vpiši razlog spremembe. Osnutek se začne kot kopija veljavnega izdanega.",
        "Klikni **Dodaj programsko opremo ECU** (ali svinčnik pri obstoječi vrstici) in vpiši verzijo SW, ime datoteke, združljivo strojno opremo, mapo Egnyte in dnevnik sprememb.",
        "Ob polju SHA-256 klikni **Izračunaj iz datoteke** in izberi datoteko programske opreme. Vsota se izračuna v brskalniku — datoteka se ne naloži.",
        "Ponovi za konfiguracijsko datoteko, če jo ECU ima.",
        "Osnutek naj pregleda sodelavec, nato administrator ali QC manager klikne **Izdaj baseline**. Prejšnji baseline postane nadomeščen.",
        "Pri vsakem spremenjenem ECU klikni **Readme PDF** in readme shrani v mapo programske opreme ECU na Egnyte.",
      ],
      tips: [
        "Izdaja je mogoča le, ko ima vsaka datoteka veljavno SHA-256.",
        "Več ECU-jev naenkrat: **Uvozi CSV** v osnutku baseline-a.",
        "Izdanega baseline-a ni mogoče urejati — odpri nov baseline.",
      ],
    },
    {
      id: "software-updates",
      title: "Dokument Software Update",
      summary: "Dokumentacija ene posodobitve programske opreme za tip vozila, z vsemi točkami iz §7.1.2.5.",
      route: "/software-updates",
      ref: "§7.1.1.5–11, §7.1.2.4, §7.1.2.5",
      steps: [
        "Klikni **Nov Software Update**, izberi tip vozila ter vpiši naslov in namen.",
        "Razdelek 1: navedi odvisnosti in baseline sistemskih shem; označi, ali je potrebna nova strojna oprema.",
        "Razdelek 2: **Dodaj RXSWIN** in izberi nov baseline. Baseline »pred« orodje zapiše samo.",
        "Razdelek 4: odloči, ali je potrebna posodobitev homologacije, in to utemelji; naštej prizadete zahteve UN-ECE.",
        "Razdelek 5: pogoji izvedbe, varno stanje, dejanja uporabnika in potrditev varnosti.",
        "Razdelek 7: **Dodaj vozila**. Pri vsakem vozilu preveri stolpec »Zadnja znana konfig.«, nato **Potrdi** združljivost.",
        "**Shrani spremembe**, nato administrator ali QC manager zapiše preverjanje s **Podpiši V&V**.",
        "Rumeno polje našteje, kaj še manjka. Ko postane zeleno, klikni **Izdaj**.",
        "**PDF poročilo** izvozi celoten zapis.",
      ],
      tips: [
        "Sprememba vsebine po podpisu V&V ga razveljavi — podpiši po zadnji spremembi.",
        "Izdan dokument spremeniš le z **Nova revizija**; V&V in združljivost se potrdita znova.",
        "»Se NE ujema z baseline-om pred« pomeni, da ima vozilo drugo programsko opremo, kot jo posodobitev pričakuje.",
      ],
    },
    {
      id: "execution",
      title: "Izvedba posodobitve v delavnici",
      summary: "Pred nalaganjem preveri datoteko in za vsako vozilo zapiši rezultat.",
      route: "/software-updates",
      ref: "§7.1.3.1, §7.1.2.2",
      steps: [
        "Zagotovi pogoje izvedbe in varno stanje iz izdanega dokumenta Software Update.",
        "Datoteko programske opreme vzemi samo iz repozitorija Egnyte.",
        "Odpri RXSWIN, poišči ECU v izdanem baseline-u in klikni **Preveri datoteko**. Izberi datoteko, ki jo boš naložil.",
        "Nalagaj samo ob zelenem UJEMA SE. NE UJEMA SE pomeni, da datoteke ne smeš uporabiti. Vsako preverjanje gre v revizijsko sled s tvojim imenom.",
        "Po nalaganju odpri dokument Software Update in pri VIN-u zapiši rezultat: **Uspešno**, **Neuspešno** ali **Povrnjeno**.",
        "Uspešna izvedba samodejno zapiše novo zadnjo znano konfiguracijo vozila.",
      ],
      tips: ["Zapisanega rezultata ni mogoče spremeniti."],
    },
    {
      id: "fleet",
      title: "Vozila (register VIN)",
      summary: "Vsa vozila po tipu vozila — ciljna vozila posodobitev.",
      route: "/fleet",
      ref: "§7.1.1.6, §7.1.2.4",
      steps: [
        "Izberi tip vozila in klikni **Novo vozilo** (VIN, ime, letnik) — ali **Uvozi CSV** za več vozil.",
        "Klik na vozilo odpre njegovo konfiguracijo.",
        "**Konfiguracije CSV** izvozi zadnjo znano konfiguracijo vseh vozil.",
      ],
    },
    {
      id: "vehicle",
      title: "Konfiguracija vozila",
      summary: "Vgrajeni ECU-ji in zgodovina konfiguracij enega VIN-a. Vsak zapis je nespremenljiv.",
      route: "/fleet",
      ref: "§7.1.2.2, §7.1.1.7",
      steps: [
        "Ko vozilo zapusti proizvodnjo, klikni **Zapiši konfiguracijo ob koncu linije** in izberi nameščen baseline vsakega RXSWIN-a. To se naredi enkrat na vozilo.",
        "Vpiši serijsko številko, HW verzijo in batch vsakega vgrajenega ECU in klikni **Shrani ECU-je**.",
        "Po uspešni posodobitvi se nova zadnja znana konfiguracija pojavi sama; zgodovina ohrani vse prejšnje.",
      ],
      tips: ["Sprememba podatkov strojne opreme ECU po koncu linije ustvari novo zadnjo znano konfiguracijo."],
    },
    {
      id: "import",
      title: "Uvoz iz CSV",
      summary: "Selitev obstoječih podatkov iz ERP ali Helixa.",
      steps: [
        "Klikni **Uvozi CSV** (stran Vozila ali v osnutku baseline-a) in **Prenesi predlogo**.",
        "Izpolni predlogo v Excelu in jo shrani kot CSV (ločilo vejica ali podpičje).",
        "Izberi datoteko. Predogled našteje, kaj bo ustvarjeno, kaj preskočeno in napake po vrsticah.",
        "Popravi napake in datoteko izberi znova. Uvoz je mogoč le, ko so vse vrstice veljavne.",
      ],
      tips: ["Uvozi se z vsebino vred zapišejo v revizijsko sled."],
    },
    {
      id: "sha256",
      title: "Orodje SHA-256",
      summary: "Izračunaj kontrolno vsoto katerekoli datoteke in jo primerjaj z referenco.",
      route: "/sha256",
      steps: [
        "Spusti datoteko na orodje ali klikni za izbiro. Datoteka ostane na tvojem računalniku.",
        "Za primerjavo prilepi referenčno vsoto (npr. iz readme).",
      ],
      tips: ["Za zapis preverjanja proti registru pred nalaganjem uporabi **Preveri datoteko** pri postavki baseline-a."],
    },
    {
      id: "audit",
      title: "Revizijska sled",
      summary: "Vsaka sprememba v SUMS z uporabnikom, časom ter stanjem pred in po.",
      route: "/audit",
      ref: "§7.1.1.1, §7.1.1.12",
      steps: [
        "Filtriraj po dejanju, vrsti zapisa ali datumu.",
        "Klik na vnos pokaže stanje pred in po spremembi.",
        "**Izvozi CSV** izvozi filtrirane vnose za tehnično službo.",
      ],
      tips: ["Revizijske sledi ni mogoče urejati ali brisati — to zagotavlja baza."],
    },
    {
      id: "users",
      title: "Uporabniki in gesla",
      summary: "Osebni računi z vlogami; vsak vnos v SUMS je mogoče pripisati osebi.",
      route: "/settings",
      steps: [
        "Svoje geslo zamenjaš pod **Zamenjaj geslo** (vsaj 12 znakov).",
        "Administrator ustvari uporabnika z **Nov uporabnik** (**Ustvari** predlaga naključno geslo) in geslo posreduje varno.",
        "**Ponastavi geslo** nastavi novo naključno geslo, ki se prikaže enkrat; uporabnik naj ga po prijavi zamenja.",
        "Uporabnike, ki odidejo, deaktiviraj — ne izbrišejo se, zato njihovi vnosi ostanejo pripisani.",
      ],
      tips: [
        "Vloge: administrator (vse), QC manager (izdaja, podpis V&V), tehnik (osnutki, preverjanje, rezultati), partner (samo branje).",
      ],
    },
  ],
};

export function helpContent(locale: string): HelpContent {
  return locale === "sl" ? sl : en;
}

// Pomoč za trenutno stran
export function topicForPath(pathname: string): string {
  if (pathname.startsWith("/rxswins/")) return "baseline";
  if (pathname.startsWith("/software-updates/")) return "software-updates";
  if (pathname.startsWith("/fleet/")) return "vehicle";
  const map: Record<string, string> = {
    "/sums": "overview", "/rxswins": "rxswins", "/software-updates": "software-updates", "/ecus": "ecus",
    "/fleet": "fleet", "/sha256": "sha256", "/audit": "audit", "/settings": "users",
  };
  return map[pathname] ?? "overview";
}
