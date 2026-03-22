import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { vehiclesApi, obdApi, Vehicle, OBDSession } from "@/lib/api";
import { getELM327Manager, ELM327Device, OBDLiveData } from "@/lib/obd";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingSpinner } from "@/components/LoadingSpinner";

// --- Stanja zaslona ---
type ScreenState =
  | "idle"
  | "scanning_ble"
  | "connecting"
  | "connected"
  | "scanning_obd"
  | "done"
  | "submitting"
  | "submitted";

// --- Tile za živi podatek ---
function LiveTile({
  icon,
  label,
  value,
  unit,
  highlight,
}: {
  icon: string;
  label: string;
  value?: number | boolean | null;
  unit?: string;
  highlight?: boolean;
}) {
  const isEmpty = value === undefined || value === null;
  const displayVal =
    typeof value === "boolean"
      ? value
        ? "ON"
        : "OFF"
      : isEmpty
        ? "—"
        : String(value);
  const tileColor = highlight && value === true ? "border-red-500" : "border-slate-700";
  const valColor =
    typeof value === "boolean" && value ? "text-red-400" : "text-white";

  return (
    <View
      className={`bg-slate-800 rounded-xl p-4 mb-3 border ${tileColor} flex-1 min-w-[44%] mx-1`}
    >
      <View className="flex-row items-center mb-2">
        <Ionicons name={icon as any} size={18} color="#94a3b8" />
        <Text className="text-slate-400 text-xs ml-2 flex-1">{label}</Text>
      </View>
      <Text className={`text-2xl font-bold ${valColor}`}>
        {displayVal}
        {!isEmpty && unit && (
          <Text className="text-sm font-normal text-slate-400"> {unit}</Text>
        )}
      </Text>
    </View>
  );
}

// --- DTC badge ---
function DtcBadge({ code }: { code: string }) {
  const isHigh =
    code.startsWith("C") ||
    code.startsWith("U0") ||
    (code.startsWith("P0") && parseInt(code.substring(2)) >= 100 &&
      parseInt(code.substring(2)) <= 899);
  return (
    <View
      className={`flex-row items-center rounded-lg px-3 py-2 mr-2 mb-2 ${isHigh ? "bg-red-900 border border-red-700" : "bg-yellow-900 border border-yellow-700"}`}
    >
      <Ionicons
        name="warning"
        size={14}
        color={isHigh ? "#f87171" : "#fbbf24"}
      />
      <Text
        className={`ml-1 font-mono text-sm font-semibold ${isHigh ? "text-red-300" : "text-yellow-300"}`}
      >
        {code}
      </Text>
    </View>
  );
}

