// ─── Auth ────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface JwtPayload {
  sub: string;
  org_id: string;
  role: "admin" | "qc_manager" | "technician" | "partner_viewer";
  exp: number;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "qc_manager" | "technician" | "partner_viewer";
  is_active: boolean;
  organization_id: string;
}

// ─── Vehicle ─────────────────────────────────────────────────────────────────

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

// ─── Digital Twin ─────────────────────────────────────────────────────────────

export interface EcuConfig {
  [module: string]: {
    version: string;
    rxswin: string;
    last_updated: string;
  };
}

export interface HomStatus {
  [regulation: string]: {
    status: string;
    authority: string;
    valid_until?: string;
  };
}

export interface ActiveDtc {
  code: string;
  severity: "low" | "medium" | "high";
  description: string;
  detected_at: string;
}

export interface VehicleTwin {
  vehicle_id: string;
  ecu_config: EcuConfig;
  hom_status: HomStatus;
  active_dtcs: ActiveDtc[];
  last_service_at: string | null;
  last_sw_update_at: string | null;
  updated_at: string;
}

export interface TwinSnapshot {
  id: string;
  vehicle_id: string;
  snapshot: VehicleTwin;
  trigger_type: string;
  trigger_id: string | null;
  trigger_label: string | null;
  created_at: string;
}

// ─── SW Updates ──────────────────────────────────────────────────────────────

export type SwMethod = "OTA" | "Workshop" | "J2534";
export type SwStatus = "pending" | "in_progress" | "success" | "failed" | "rolled_back";

export interface SwUpdate {
  id: string;
  vehicle_id: string;
  date: string;
  ecu_module: string;
  version_before: string;
  version_after: string;
  rxswin: string;
  method: SwMethod;
  status: SwStatus;
  notes: string | null;
  created_by: string | null;
  organization_id: string;
  created_at: string;
}

// ─── DTC Records ─────────────────────────────────────────────────────────────

export type DtcSeverity = "low" | "medium" | "high";
export type DtcStatus = "active" | "in_review" | "resolved";
export type DtcSource = "manual" | "obd";

export interface DtcRecord {
  id: string;
  vehicle_id: string;
  code: string;
  description: string;
  severity: DtcSeverity;
  status: DtcStatus;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  assigned_to: string | null;
  source: DtcSource;
  organization_id: string;
}

// ─── Homologation ─────────────────────────────────────────────────────────────

export type HomStatus_type = "pending" | "in_progress" | "approved" | "expired" | "rejected";

