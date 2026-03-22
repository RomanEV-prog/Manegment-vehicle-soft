import axios from "axios";
import * as SecureStore from "expo-secure-store";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_PLATFORM === "ios"
    ? "http://localhost:8000"
    : "http://10.0.2.2:8000");

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync("auth_token");
    }
    return Promise.reject(error);
  }
);

// ── Auth ─────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "qc_manager" | "technician" | "partner_viewer";
  is_active: boolean;
  organization_id: string;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    api.post<LoginResponse>("/api/v1/auth/login", payload),
  me: () => api.get<User>("/api/v1/users/me"),
  registerFcmToken: (fcm_token: string) =>
    api.put("/api/v1/users/me/fcm-token", { fcm_token }),
};

// ── Vehicles ─────────────────────────────────────────────────

export type VehicleStatus = "active" | "in_service" | "shipped" | "decommissioned";

export interface Vehicle {
  id: string;
  name: string;
  model: string;
  year: number;
  vin: string;
  seats: number;
  project_name: string;
  status: VehicleStatus;
  organization_id: string;
  created_at: string;
}

export const vehiclesApi = {
  list: (params?: { status?: string; search?: string }) =>
    api.get<Vehicle[]>("/api/v1/vehicles", { params }),
  get: (id: string) => api.get<Vehicle>(`/api/v1/vehicles/${id}`),
};

// ── DTC ──────────────────────────────────────────────────────

export type DtcSeverity = "low" | "medium" | "high";
export type DtcStatus = "active" | "resolved" | "under_review";

export interface DtcRecord {
  id: string;
  vehicle_id: string;
  code: string;
  description: string;
  severity: DtcSeverity;
  status: DtcStatus;
  source?: string;
  created_at: string;
  resolved_at?: string | null;
}

export const dtcApi = {
  list: (params?: { status?: string; vehicle_id?: string; severity?: string }) =>
    api.get<DtcRecord[]>("/api/v1/dtc", { params }),
  create: (data: {
    vehicle_id: string;
    code: string;
    description: string;
    severity: DtcSeverity;
  }) => api.post<DtcRecord>("/api/v1/dtc", data),
  resolve: (id: string) =>
    api.put<DtcRecord>(`/api/v1/dtc/${id}`, { status: "resolved" }),
};

// ── Service Records ───────────────────────────────────────────

export interface ServiceRecord {
  id: string;
  vehicle_id: string;
  service_type: string;
  technician: string;
  date_performed: string;
  notes?: string | null;
  mileage_km?: number | null;
  cost_eur?: number | null;
  created_at: string;
}

export const serviceApi = {
  list: (params?: { vehicle_id?: string }) =>
    api.get<ServiceRecord[]>("/api/v1/service-records", { params }),
  create: (data: {
    vehicle_id: string;
    service_type: string;
    technician: string;
    date_performed: string;
    notes?: string;
    mileage_km?: number;
    cost_eur?: number;
  }) => api.post<ServiceRecord>("/api/v1/service-records", data),
};

// ── SW Updates ──────────────────────────────────────────────

export type SWStatus = "pending" | "installing" | "installed" | "failed" | "rolled_back";

export interface SWUpdate {
  id: string;
  vehicle_id: string;
  organization_id: string;
  date: string;
  ecu_module: string;
  version_before: string;
  version_after: string;
  rxswin: string;
  method: string;
  status: SWStatus;
  notes?: string | null;
  created_at: string;
}

export const swUpdatesApi = {
  list: (params?: { vehicle_id?: string; status?: string }) =>
    api.get<SWUpdate[]>("/api/v1/sw-updates", { params }),
  get: (id: string) => api.get<SWUpdate>(`/api/v1/sw-updates/${id}`),
  create: (data: {
    vehicle_id: string;
    date: string;
    ecu_module: string;
    version_before: string;
    version_after: string;
    rxswin: string;
    method: string;
    status?: string;
    notes?: string;
  }) => api.post<SWUpdate>("/api/v1/sw-updates", data),
  updateStatus: (id: string, status: SWStatus) =>
    api.put<SWUpdate>(`/api/v1/sw-updates/${id}`, { status }),
};

