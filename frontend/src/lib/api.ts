import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";
import type {
  BaselineItemFields,
  Ecu,
  FleetVehicle,
  SuDetail,
  SuEditable,
  SuListItem,
  VehicleR156,
  RxswinDetail,
  RxswinListItem,
  VehicleType,
  VerifyResult,
} from "@/types/r156";

const BASE_URL = "";

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = Cookies.get("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, {
            refresh_token: refresh,
          });
          Cookies.set("access_token", data.access_token, { secure: true, sameSite: "strict" });
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          Cookies.remove("access_token");
          Cookies.remove("refresh_token");
          window.location.href = "/login";
        }
      } else {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }).then((r) => r.data),
  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
  me: () => api.get("/users/me").then((r) => r.data),
};

// ─── Vehicles ────────────────────────────────────────────────────────────────

export const vehiclesApi = {
  list: (params?: Record<string, string>) =>
    api.get("/vehicles", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/vehicles/${id}`).then((r) => r.data),
  create: (data: unknown) => api.post("/vehicles", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/vehicles/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/vehicles/${id}`).then((r) => r.data),
  twin: (id: string) => api.get(`/vehicles/${id}/twin`).then((r) => r.data),
  snapshots: (id: string) =>
    api.get(`/vehicles/${id}/snapshots`).then((r) => r.data),
  snapshot: (id: string) =>
    api.post(`/vehicles/${id}/snapshot`).then((r) => r.data),
  stats: (id: string) => api.get(`/vehicles/${id}/stats`).then((r) => r.data),
};

// ─── SW Updates ──────────────────────────────────────────────────────────────

export const swApi = {
  list: (params?: Record<string, string>) =>
    api.get("/sw-updates", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/sw-updates/${id}`).then((r) => r.data),
  create: (data: unknown) => api.post("/sw-updates", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/sw-updates/${id}`, data).then((r) => r.data),
};

// ─── DTC Records ─────────────────────────────────────────────────────────────

export const dtcApi = {
  list: (params?: Record<string, string>) =>
    api.get("/dtc-records", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/dtc-records/${id}`).then((r) => r.data),
  create: (data: unknown) => api.post("/dtc-records", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/dtc-records/${id}`, data).then((r) => r.data),
  batchResolve: (ids: string[]) =>
    api.post("/dtc-records/batch-resolve", { ids }).then((r) => r.data),
};

// ─── Homologations ────────────────────────────────────────────────────────────

export const homApi = {
  list: (params?: Record<string, string>) =>
    api.get("/homologations", { params }).then((r) => r.data),
  create: (data: unknown) => api.post("/homologations", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/homologations/${id}`, data).then((r) => r.data),
};

// ─── CoC Certificates ─────────────────────────────────────────────────────────

export const cocApi = {
  list: (params?: Record<string, string>) =>
    api.get("/coc-certificates", { params }).then((r) => r.data),
  create: (data: unknown) =>
    api.post("/coc-certificates", data).then((r) => r.data),
};

// ─── Service Records ──────────────────────────────────────────────────────────

export const serviceApi = {
  list: (params?: Record<string, string>) =>
    api.get("/service-records", { params }).then((r) => r.data),
  create: (data: unknown) =>
    api.post("/service-records", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/service-records/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/service-records/${id}`).then((r) => r.data),
};

// ─── Vecto ────────────────────────────────────────────────────────────────────

export const vectoApi = {
  list: (params?: Record<string, string>) =>
    api.get("/vecto-calculations", { params }).then((r) => r.data),
  create: (data: unknown) =>
    api.post("/vecto-calculations", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/vecto-calculations/${id}`, data).then((r) => r.data),
  pdf: (id: string) =>
    api.get(`/vecto-calculations/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),
};

// ─── Photos ───────────────────────────────────────────────────────────────────