export interface Homologation {
  id: string;
  vehicle_id: string;
  regulation: string;
  status: HomStatus_type;
  authority: string | null;
  country: string | null;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  responsible_id: string | null;
  next_action_due: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export interface CoCCertificate {
  id: string;
  vehicle_id: string;
  coc_number: string;
  issued_at: string;
  valid_until: string | null;
  issuing_body: string;
  pdf_url: string | null;
  created_at: string;
}

// ─── Service Records ──────────────────────────────────────────────────────────

export interface ServiceRecord {
  id: string;
  vehicle_id: string;
  date: string;
  service_type: string;
  items: string[];
  technician: string;
  notes: string | null;
  created_by: string | null;
  organization_id: string;
  created_at: string;
}

// ─── Vecto Calculations ──────────────────────────────────────────────────────

export type VectoStatus = "draft" | "submitted" | "approved";

export interface VectoInputParams {
  // Masa
  masa_prazno_kg?: number;
  masa_test_kg?: number;
  masa_max_kg?: number;
  // Aerodinamika
  cd?: number;
  a_front_m2?: number;
  cda?: number;
  // Kotalniški upor
  crr_spredaj?: number;
  crr_zadaj?: number;
  // Baterija
  kapaciteta_kwh?: number;
  napetost_v?: number;
  max_moc_polnjenja_kw?: number;
  // Motor
  max_moc_kw?: number;
  max_navor_nm?: number;
  // Simulacija
  wltp_cikel?: string;
  temperatura_ref_c?: number;
  tovor_kg?: number;
  [key: string]: unknown;
}

export interface VectoCalculation {
  id: string;
  vehicle_id: string;
  calculated_at: string;
  co2_wltp: number | null;
  energy_wltp: number | null;
  range_km: number | null;
  input_params: VectoInputParams | null;
  status: VectoStatus;
  organization_id: string;
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export interface Photo {
  id: string;
  vehicle_id: string;
  linked_to_type: string | null;
  linked_to_id: string | null;
  filename: string;
  url: string;
  photo_type: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  taken_at: string | null;
  taken_by: string | null;
  created_at: string;
}

// ─── Alarms ───────────────────────────────────────────────────────────────────

export type AlarmSeverity = "critical" | "warning" | "info" | "success";

export interface AlarmEvent {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  alarm_type: string;
  severity: AlarmSeverity;
  title: string;
  message: string;
  is_read: boolean;
  delivered_via: string[];
  created_at: string;
}

export interface AlarmConfig {
  id: string;
  organization_id: string;
  alarm_type: string;
  is_active: boolean;
  channels: string[];
  recipients: Record<string, unknown>;
  recipient_roles: string[];
  threshold: Record<string, unknown> | null;
}

// ─── Fleet Status (Report) ────────────────────────────────────────────────────

export interface FleetStatusSummary {
  total_vehicles: number;
  active_vehicles: number;
  in_service_vehicles: number;
  shipped_vehicles: number;
  active_high_dtcs: number;
  open_homologations: number;
  sw_updates_last_30_days: number;
}

export interface FleetStatusVehicle {
  id: string;
  name: string;
  vin: string;
  model: string;
  status: VehicleStatus;
  project_name: string | null;
  active_dtc_count: number;
  active_dtcs_high: number;
  ecu_modules: number;
  last_sw_update: string | null;
  last_service: string | null;
}

export interface FleetStatus {
  generated_at: string;
  summary: FleetStatusSummary;
  vehicles: FleetStatusVehicle[];
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "resolve"
  | "approve"
  | "upload"
  | "snapshot"
  | "export"
  | "login"
  | "logout";

export type AuditEntityType =
  | "vehicle"
  | "sw_update"
  | "dtc_record"
  | "service_record"
  | "homologation"
  | "coc_certificate"
  | "photo"
  | "vehicle_twin"
  | "user"
  | "vecto_calculation"
  | "alarm_config"
  | "obd_session";

export interface AuditLog {
  id: string;
  org_id: string;
  actor_id: string | null;
  actor_type: "user" | "system" | "api_key";
  actor_ip: string | null;
  actor_device: string | null;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

// ─── OBD-II ───────────────────────────────────────────────────────────────────

export interface OBDLiveData {
  rpm?: number;
  speed_kmh?: number;
  coolant_temp_c?: number;
  intake_temp_c?: number;
  throttle_pos_pct?: number;
  fuel_level_pct?: number;
  engine_load_pct?: number;
  battery_voltage?: number;
  maf_g_per_sec?: number;
  fuel_pressure_kpa?: number;
  barometric_pressure_kpa?: number;
  o2_sensor_voltage?: number;
  distance_since_dtc_clear_km?: number;
  runtime_since_start_s?: number;
  mil_on?: boolean;
  dtc_count_obd?: number;
  last_updated?: string;
  session_id?: string;
  adapter_type?: string;
  [key: string]: unknown;
}

export interface OBDRawDTC {
  code: string;
  freeze_frame?: Record<string, unknown>;
}

export interface OBDSession {
  id: string;
  vehicle_id: string;
  organization_id: string;
  adapter_type: string;
  adapter_id: string | null;
  protocol: string | null;
  status: string;
  live_data: OBDLiveData;
  raw_pids: Record<string, string>;
  dtcs_raw: OBDRawDTC[];
  dtc_count: number;
  dtcs_imported: number;
  dtcs_skipped: number;
  vin_from_obd: string | null;
  ecu_info: Record<string, string>;
  notes: string | null;
  scanned_at: string;
  created_by: string | null;
  created_at: string;
}

export interface OBDScanRequest {
  adapter_type?: string;
  adapter_id?: string;
  protocol?: string;
  live_data?: Partial<OBDLiveData>;
  raw_pids?: Record<string, string>;
  dtcs?: OBDRawDTC[];
  vin_from_obd?: string;
  ecu_info?: Record<string, string>;
  notes?: string;
}

export interface OBDScanResponse {
  session_id: string;
  vehicle_id: string;
  status: string;
  dtcs_found: number;
  dtcs_imported: number;
  dtcs_skipped: number;
  live_data_updated: boolean;
  twin_updated: boolean;
  alarms_triggered: number;
  scanned_at: string;
}

export interface OBDLiveDataResponse {
  vehicle_id: string;
  live_data: OBDLiveData;
  last_session_id: string | null;
  last_scanned_at: string | null;
  has_data: boolean;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
