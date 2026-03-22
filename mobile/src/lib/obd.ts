import { BleManager, Device, BleError, State } from "react-native-ble-plx";

// ELM327 BLE adapters — najpogostejše kombinacije service/characteristic UUID
const KNOWN_ELM327_CONFIGS = [
  { serviceUUID: "FFE0", charUUID: "FFE1" }, // Najpogostejši poceni adapterji
  { serviceUUID: "FFF0", charUUID: "FFF1" }, // Nekateri kitajski adapterji
  { serviceUUID: "18F0", charUUID: "18F1" }, // Manj pogosti
] as const;

export interface OBDLiveData {
  rpm?: number;
  speed?: number;
  coolant_temp?: number;
  fuel_level?: number;
  battery_voltage?: number;
  ambient_temp?: number;
  mil_on?: boolean;
}

export interface ELM327Device {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface OBDScanResult {
  live_data: OBDLiveData;
  dtcs_raw: string[];
  vin_from_obd: string | null;
}

// Encode string to base64 (ASCII)
function b64encode(str: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    result +=
      chars[a >> 2] +
      chars[((a & 3) << 4) | (b >> 4)] +
      (i - 1 < str.length || b ? chars[((b & 15) << 2) | (c >> 6)] : "=") +
      (i - 2 < str.length || c ? chars[c & 63] : "=");
  }
  return result;
}

// Decode base64 to string
function b64decode(b64: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup: Record<string, number> = {};
  for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;

  let result = "";
  let i = 0;
  const input = b64.replace(/[^A-Za-z0-9+/]/g, "");
  while (i < input.length) {
    const a = lookup[input[i++]] ?? 0;
    const b = lookup[input[i++]] ?? 0;
    const c = lookup[input[i++]] ?? 0;
    const d = lookup[input[i++]] ?? 0;
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== undefined && input[i - 2] !== "=")
      result += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== undefined && input[i - 1] !== "=")
      result += String.fromCharCode(((c & 3) << 6) | d);
  }
  return result;
}

