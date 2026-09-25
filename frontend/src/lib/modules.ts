// Kateri moduli so vidni v meniju. Skriti moduli ostanejo v kodi in so dosegljivi
// po URL-ju — ob razširitvi jih samo dodaš v NEXT_PUBLIC_MODULES.
//
// Privzeto: samo R156 SUMS (MVP za homologacijo) + revizijska sled.
// Vsi moduli: "r156,audit,overview,vehicles,swUpdates,dtc,obd,alarms,reports"

export type ModuleKey =
  | "r156"
  | "audit"
  | "overview"
  | "vehicles"
  | "swUpdates"
  | "dtc"
  | "obd"
  | "alarms"
  | "reports";

const DEFAULT_MODULES: ModuleKey[] = ["r156", "audit"];

const enabled = new Set<string>(
  (process.env.NEXT_PUBLIC_MODULES ?? DEFAULT_MODULES.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
);

export function moduleEnabled(key: ModuleKey): boolean {
  return enabled.has(key);
}

// Začetna stran po prijavi
export const HOME_PATH = moduleEnabled("overview") ? "/" : "/sums";