// --- BLE naprava v seznamu ---
function BleDeviceItem({
  device,
  onSelect,
}: {
  device: ELM327Device;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onSelect}
      className="flex-row items-center bg-slate-800 rounded-xl px-4 py-3 mb-2 border border-slate-700"
      activeOpacity={0.7}
    >
      <View className="bg-blue-900 rounded-full p-2 mr-3">
        <Ionicons name="bluetooth" size={20} color="#60a5fa" />
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold">{device.name ?? "Neznana naprava"}</Text>
        <Text className="text-slate-500 text-xs mt-0.5">{device.id}</Text>
      </View>
      {device.rssi !== null && (
        <View className="items-end">
          <Text className="text-slate-400 text-xs">Signal</Text>
          <Text className="text-slate-300 text-sm">{device.rssi} dBm</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color="#475569" className="ml-2" />
    </TouchableOpacity>
  );
}

// --- Session vrstica ---
function SessionRow({ session }: { session: OBDSession }) {
  const [expanded, setExpanded] = useState(false);
  const dtcCount = session.dtcs_raw?.length ?? 0;

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      className="bg-slate-800 rounded-xl border border-slate-700 mb-2 overflow-hidden"
      activeOpacity={0.8}
    >
      <View className="flex-row items-center px-4 py-3">
        <Ionicons name="time-outline" size={16} color="#94a3b8" />
        <Text className="text-slate-300 text-sm ml-2 flex-1">
          {new Date(session.created_at).toLocaleString("sl-SI")}
        </Text>
        <View
          className={`rounded-full px-2 py-0.5 mr-2 ${dtcCount > 0 ? "bg-red-900" : "bg-green-900"}`}
        >
          <Text
            className={`text-xs font-semibold ${dtcCount > 0 ? "text-red-300" : "text-green-300"}`}
          >
            {dtcCount > 0 ? `${dtcCount} DTC` : "OK"}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color="#64748b"
        />
      </View>
      {expanded && (
        <View className="px-4 pb-3 border-t border-slate-700 pt-3">
          {session.vin_from_obd && (
            <Text className="text-slate-400 text-xs mb-2">
              VIN: <Text className="text-white font-mono">{session.vin_from_obd}</Text>
            </Text>
          )}
          {session.live_data && (
            <View className="flex-row flex-wrap mb-2">
              {session.live_data.rpm !== undefined && (
                <Text className="text-slate-400 text-xs mr-3">
                  RPM: <Text className="text-white">{session.live_data.rpm}</Text>
                </Text>
              )}
              {session.live_data.speed !== undefined && (
                <Text className="text-slate-400 text-xs mr-3">
                  Hitrost: <Text className="text-white">{session.live_data.speed} km/h</Text>
                </Text>
              )}
              {session.live_data.coolant_temp !== undefined && (
                <Text className="text-slate-400 text-xs mr-3">
                  Temp: <Text className="text-white">{session.live_data.coolant_temp}°C</Text>
                </Text>
              )}
              {session.live_data.battery_voltage !== undefined && (
                <Text className="text-slate-400 text-xs mr-3">
                  Baterija: <Text className="text-white">{session.live_data.battery_voltage}V</Text>
                </Text>
              )}
            </View>
          )}
          {session.dtcs_raw?.length > 0 && (
            <View className="flex-row flex-wrap">
              {session.dtcs_raw.map((code) => (
                <DtcBadge key={code} code={code} />
              ))}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ===================== GLAVNI ZASLON =====================
export default function OBDScreen() {
  const qc = useQueryClient();
  const elm = getELM327Manager();

  const [state, setState] = useState<ScreenState>("idle");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [bleDevices, setBleDevices] = useState<ELM327Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<ELM327Device | null>(null);
  const [scanStep, setScanStep] = useState("");
  const [liveData, setLiveData] = useState<OBDLiveData | null>(null);
  const [dtcs, setDtcs] = useState<string[]>([]);
  const [vinFromObd, setVinFromObd] = useState<string | null>(null);
  const scannedRef = useRef(false);

  // Poberi seznam vozil
  const { data: vehicles, isLoading: vehiclesLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list().then((r) => r.data),
  });

  // Poberi pretekle seje za izbrano vozilo
  const {
    data: sessions,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ["obd_sessions", selectedVehicle?.id],
    queryFn: () =>
      obdApi.sessions(selectedVehicle!.id).then((r) => r.data),
    enabled: !!selectedVehicle,
  });

  // Pošlji OBD sken v backend
  const submitMutation = useMutation({
    mutationFn: () =>
      obdApi.scan(selectedVehicle!.id, {
        adapter_type: "elm327_ble",
        live_data: liveData ?? {},
        dtcs_raw: dtcs,
        vin_from_obd: vinFromObd,
      }),
    onSuccess: () => {
      setState("submitted");
      refetchSessions();
      qc.invalidateQueries({ queryKey: ["dtc"] });
      Toast.show({ type: "success", text1: "OBD sken shranjen v backend ✓" });
    },
    onError: () => {
      setState("done");
      Toast.show({ type: "error", text1: "Napaka pri pošiljanju v backend" });
    },
  });

  // Cleanup ob unmount
  useEffect(() => {
    return () => {
      elm.stopScan();
      elm.disconnect();
    };
  }, []);

  // Začni BLE skeniranje
  const startBleScan = useCallback(async () => {
    setBleDevices([]);
    scannedRef.current = false;
    setState("scanning_ble");

    const hasBle = await elm.checkBleState();
    if (!hasBle) {
      Alert.alert(
        "Bluetooth ni vklopljen",
        "Prosim vklopite Bluetooth in poskusite znova."
      );
      setState("idle");
      return;
    }

    if (Platform.OS === "android") {
      const ok = await elm.requestPermissions();
      if (!ok) {
        Alert.alert(
          "Dovoljenje zavrnjeno",
          "Za OBD diagnostiko so potrebna Bluetooth in lokacijska dovoljenja."
        );
        setState("idle");
        return;
      }
    }

    elm.startScan(
      (device) => {
        setBleDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      },
      (err) => {
        Toast.show({ type: "error", text1: `BLE napaka: ${err}` });
        setState("idle");
      }
    );

    // Avtomatsko ustavi skeniranje po 15s
    setTimeout(() => {
      elm.stopScan();
      if (state === "scanning_ble") {
        // pusti zaslon kjer je - uporabnik vidi seznam
      }
    }, 15000);
  }, [state]);

  // Poveži z napravo
  const connectToDevice = useCallback(
    async (device: ELM327Device) => {
      elm.stopScan();
      setState("connecting");
      setScanStep(`Povezujem z ${device.name ?? device.id}…`);

      try {
        await elm.connect(device.id);
        setConnectedDevice(device);
        setState("connected");
        Toast.show({
          type: "success",
          text1: `Povezan: ${device.name ?? device.id}`,
        });
      } catch (err: any) {
        setState("scanning_ble");
        Toast.show({ type: "error", text1: err?.message ?? "Napaka pri povezavi" });
      }
    },
    []
  );

  // Zaženi OBD sken
  const runOBDScan = useCallback(async () => {
    if (!selectedVehicle) {
      Alert.alert("Izberi vozilo", "Pred skeniranjem izberi vozilo.");
      return;
    }

    setState("scanning_obd");
    setScanStep("Začenjam sken…");

    try {
      const result = await elm.fullScan((step) => setScanStep(step));
      setLiveData(result.live_data);
      setDtcs(result.dtcs_raw);
      setVinFromObd(result.vin_from_obd);
      setState("done");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Sken ni uspel",
        text2: err?.message,
      });
      setState("connected");
    }
  }, [selectedVehicle]);

  // Prekini in ponastavi
  const reset = useCallback(async () => {
    await elm.disconnect();
    setConnectedDevice(null);
    setBleDevices([]);
    setLiveData(null);
    setDtcs([]);
    setVinFromObd(null);
    setState("idle");
  }, []);

  // ---- RENDER ----

  const renderVehiclePicker = () => (
    <Modal
      visible={showVehiclePicker}
      animationType="slide"
      transparent
      onRequestClose={() => setShowVehiclePicker(false)}
    >
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-slate-900 rounded-t-3xl p-6 max-h-[70%]">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white text-lg font-bold">Izberi vozilo</Text>
            <TouchableOpacity onPress={() => setShowVehiclePicker(false)}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          {vehiclesLoading ? (
            <LoadingSpinner />
          ) : (
            <FlatList
              data={vehicles ?? []}
              keyExtractor={(v) => String(v.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedVehicle(item);
                    setShowVehiclePicker(false);
                  }}
                  className={`flex-row items-center p-4 rounded-xl mb-2 border ${
                    selectedVehicle?.id === item.id
                      ? "bg-blue-900 border-blue-600"
                      : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <Ionicons name="car-sport-outline" size={20} color="#94a3b8" />
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-semibold">
                      {item.name} ({item.year})
                    </Text>
                    <Text className="text-slate-400 text-xs">{item.vin}</Text>
                  </View>
                  {selectedVehicle?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text className="text-slate-500 text-center py-8">Ni vozil</Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <ScrollView className="flex-1 bg-slate-900" contentContainerStyle={{ padding: 16 }}>
      {/* VEHICLE SELECTOR */}
      <View className="bg-slate-800 rounded-2xl border border-slate-700 mb-4 p-4">
        <Text className="text-slate-400 text-xs mb-2">VOZILO</Text>
        <TouchableOpacity
          onPress={() => setShowVehiclePicker(true)}
          className="flex-row items-center"
        >
          {selectedVehicle ? (
            <View className="flex-1">
              <Text className="text-white font-bold text-base">
                {selectedVehicle.name} ({selectedVehicle.year})
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                {selectedVehicle.vin}
              </Text>
            </View>
          ) : (
            <Text className="text-slate-500 flex-1">Izberi vozilo…</Text>
          )}
          <Ionicons name="chevron-down" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* BLE STATUS */}
      {connectedDevice && (
        <View className="bg-green-900/40 border border-green-700 rounded-xl px-4 py-3 mb-4 flex-row items-center">
          <Ionicons name="bluetooth" size={18} color="#4ade80" />
          <Text className="text-green-300 ml-2 flex-1">
            Povezan: <Text className="font-semibold">{connectedDevice.name}</Text>
          </Text>
          <TouchableOpacity onPress={reset}>
            <Ionicons name="close-circle" size={20} color="#86efac" />
          </TouchableOpacity>
        </View>
      )}

      {/* ---- IDLE ---- */}
      {state === "idle" && (
        <TouchableOpacity
          onPress={startBleScan}
          className="bg-blue-600 rounded-2xl py-4 items-center flex-row justify-center mb-4"
          activeOpacity={0.8}
        >
          <Ionicons name="bluetooth-outline" size={22} color="white" />
          <Text className="text-white font-bold text-base ml-2">
            Poišči ELM327 adapter
          </Text>
        </TouchableOpacity>
      )}

      {/* ---- BLE SCANNING ---- */}
      {state === "scanning_ble" && (
        <View className="mb-4">
          <View className="flex-row items-center mb-4">
            <ActivityIndicator color="#3b82f6" />
            <Text className="text-slate-300 ml-3">Iščem BLE naprave…</Text>
            <TouchableOpacity
              onPress={() => { elm.stopScan(); setState("idle"); }}
              className="ml-auto"
            >
              <Text className="text-red-400 text-sm">Ustavi</Text>
            </TouchableOpacity>
          </View>

          {bleDevices.length === 0 ? (
            <View className="items-center py-8 bg-slate-800 rounded-xl border border-slate-700">
              <Ionicons name="bluetooth-outline" size={40} color="#475569" />
              <Text className="text-slate-500 mt-3 text-sm">
                Iščem ELM327 adapterje…
              </Text>
              <Text className="text-slate-600 mt-1 text-xs text-center px-4">
                Prepričajte se da je adapter vklopljen in v dosegu
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-slate-400 text-xs mb-2">
                Najdene naprave ({bleDevices.length})
              </Text>
              {bleDevices.map((d) => (
                <BleDeviceItem
                  key={d.id}
                  device={d}
                  onSelect={() => connectToDevice(d)}
                />
              ))}
            </>
          )}
        </View>
      )}

      {/* ---- CONNECTING ---- */}
      {state === "connecting" && (
        <View className="items-center py-10 mb-4">
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text className="text-slate-300 mt-4">{scanStep}</Text>
        </View>
      )}

      {/* ---- CONNECTED — čaka na sken ---- */}
      {state === "connected" && (
        <>
          {!selectedVehicle && (
            <View className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3 mb-4 flex-row items-center">
              <Ionicons name="information-circle" size={18} color="#fbbf24" />
              <Text className="text-yellow-300 text-sm ml-2">
                Izberi vozilo pred zagonom skena
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={runOBDScan}
            disabled={!selectedVehicle}
            className={`rounded-2xl py-4 items-center flex-row justify-center mb-4 ${
              selectedVehicle ? "bg-green-600" : "bg-slate-700"
            }`}
            activeOpacity={0.8}
          >
            <Ionicons name="scan-outline" size={22} color="white" />
            <Text className="text-white font-bold text-base ml-2">
              Zaženi OBD sken
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* ---- OBD SCANNING ---- */}
      {state === "scanning_obd" && (
        <View className="items-center py-10 mb-4 bg-slate-800 rounded-2xl border border-slate-700">
          <ActivityIndicator size="large" color="#22c55e" />
          <Text className="text-white font-semibold mt-4 text-base">
            OBD diagnostika…
          </Text>
          <Text className="text-slate-400 mt-2 text-sm text-center px-6">
            {scanStep}
          </Text>
          <Text className="text-slate-600 mt-4 text-xs">Ne premikajte telefona</Text>
        </View>
      )}

      {/* ---- DONE / SUBMITTED — rezultati ---- */}
      {(state === "done" || state === "submitting" || state === "submitted") && (
        <>
          <Text className="text-white font-bold text-base mb-3">
            Rezultati skena
          </Text>

          {/* Live data tiles */}
          <View className="flex-row flex-wrap -mx-1 mb-2">
            <LiveTile
              icon="speedometer-outline"
              label="Vrtljaji motorja"
              value={liveData?.rpm}
              unit="RPM"
            />
            <LiveTile
              icon="navigate-circle-outline"
              label="Hitrost"
              value={liveData?.speed}
              unit="km/h"
            />
          </View>
          <View className="flex-row flex-wrap -mx-1 mb-2">
            <LiveTile
              icon="thermometer-outline"
              label="Hladilna tekočina"
              value={liveData?.coolant_temp}
              unit="°C"
            />
            <LiveTile
              icon="battery-charging-outline"
              label="Napetost akumulatorja"
              value={liveData?.battery_voltage}
              unit="V"
            />
          </View>
          <View className="flex-row flex-wrap -mx-1 mb-2">
            <LiveTile
              icon="water-outline"
              label="Raven goriva"
              value={liveData?.fuel_level}
              unit="%"
            />
            <LiveTile
              icon="alert-circle-outline"
              label="MIL lučka"
              value={liveData?.mil_on}
              highlight
            />
          </View>

          {/* VIN */}
          {vinFromObd && (
            <View className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 mb-4 flex-row items-center">
              <Ionicons name="card-outline" size={16} color="#94a3b8" />
              <Text className="text-slate-400 text-xs ml-2">VIN iz vozila:</Text>
              <Text className="text-white font-mono ml-2">{vinFromObd}</Text>
            </View>
          )}

          {/* DTC kode */}
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <View className="flex-row items-center mb-3">
              <Ionicons
                name={dtcs.length > 0 ? "warning" : "checkmark-circle"}
                size={18}
                color={dtcs.length > 0 ? "#f59e0b" : "#22c55e"}
              />
              <Text className="text-white font-semibold ml-2">
                DTC napake ({dtcs.length})
              </Text>
            </View>
            {dtcs.length === 0 ? (
              <Text className="text-green-400 text-sm">
                Ni aktivnih napak — sistem je OK ✓
              </Text>
            ) : (
              <View className="flex-row flex-wrap">
                {dtcs.map((code) => (
                  <DtcBadge key={code} code={code} />
                ))}
              </View>
            )}
          </View>

          {/* Gumbi */}
          {state === "done" && (
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity
                onPress={() => {
                  setState("submitting");
                  submitMutation.mutate();
                }}
                className="flex-1 bg-blue-600 rounded-xl py-3.5 items-center flex-row justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="white" />
                <Text className="text-white font-semibold ml-2">
                  Pošlji v backend
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={runOBDScan}
                className="bg-slate-700 rounded-xl py-3.5 px-4 items-center"
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          )}

          {state === "submitting" && (
            <View className="items-center py-4 mb-4">
              <ActivityIndicator color="#3b82f6" />
              <Text className="text-slate-400 mt-2">Pošiljam v backend…</Text>
            </View>
          )}

          {state === "submitted" && (
            <View className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-4 mb-4 flex-row items-center">
              <Ionicons name="checkmark-circle" size={22} color="#4ade80" />
              <Text className="text-green-300 font-semibold ml-3">
                Sken shranjen — Digital Twin posodobljen ✓
              </Text>
            </View>
          )}

          {(state === "submitted") && (
            <TouchableOpacity
              onPress={reset}
              className="bg-slate-700 rounded-xl py-3 items-center mb-4"
              activeOpacity={0.8}
            >
              <Text className="text-slate-300 font-semibold">Novi sken</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* PRETEKLE SEJE */}
      {selectedVehicle && (
        <View className="mt-2">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-white font-semibold text-base">
              Pretekle OBD seje
            </Text>
            {sessionsLoading && <ActivityIndicator size="small" color="#64748b" />}
          </View>

          {!sessionsLoading && sessions?.length === 0 && (
            <View className="items-center py-8 bg-slate-800 rounded-xl border border-slate-700">
              <Ionicons name="time-outline" size={32} color="#475569" />
              <Text className="text-slate-500 mt-2 text-sm">Ni preteklih sej</Text>
            </View>
          )}

          {sessions?.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </View>
      )}

      {renderVehiclePicker()}
    </ScrollView>
  );
}