// Razčleni OBD odgovor za posamezen PID
function parseOBDValue(pid: string, rawResponse: string): number | null {
  const cleaned = rawResponse
    .replace(/[\r\n>]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (
    cleaned.includes("NODATA") ||
    cleaned.includes("ERROR") ||
    cleaned === "?" ||
    cleaned.includes("UNABLE")
  ) {
    return null;
  }

  // Pričakovani prefix odgovora: mode+1 hex + PID bajti
  // npr. "010C" → odgovor se začne z "410C"
  const mode = parseInt(pid.substring(0, 2), 16);
  const pidHex = pid.substring(2).toUpperCase();
  const expectedPrefix = `4${(mode - 1).toString(16).toUpperCase()}${pidHex}`;

  const idx = cleaned.indexOf(expectedPrefix);
  if (idx === -1) return null;

  const dataHex = cleaned.substring(idx + expectedPrefix.length);
  if (dataHex.length < 2) return null;

  const A = parseInt(dataHex.substring(0, 2), 16);
  const B = dataHex.length >= 4 ? parseInt(dataHex.substring(2, 4), 16) : 0;

  switch (pidHex) {
    case "0C":
      return Math.round((A * 256 + B) / 4); // RPM
    case "0D":
      return A; // Hitrost km/h
    case "05":
      return A - 40; // Temp hladilne tekočine °C
    case "2F":
      return Math.round((A * 100) / 255); // Raven goriva %
    case "46":
      return A - 40; // Zunanja temperatura °C
    case "42":
      return Math.round(((A * 256 + B) / 1000) * 100) / 100; // Napetost modula V
    default:
      return A;
  }
}

// Razčleni DTC kode iz odgovora mode 03
function parseDTCResponse(rawResponse: string): string[] {
  const cleaned = rawResponse
    .replace(/[\r\n>]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (cleaned.includes("NODATA")) return [];

  const idx = cleaned.indexOf("43");
  if (idx === -1) return [];

  const data = cleaned.substring(idx + 2);
  if (data.length < 2) return [];

  const count = parseInt(data.substring(0, 2), 16);
  if (isNaN(count) || count === 0) return [];

  const dtcs: string[] = [];
  const prefixMap: Record<number, string> = {
    0: "P0",
    1: "P1",
    2: "P2",
    3: "P3",
    4: "C0",
    5: "C1",
    6: "C2",
    7: "C3",
    8: "B0",
    9: "B1",
    10: "B2",
    11: "B3",
    12: "U0",
    13: "U1",
    14: "U2",
    15: "U3",
  };

  for (let i = 0; i < count && i < 6; i++) {
    const offset = 2 + i * 4;
    if (offset + 4 > data.length) break;

    const firstByte = parseInt(data.substring(offset, offset + 2), 16);
    const secondByte = parseInt(data.substring(offset + 2, offset + 4), 16);
    if (isNaN(firstByte) || isNaN(secondByte)) continue;

    const prefix = prefixMap[firstByte >> 4] ?? "P0";
    const rest = (((firstByte & 0x0f) << 8) | secondByte)
      .toString(16)
      .padStart(3, "0")
      .toUpperCase();
    const code = `${prefix}${rest}`;
    if (code !== "P0000") dtcs.push(code);
  }

  return dtcs;
}

// Razčleni VIN iz mode 09 PID 02 odgovora
function parseVINResponse(rawResponse: string): string | null {
  const cleaned = rawResponse
    .replace(/[\r\n>]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  const idx = cleaned.indexOf("4902");
  if (idx === -1) return null;

  const hexData = cleaned.substring(idx + 4);
  let vin = "";
  for (let i = 0; i + 1 < hexData.length; i += 2) {
    const charCode = parseInt(hexData.substring(i, i + 2), 16);
    if (charCode >= 32 && charCode < 127) vin += String.fromCharCode(charCode);
  }
  return vin.length >= 17 ? vin.substring(0, 17) : null;
}

// Singleton BleManager
let _bleManager: BleManager | null = null;
function getBleManager(): BleManager {
  if (!_bleManager) _bleManager = new BleManager();
  return _bleManager;
}

export class ELM327Manager {
  private device: Device | null = null;
  private serviceUUID: string | null = null;
  private charUUID: string | null = null;
  private pendingResolve: ((value: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private responseBuffer = "";
  private subscription: ReturnType<Device["monitorCharacteristicForService"]> | null = null;

  // Preveri ali je BLE vklopljen
  async checkBleState(): Promise<boolean> {
    return new Promise((resolve) => {
      getBleManager().onStateChange((state) => {
        resolve(state === State.PoweredOn);
      }, true);
    });
  }

  // Zahteva dovoljenja za BLE (Android 12+)
  // Dovoljenja so zahtevana v UI sloju prek expo-permissions
  async requestPermissions(): Promise<boolean> {
    return true;
  }

  // Začni BLE skeniranje — vrne naprave ki izgledajo kot ELM327
  startScan(
    onDevice: (device: ELM327Device) => void,
    onError: (msg: string) => void
  ): void {
    getBleManager().startDeviceScan(
      null,
      { allowDuplicates: false },
      (error: BleError | null, device: Device | null) => {
        if (error) {
          onError(error.message);
          return;
        }
        if (!device?.name) return;

        const name = device.name.toUpperCase();
        const isElm =
          name.includes("ELM") ||
          name.includes("OBD") ||
          name.includes("V-LINK") ||
          name.includes("VLINK") ||
          name.includes("OBDII") ||
          name.includes("CARISTA") ||
          name.includes("VEEPEAK") ||
          name.includes("KONNWEI");

        if (isElm) {
          onDevice({ id: device.id, name: device.name, rssi: device.rssi });
        }
      }
    );
  }

  stopScan(): void {
    getBleManager().stopDeviceScan();
  }

  // Poveži se z ELM327 napravo
  async connect(deviceId: string): Promise<void> {
    const device = await getBleManager().connectToDevice(deviceId, {
      timeout: 12000,
    });
    await device.discoverAllServicesAndCharacteristics();

    // Poišči ustrezen service/characteristic
    const services = await device.services();
    outer: for (const config of KNOWN_ELM327_CONFIGS) {
      for (const svc of services) {
        if (svc.uuid.toUpperCase().replace(/-/g, "").includes(config.serviceUUID)) {
          const chars = await svc.characteristics();
          for (const ch of chars) {
            if (ch.uuid.toUpperCase().replace(/-/g, "").includes(config.charUUID)) {
              this.serviceUUID = svc.uuid;
              this.charUUID = ch.uuid;
              break outer;
            }
          }
        }
      }
    }

    if (!this.serviceUUID || !this.charUUID) {
      await device.cancelConnection().catch(() => {});
      throw new Error(
        "ELM327 servisi niso najdeni. Preverite ali je naprava pravi ELM327 adapter."
      );
    }

    this.device = device;

    // Nastavi poslušalca za notifikacije
    this.subscription = device.monitorCharacteristicForService(
      this.serviceUUID,
      this.charUUID,
      (error, char) => {
        if (error || !char?.value) return;
        const chunk = b64decode(char.value);
        this.responseBuffer += chunk;
        // ELM327 odgovor se konča z '>'
        if (this.responseBuffer.includes(">")) {
          const response = this.responseBuffer;
          this.responseBuffer = "";
          const resolve = this.pendingResolve;
          this.pendingResolve = null;
          this.pendingReject = null;
          resolve?.(response);
        }
      }
    );
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  // Pošlji AT/OBD ukaz in čakaj na odgovor
  private async sendCommand(command: string, timeoutMs = 5000): Promise<string> {
    if (!this.device || !this.serviceUUID || !this.charUUID) {
      throw new Error("Naprava ni povezana");
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(new Error(`Timeout pri ukazu: ${command}`));
      }, timeoutMs);

      this.pendingResolve = (val) => {
        clearTimeout(timer);
        resolve(val);
      };
      this.pendingReject = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      const encoded = b64encode(command + "\r");
      this.device!.writeCharacteristicWithoutResponseForService(
        this.serviceUUID!,
        this.charUUID!,
        encoded
      ).catch((err: Error) => {
        clearTimeout(timer);
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(err);
      });
    });
  }

  // Inicializacija ELM327 — pošlje AT ukaze
  async initialize(onStep?: (step: string) => void): Promise<void> {
    onStep?.("Resetiranje adapterja…");
    await this.sendCommand("ATZ", 4000);
    await new Promise((r) => setTimeout(r, 1200));

    onStep?.("Konfiguracija komunikacije…");
    await this.sendCommand("ATE0"); // Echo off
    await this.sendCommand("ATL0"); // Linefeeds off
    await this.sendCommand("ATS0"); // Spaces off
    await this.sendCommand("ATH0"); // Headers off
    await this.sendCommand("ATSP0"); // Auto protocol
    await this.sendCommand("ATAT1"); // Adaptive timing
  }

  // Beri živahne podatke (PIDs)
  async readLiveData(onStep?: (step: string) => void): Promise<OBDLiveData> {
    const data: OBDLiveData = {};

    const queries: Array<{ pid: string; label: string; key: keyof OBDLiveData }> = [
      { pid: "010C", label: "Vrtljaji motorja…", key: "rpm" },
      { pid: "010D", label: "Hitrost vozila…", key: "speed" },
      { pid: "0105", label: "Temperatura hladilne tekočine…", key: "coolant_temp" },
      { pid: "012F", label: "Raven goriva…", key: "fuel_level" },
      { pid: "0142", label: "Napetost akumulatorja…", key: "battery_voltage" },
      { pid: "0146", label: "Zunanja temperatura…", key: "ambient_temp" },
    ];

    for (const q of queries) {
      try {
        onStep?.(q.label);
        const raw = await this.sendCommand(q.pid);
        const val = parseOBDValue(q.pid, raw);
        if (val !== null) (data as any)[q.key] = val;
      } catch {
        // PID ni podprt — preskoči
      }
    }

    // MIL (Malfunction Indicator Lamp) — mode 01 PID 01 bit 7 bajt A
    try {
      onStep?.("Status MIL lučke…");
      const raw = await this.sendCommand("0101");
      const cleaned = raw
        .replace(/[\r\n>]/g, "")
        .replace(/\s+/g, "")
        .toUpperCase();
      const idx = cleaned.indexOf("4101");
      if (idx !== -1) {
        const a = parseInt(cleaned.substring(idx + 4, idx + 6), 16);
        data.mil_on = (a & 0x80) !== 0;
      }
    } catch {
      data.mil_on = false;
    }

    return data;
  }

  // Beri DTC kode (mode 03)
  async readDTCs(onStep?: (step: string) => void): Promise<string[]> {
    try {
      onStep?.("Branje DTC napak…");
      const raw = await this.sendCommand("03", 8000);
      return parseDTCResponse(raw);
    } catch {
      return [];
    }
  }

  // Beri VIN iz vozila (mode 09 PID 02)
  async readVIN(onStep?: (step: string) => void): Promise<string | null> {
    try {
      onStep?.("Branje VIN številke…");
      const raw = await this.sendCommand("0902", 8000);
      return parseVINResponse(raw);
    } catch {
      return null;
    }
  }

  // Celoten OBD sken
  async fullScan(onStep?: (step: string) => void): Promise<OBDScanResult> {
    await this.initialize(onStep);
    const live_data = await this.readLiveData(onStep);
    const dtcs_raw = await this.readDTCs(onStep);
    const vin_from_obd = await this.readVIN(onStep);

    return { live_data, dtcs_raw, vin_from_obd };
  }

  // Prekini povezavo
  async disconnect(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.responseBuffer = "";

    if (this.device) {
      await this.device.cancelConnection().catch(() => {});
      this.device = null;
    }
    this.serviceUUID = null;
    this.charUUID = null;
  }
}

// Singleton instanca za celo app
let _elm327: ELM327Manager | null = null;
export function getELM327Manager(): ELM327Manager {
  if (!_elm327) _elm327 = new ELM327Manager();
  return _elm327;
}