export const photosApi = {
  list: (vehicleId: string) =>
    api.get("/photos", { params: { vehicle_id: vehicleId } }).then((r) => r.data),
  listByLinked: (linkedToType: string, linkedToId: string) =>
    api.get("/photos", { params: { linked_to_type: linkedToType, linked_to_id: linkedToId } }).then((r) => r.data),
  upload: (vehicleId: string, file: File, extraFields?: Record<string, string>) => {
    const form = new FormData();
    form.append("file", file);
    form.append("vehicle_id", vehicleId);
    if (extraFields) {
      Object.entries(extraFields).forEach(([k, v]) => form.append(k, v));
    }
    return api.post("/photos", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  delete: (id: string) => api.delete(`/photos/${id}`).then((r) => r.data),
};

// ─── Alarms ───────────────────────────────────────────────────────────────────

export const alarmsApi = {
  list: (params?: Record<string, string>) =>
    api.get("/alarms", { params }).then((r) => r.data),
  markRead: (id: string) =>
    api.patch(`/alarms/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/alarms/mark-all-read").then((r) => r.data),
  listConfigs: () => api.get("/alarms/configs").then((r) => r.data),
  updateConfig: (id: string, data: unknown) =>
    api.put(`/alarms/configs/${id}`, data).then((r) => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get("/users").then((r) => r.data),
  create: (data: unknown) => api.post("/users", data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.put(`/users/${id}`, data).then((r) => r.data),
  deactivate: (id: string) =>
    api.delete(`/users/${id}`).then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    api
      .put<{ access_token: string; refresh_token: string }>("/users/me/password", { current_password, new_password })
      .then((r) => r.data),
  resetPassword: (id: string) =>
    api.post<{ email: string; temporary_password: string }>(`/users/${id}/reset-password`).then((r) => r.data),
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const auditApi = {
  list: (params?: Record<string, string | number>) =>
    api.get("/audit-logs", { params }).then((r) => r.data),
  count: (params?: Record<string, string>) =>
    api.get("/audit-logs/count", { params }).then((r) => r.data),
};

// ─── OBD-II ───────────────────────────────────────────────────────────────────

export const obdApi = {
  scan: (vehicleId: string, data: unknown) =>
    api.post(`/obd/${vehicleId}/scan`, data).then((r) => r.data),
  sessions: (vehicleId: string, params?: Record<string, string | number>) =>
    api.get(`/obd/${vehicleId}/sessions`, { params }).then((r) => r.data),
  session: (vehicleId: string, sessionId: string) =>
    api.get(`/obd/${vehicleId}/sessions/${sessionId}`).then((r) => r.data),
  live: (vehicleId: string) =>
    api.get(`/obd/${vehicleId}/live`).then((r) => r.data),
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportsApi = {
  fleetStatus: () => api.get("/reports/fleet-status").then((r) => r.data),
  homOverview: (vehicleId?: string) =>
    api.get("/reports/hom-overview", { params: vehicleId ? { vehicle_id: vehicleId } : {} }).then((r) => r.data),
  homPdf: (vehicleId: string) =>
    api.get("/reports/hom-overview", {
      params: { vehicle_id: vehicleId, format: "pdf" },
      responseType: "blob",
    }).then((r) => r.data),
  sumsPdf: (vehicleId: string) =>
    api.get("/reports/sums", {
      params: { vehicle_id: vehicleId, format: "pdf" },
      responseType: "blob",
    }).then((r) => r.data),
  sumsHtml: (vehicleId: string) =>
    api.get("/reports/sums", {
      params: { vehicle_id: vehicleId, format: "html" },
    }).then((r) => r.data),
  swUpdatescsv: (vehicleId?: string) =>
    api.get("/reports/sw-updates-csv", {
      params: vehicleId ? { vehicle_id: vehicleId } : {},
      responseType: "blob",
    }).then((r) => r.data),
  dtcRecordsCsv: (vehicleId?: string, status?: string) =>
    api.get("/reports/dtc-records-csv", {
      params: {
        ...(vehicleId ? { vehicle_id: vehicleId } : {}),
        ...(status ? { status } : {}),
      },
      responseType: "blob",
    }).then((r) => r.data),
  homologationsCsv: (vehicleId?: string) =>
    api.get("/reports/homologations-csv", {
      params: vehicleId ? { vehicle_id: vehicleId } : {},
      responseType: "blob",
    }).then((r) => r.data),
  serviceRecordsCsv: (vehicleId?: string) =>
    api.get("/reports/service-records-csv", {
      params: vehicleId ? { vehicle_id: vehicleId } : {},
      responseType: "blob",
    }).then((r) => r.data),
};

// ─── R156 SUMS register ──────────────────────────────────────────────────────

export const r156Api = {
  vehicleTypes: () => api.get<VehicleType[]>("/vehicle-types").then((r) => r.data),
  createVehicleType: (data: { name: string; model_code?: string | null; description?: string | null }) =>
    api.post<VehicleType>("/vehicle-types", data).then((r) => r.data),

  ecus: (vehicleTypeId?: string) =>
    api
      .get<Ecu[]>("/ecus", { params: vehicleTypeId ? { vehicle_type_id: vehicleTypeId } : {} })
      .then((r) => r.data),
  createEcu: (data: Partial<Ecu>) => api.post<Ecu>("/ecus", data).then((r) => r.data),
  updateEcu: (id: string, data: Partial<Ecu>) => api.put<Ecu>(`/ecus/${id}`, data).then((r) => r.data),

  rxswins: () => api.get<RxswinListItem[]>("/rxswins").then((r) => r.data),
  rxswin: (id: string) => api.get<RxswinDetail>(`/rxswins/${id}`).then((r) => r.data),
  createRxswin: (data: {
    vehicle_type_id: string;
    rxswin: string;
    description?: string | null;
    regulations_affected?: string[];
  }) => api.post<RxswinDetail>("/rxswins", data).then((r) => r.data),
  updateRxswin: (id: string, data: { description?: string | null; regulations_affected?: string[]; status?: string }) =>
    api.put<RxswinDetail>(`/rxswins/${id}`, data).then((r) => r.data),

  createBaseline: (rxswinId: string, notes?: string) =>
    api.post<RxswinDetail>(`/rxswins/${rxswinId}/baselines`, { notes: notes || null }).then((r) => r.data),
  updateBaseline: (baselineId: string, notes: string | null) =>
    api.put<RxswinDetail>(`/rxswin-baselines/${baselineId}`, { notes }).then((r) => r.data),
  discardBaseline: (baselineId: string) =>
    api.delete<RxswinDetail>(`/rxswin-baselines/${baselineId}`).then((r) => r.data),
  releaseBaseline: (baselineId: string) =>
    api.post<RxswinDetail>(`/rxswin-baselines/${baselineId}/release`).then((r) => r.data),

  addItem: (baselineId: string, data: Partial<BaselineItemFields> & { ecu_id: string }) =>
    api.post<RxswinDetail>(`/rxswin-baselines/${baselineId}/items`, data).then((r) => r.data),
  updateItem: (baselineId: string, itemId: string, data: Partial<BaselineItemFields>) =>
    api.put<RxswinDetail>(`/rxswin-baselines/${baselineId}/items/${itemId}`, data).then((r) => r.data),
  deleteItem: (baselineId: string, itemId: string) =>
    api.delete<RxswinDetail>(`/rxswin-baselines/${baselineId}/items/${itemId}`).then((r) => r.data),
  verifyItem: (
    baselineId: string,
    itemId: string,
    data: { target: "sw" | "config"; computed_sha256: string; file_name?: string; file_size?: number }
  ) => api.post<VerifyResult>(`/rxswin-baselines/${baselineId}/items/${itemId}/verify`, data).then((r) => r.data),
};

// Prenos PDF z avtentikacijo (povezava <a href> ne pošlje Bearer žetona)
async function downloadBlob(url: string, fallbackName: string) {
  const res = await api.get(url, { responseType: "blob" });
  const cd: string = res.headers["content-disposition"] ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="([^"]+)"/i.exec(cd);
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

export const fleetApi = {
  list: (vehicleTypeId?: string) =>
    api
      .get<FleetVehicle[]>("/vehicles", { params: vehicleTypeId ? { vehicle_type_id: vehicleTypeId } : {} })
      .then((r) => r.data),
  create: (data: { name: string; model: string; year: number; vin: string; vehicle_type_id: string }) =>
    api.post<FleetVehicle>("/vehicles", data).then((r) => r.data),
  r156: (id: string) => api.get<VehicleR156>(`/vehicles/${id}/r156`).then((r) => r.data),
  updateEcuInstances: (
    id: string,
    instances: { ecu_id: string; serial_number: string | null; hardware_version: string | null; batch_number: string | null }[]
  ) => api.put<VehicleR156>(`/vehicles/${id}/ecu-instances`, { instances }).then((r) => r.data),
  createEol: (
    id: string,
    data: {
      rxswin_baselines: { rxswin_id: string; baseline_id: string }[];
      config_id?: string | null;
      system_schemes_baseline?: string | null;
      vv_status: "pass" | "fail" | "pending";
      erp_work_order?: string | null;
    }
  ) => api.post<VehicleR156>(`/vehicles/${id}/configurations/eol`, data).then((r) => r.data),
};

export const suApi = {
  list: (params?: { vehicle_type_id?: string; include_superseded?: boolean }) =>
    api.get<SuListItem[]>("/software-updates", { params }).then((r) => r.data),
  get: (id: string) => api.get<SuDetail>(`/software-updates/${id}`).then((r) => r.data),
  create: (data: { vehicle_type_id: string; title: string; description_purpose: string }) =>
    api.post<SuDetail>("/software-updates", data).then((r) => r.data),
  update: (id: string, data: Partial<SuEditable>) =>
    api.put<SuDetail>(`/software-updates/${id}`, data).then((r) => r.data),
  discard: (id: string) => api.delete(`/software-updates/${id}`),
  signVv: (id: string, data: { vv_status: "pass" | "fail"; vv_method: string }) =>
    api.post<SuDetail>(`/software-updates/${id}/vv`, data).then((r) => r.data),
  addRxswin: (id: string, data: { rxswin_id: string; baseline_after_id: string }) =>
    api.post<SuDetail>(`/software-updates/${id}/rxswins`, data).then((r) => r.data),
  removeRxswin: (id: string, linkId: string) =>
    api.delete<SuDetail>(`/software-updates/${id}/rxswins/${linkId}`).then((r) => r.data),
  addTargets: (id: string, vehicleIds: string[]) =>
    api.post<SuDetail>(`/software-updates/${id}/targets`, { vehicle_ids: vehicleIds }).then((r) => r.data),
  setCompatibility: (id: string, targetId: string, data: { compatibility_confirmed: boolean; compatibility_notes?: string | null }) =>
    api.put<SuDetail>(`/software-updates/${id}/targets/${targetId}`, data).then((r) => r.data),
  removeTarget: (id: string, targetId: string) =>
    api.delete<SuDetail>(`/software-updates/${id}/targets/${targetId}`).then((r) => r.data),
  recordResult: (id: string, targetId: string, result: "success" | "failed" | "rolled_back") =>
    api.post<SuDetail>(`/software-updates/${id}/targets/${targetId}/result`, { result }).then((r) => r.data),
  recordNotification: (id: string, method: string) =>
    api.post<SuDetail>(`/software-updates/${id}/notification`, { method }).then((r) => r.data),
  release: (id: string) => api.post<SuDetail>(`/software-updates/${id}/release`).then((r) => r.data),
  revise: (id: string) => api.post<SuDetail>(`/software-updates/${id}/revise`).then((r) => r.data),
  downloadReport: (id: string) => downloadBlob(`/software-updates/${id}/report.pdf`, "software-update.pdf"),
};

const qs = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `?${q}` : "";
};

export const exportApi = {
  rxswinRegister: (vehicleTypeId?: string) =>
    downloadBlob(`/rxswin-register.pdf${qs({ vehicle_type_id: vehicleTypeId })}`, "RXSWIN-register.pdf"),
  vehicleConfigurations: (vehicleTypeId?: string) =>
    downloadBlob(`/vehicle-configurations.csv${qs({ vehicle_type_id: vehicleTypeId })}`, "vehicle-configurations.csv"),
  auditTrail: (params: Record<string, string | undefined>) =>
    downloadBlob(`/audit-logs/export.csv${qs(params)}`, "audit-trail.csv"),
};

export const readmeApi = {
  download: (baselineId: string, itemId: string) =>
    downloadBlob(`/rxswin-baselines/${baselineId}/items/${itemId}/readme.pdf`, "readme.pdf"),
};
