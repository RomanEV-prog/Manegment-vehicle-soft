# Stanje projekta SUMS

Zadnja posodobitev: 25. 9. 2026. Posodobi ob vsakem večjem koraku (kaj je narejeno,
kaj čaka, na koga). Pravila in pasti za delo so v `../CLAUDE.md`.

## Naročnik in rok

- **eVersum**, Jakub Zdun (Head of Systems and Security) — komunikacija samo po mejlu, v angleščini.
- Zahteva: zamenjati SUMS v Helix ALM z enostavnim orodjem, vse UN R156 razen OTA,
  brez diagnostike; priročnik za TÜV SÜD; delujoče orodje ~sredina oktobra 2026.
- Predogled za Jakuba: https://162-55-183-14.sslip.io (Hetzner `eversum-sums`).

## Narejeno

| Področje | Kaj | R156 |
|---|---|---|
| Register ECU in tipi vozil | vnos, urejanje, revizijska sled | §7.1.1.2 |
| Register RXSWIN | baseline-i draft → released → superseded, zaklep v bazi, SHA-256 v brskalniku, preverjanje datoteke pred flashem, readme PDF (oblika Helix) | §7.1.2.3, §7.1.3.1 |
| Software Update dokument | vsa polja §7.1.2.5, revizije, V&V podpis (razveljavi se ob spremembi), pogoji za izdajo, PDF poročilo | §7.1.1.5–11, §7.1.2.5 |
| Ciljna vozila | po VIN, potrditev združljivosti, primerjava z zadnjo znano konfiguracijo, zapis izvedbe | §7.1.1.6–7, §7.1.2.4 |
| Konfiguracija vozila | EOL, Last Known Configuration (samodejno ob izvedbi in zamenjavi ECU), vgrajeni ECU-ji | §7.1.2.2 |
| ERP | `GET /api/v1/integration/vehicles/{vin}/last-known-configuration` (X-API-Key) | §7.1.1.6 |
| Izvozi za organ | register RXSWIN (PDF), revizijska sled (CSV), konfiguracije (CSV) | §7.1.1.12 |
| Uvoz za selitev | CSV: vozila, postavke baseline-a (predogled, vse-ali-nič) | — |
| Uporaba | pregled, čarovnik »Prvi koraki«, pomoč na vsaki strani, stran Pomoč (EN/SL) | — |
| Varnost | httpOnly seja, preklic dostopa takoj, omejena DB vloga, audit append-only, Next 15.5, CSV/XSS zaščite, dnevne kopije | §7.1.1.1, §7.1.3.2 |
| Priročnik | `docs/handbook/` v0.2 (poslan Jakubu 25. 9.) | §7.1.2.1 |

## Čaka na Jakuba (priročnik, poglavje 7)

1. Ali je RXSWIN berljiv z vozila prek OBD? Če ne → prijava verzij organu (§7.2.1.2.2) — **dodaten modul**.
2. Konvencija številčenja RXSWIN; en RXSWIN na uredbo ali na sistem; kam sodi VCU (zdaj začasno VCUSWIN001).
3. Izvoz obstoječih baseline-ov iz Helixa ali datum preklopa (kontrolne vsote v diagramu so okrajšane).
4. Kje je »System Schemes Baseline« in kakšen je njegov ID.
5. Kateri parametri vozila/sistema, pomembni za homologacijo, gredo v konfiguracijo (§7.1.2.2).
6. ID, s katerim ERP (Nejc) povezuje; ERP ključ je pripravljen na strežniku.
7. Struktura map in imena readme na Egnyte.
8. Uporabniki in vloge; lokalni računi ali AD/SSO.
9. Produkcijski strežnik, ISO 27001, politika kopij (off-site, hramba, test obnove).
10. Oštevilčenje poglavij po obstoječem SUMS priročniku / Dokumentenmanagement-Prozess; lastnik in odobritelj dokumenta.
11. Tipi vozil v prvi homologaciji; datum presoje TÜV.
12. Ali orodje pošlje obvestilo uporabniku po e-pošti ali ga le zapiše.
13. (Iz diagrama) Ali se ob posodobitvi programske opreme dvigne eVersum številka dela?

## Naslednji koraki

1. Jakubove odgovore vgradi v orodje in priročnik (v0.3 — različica v imenu datoteke).
2. Selitev na eVersum lokalni strežnik: `deploy/deploy-server.sh` (Ubuntu, Docker), nova
   `.env.server`, uvoz vozil in baseline-ov (CSV), kopija baze drugam.
3. Pred produkcijo počisti predogledne podatke (Jakubovi referenčni R48SWIN001/VCUSWIN001
   imajo okrajšane kontrolne vsote iz diagrama).
