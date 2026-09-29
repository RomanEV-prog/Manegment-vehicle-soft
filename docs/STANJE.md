# Stanje projekta SUMS

Zadnja posodobitev: 29. 9. 2026. Posodobi ob vsakem večjem koraku (kaj je narejeno,
kaj čaka, na koga). Pravila in pasti za delo so v `../CLAUDE.md`.

## Naročnik in rok

- **eVersum**, Jakub Zdun (Head of Systems and Security) — komunikacija samo po mejlu, v angleščini.
- Zahteva: zamenjati SUMS v Helix ALM z enostavnim orodjem, vse UN R156 razen OTA,
  brez diagnostike; priročnik za TÜV SÜD; delujoče orodje ~sredina oktobra 2026.
- Predogled za Jakuba: https://162-55-183-14.sslip.io (Hetzner `eversum-sums`).

## Narejeno

| Področje | Kaj | R156 |
|---|---|---|
| Register ECU in tipi vozil | vnos, urejanje, revizijska sled; tipa IAV VHH 6.9m (prvi za homologacijo) in e-Shuttle MK II-400 | §7.1.1.2 |
| Register RXSWIN | stroga oznaka `R<uredba>SWIN<NNN>` (uredba se doda sama), mesto hrambe na vozilu (ECU + DID), baseline-i draft → released → superseded, zaklep v bazi, SHA-256 v brskalniku, preverjanje datoteke pred flashem, readme PDF `<ECU> <verzija> Readme` | §7.1.1.3, §7.1.2.3, §7.1.3.1 |
| Software Update dokument | vsa polja §7.1.2.5, revizije, V&V podpis (razveljavi se ob spremembi), pogoji za izdajo, PDF poročilo, system schemes baseline (Egnyte, `eShuttle X - System Schemes - v.1.9`) | §7.1.1.5–11, §7.1.2.5 |
| Ciljna vozila | po VIN, potrditev združljivosti, primerjava z zadnjo znano konfiguracijo, zapis izvedbe **z read-back RXSWIN** (ujema/ne ujema + opomba) | §7.1.1.4, §7.1.1.6–7, §7.1.2.4 |
| Konfiguracija vozila | EOL, Last Known Configuration (samodejno ob izvedbi in zamenjavi ECU), vgrajeni ECU-ji | §7.1.2.2 |
| ERP | `GET /api/v1/integration/vehicles/{vin}/last-known-configuration` (X-API-Key) | §7.1.1.6 |
| Izvozi za organ | register RXSWIN (PDF), revizijska sled (CSV), konfiguracije (CSV) | §7.1.1.12 |
| Uvoz | CSV: vozila, postavke baseline-a (predogled, vse-ali-nič) — iz Helixa ni selitve (start fresh) | — |
| Uporaba | pregled, čarovnik »Prvi koraki«, pomoč na vsaki strani, stran Pomoč (EN/SL); napisi vlog po Jakubu: Administrator / System engineer / Software engineer / Auditor | — |
| Varnost | httpOnly seja, preklic dostopa takoj, omejena DB vloga, audit append-only, Next 15.5, CSV/XSS zaščite, dnevne kopije | §7.1.1.1, §7.1.3.2 |
| Priročnik | `docs/handbook/` v0.3 (Jakubovi odgovori 28. 9. vgrajeni; v0.2 poslan 25. 9.) | §7.1.2.1 |

## Jakubovi odgovori (28. 9. 2026) — vgrajeno

RXSWIN je DID v BCU, berljiv z UDS 0x22 prek OBD (→ §7.2.1.2.2 ni potrebna, dodatnega modula ni);
konvencija `R{uredba}SWIN{NNN}`, en RXSWIN na uredbo, ECU lahko v več RXSWIN-ih; VCU → `R100SWIN001`
(preimenovano z audit zapisom); v Helixu ni pravih podatkov; system schemes na Egnyte; readme
`ECU_Name ECU_Software_Version Readme`; vloge admin / system eng. / software eng. / auditor;
obvestilo samo zapis; priročnika ni bilo, struktura po naše; IAV VHH 6.9m prvi za homologacijo.

## Še odprto (priročnik, poglavje 7)

1. **DID**, pod katerim je RXSWIN berljiv iz BCU (vnos v register RXSWIN).
2. Koda modela IAV VHH 6.9m; ECU-ji in RXSWIN-i tega tipa; datum presoje TÜV.
3. Kateri parametri vozila/sistema, pomembni za homologacijo, gredo v konfiguracijo (§7.1.2.2).
4. ID, s katerim ERP povezuje — **Nejc** (osnutek mejla poslan Romanu 29. 9.); ERP ključ je na strežniku.
5. Struktura map na Egnyte za readme (ime datoteke dogovorjeno).
6. Produkcijski strežnik, ISO 27001, politika kopij (off-site, hramba, test obnove); AD/SSO.
7. Lastnik in odobritelj priročnika.
8. (Iz diagrama) Ali se ob posodobitvi programske opreme dvigne eVersum številka dela?

## Naslednji koraki

1. Odgovor Jakubu z v0.3 in preostalimi vprašanji; mejl Nejcu (ERP).
2. Ko Jakub pove DID: vnesi v register (R48SWIN001, R100SWIN001).
3. Selitev na eVersum lokalni strežnik: `deploy/deploy-server.sh` (Ubuntu, Docker), nova
   `.env.server`, uvoz vozil (CSV), kopija baze drugam.
4. Pred produkcijo počisti predogledne podatke (referenčni R48SWIN001/R100SWIN001 imajo
   okrajšane kontrolne vsote iz diagrama; tip e-Shuttle MK II-400 je primer).
