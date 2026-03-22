import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