// ── Photos ──────────────────────────────────────────────────

export interface Photo {
  id: string;
  organization_id: string;
  vehicle_id: string;
  linked_to_type: string | null;
  linked_to_id: string | null;
  filename: string;
  url: string;
  photo_type: string;
  gps_lat: number | null;
  gps_lng: number | null;
  taken_at: string | null;
  taken_by: string | null;
  created_at: string;
}

export const photosApi = {
  list: (params?: { vehicle_id?: string; photo_type?: string }) =>
    api.get<Photo[]>("/api/v1/photos", { params }),
  upload: (formData: FormData) =>
    api.post<Photo>("/api/v1/photos", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id: string) => api.delete(`/api/v1/photos/${id}`),
};

// ── Alarms ──────────────────────────────────────────────────

export interface AlarmEvent {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  alarm_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  delivered_via: string[] | null;
  created_at: string;
}

export const alarmsApi = {
  list: (params?: { is_read?: boolean; severity?: string; limit?: number }) =>
    api.get<AlarmEvent[]>("/api/v1/alarms", { params }),
  markRead: (id: string) =>
    api.patch(`/api/v1/alarms/${id}/read`),
  markAllRead: () =>
    api.post("/api/v1/alarms/mark-all-read"),
};

// ── Digital Twin ─────────────────────────────────────────────

export interface VehicleTwin {
  id: string;
  vehicle_id: string;
  ecu_config: Record<string, unknown> | null;
  active_dtcs: string[];
  hom_status: Record<string, unknown> | null;
  last_service_date: string | null;
  last_sw_update_date: string | null;
  snapshot_count: number;
  updated_at: string;
}

export const twinsApi = {
  get: (vehicleId: string) =>
    api.get<VehicleTwin>(`/api/v1/vehicles/${vehicleId}/twin`),
};

// ── OBD ─────────────────────────────────────────────────────

export interface OBDLiveDataPayload {
  rpm?: number;
  speed?: number;
  coolant_temp?: number;
  fuel_level?: number;
  battery_voltage?: number;
  ambient_temp?: number;
  mil_on?: boolean;
}

export interface OBDScanRequest {
  adapter_type: string;
  live_data: OBDLiveDataPayload;
  dtcs_raw: string[];
  vin_from_obd?: string | null;
  ecu_info?: Record<string, unknown> | null;
}

export interface OBDScanResponse {
  session_id: string;
  dtcs_created: number;
  twin_updated: boolean;
  live_data: OBDLiveDataPayload;
}

export interface OBDSession {
  id: string;
  vehicle_id: string;
  adapter_type: string;
  live_data: OBDLiveDataPayload | null;
  dtcs_raw: string[];
  vin_from_obd: string | null;
  created_at: string;
}

export const obdApi = {
  scan: (vehicleId: string, data: OBDScanRequest) =>
    api.post<OBDScanResponse>(`/api/v1/obd/${vehicleId}/scan`, data),
  sessions: (vehicleId: string) =>
    api.get<OBDSession[]>(`/api/v1/obd/${vehicleId}/sessions`),
  session: (vehicleId: string, sessionId: string) =>
    api.get<OBDSession>(`/api/v1/obd/${vehicleId}/sessions/${sessionId}`),
};

// ── Reports ──────────────────────────────────────────────────

export interface FleetStatus {
  total_vehicles: number;
  by_status: Record<string, number>;
  active_dtcs: number;
  critical_dtcs: number;
  pending_sw_updates: number;
  expiring_homologations: number;
}

export const reportsApi = {
  fleetStatus: () => api.get<FleetStatus>("/api/v1/reports/fleet-status"),
};
