// Tipi za R156 SUMS register — ustrezajo backend/app/schemas/r156.py

export type BaselineStatus = "draft" | "released" | "superseded";

export interface VehicleType {
  id: string;
  name: string;
  model_code: string | null;
  description: string | null;
  created_at: string;
}

export interface Ecu {
  id: string;
  vehicle_type_id: string;
  ecu_name: string;
  system_name: string | null;
  supplier: string | null;
  eversum_part_number: string;
  un_ece_reg_number: string | null;
  description: string | null;
  created_at: string;
}

export interface BaselineSummary {
  id: string;
  baseline_number: number;
  status: BaselineStatus;
  released_at: string | null;
  item_count: number;
}

export interface RxswinListItem {
  id: string;
  vehicle_type_id: string;
  vehicle_type_name: string;
  rxswin: string;
  description: string | null;
  regulations_affected: string[];
  status: "active" | "retired";
  current_baseline: BaselineSummary | null;
  draft_baseline: BaselineSummary | null;
  baseline_count: number;
  updated_at: string;
}

export interface BaselineItemFields {
  sw_version: string;
  sw_file_name: string | null;
  sw_file_sha256: string | null;
  sw_config_version: string | null;
  sw_config_file_name: string | null;
  sw_config_sha256: string | null;
  egnyte_folder_url: string | null;
  compatible_hardware: string | null;
  change_log: string | null;
  description: string | null;
}

export interface BaselineItem extends BaselineItemFields {
  id: string;
  baseline_id: string;
  ecu_id: string;
  ecu_name: string;
  eversum_part_number: string;
  supplier: string | null;
  sha_valid: boolean;
}

export interface Baseline {
  id: string;
  rxswin_id: string;
  baseline_number: number;
  status: BaselineStatus;
  integrity_method: string;
  notes: string | null;
  released_at: string | null;
  released_by: string | null;
  released_by_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  items: BaselineItem[];
}

export interface RxswinDetail {
  id: string;
  vehicle_type_id: string;
  vehicle_type_name: string;
  rxswin: string;
  description: string | null;
  regulations_affected: string[];
  status: "active" | "retired";
  created_at: string;
  updated_at: string;
  baselines: Baseline[];
}

export interface VerifyResult {
  match: boolean;
  expected_sha256: string | null;
  computed_sha256: string;
  recorded: boolean;
}

// ─── Software Update dokument (R156 §7.1.2.5) ────────────────────────────────

export type SuStatus = "draft" | "released" | "superseded";

export interface FleetVehicle {
  id: string;
  name: string;
  model: string;
  year: number;
  vin: string;
  status: string;
  vehicle_type_id: string | null;
  created_at: string;
}

export interface SuListItem {
  id: string;
  document_id: string;
  revision: number;
  title: string;
  vehicle_type_id: string;
  vehicle_type_name: string;
  status: SuStatus;
  vv_status: "pending" | "pass" | "fail";
  rxswins: string[];
  target_count: number;
  applied_count: number;
  released_at: string | null;
  updated_at: string;
}

export interface SuAffectedRxswin {
  id: string;
  rxswin_id: string;
  rxswin: string;
  baseline_before_id: string | null;
  baseline_before_number: number | null;
  baseline_after_id: string | null;
  baseline_after_number: number | null;
  baseline_after_status: BaselineStatus | null;
}

export interface SuTarget {
  id: string;
  vehicle_id: string;
  vin: string;
  vehicle_name: string;
  compatibility_confirmed: boolean;
  compatibility_notes: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  result: "success" | "failed" | "rolled_back" | null;
  applied_at: string | null;
  applied_by_name: string | null;
  current_config_id: string | null;
  precondition: "ok" | "mismatch" | "already_installed" | "unknown";
  precondition_detail: string[];
}

export interface SuEditable {
  title: string;
  description_purpose: string;
  dependencies_identified: string | null;
  system_schemes_baseline: string | null;
  type_approval_update_necessary: boolean | null;
  type_approval_justification: string | null;
  unece_affected_requirements: string[];
  type_approval_granted: boolean | null;
  type_approval_number: string | null;
  type_approval_date: string | null;
  user_notification_required: boolean;
  execution_conditions: string | null;
  safe_state_conditions: string | null;
  new_hardware_required: boolean;
  safety_security_confirmation: string | null;
  erp_work_order: string | null;
  erp_work_order_url: string | null;
  egnyte_folder_url: string | null;
}

export interface SuDetail extends SuEditable {
  id: string;
  document_id: string;
  revision: number;
  vehicle_type_id: string;
  vehicle_type_name: string;
  status: SuStatus;
  vv_status: "pending" | "pass" | "fail";
  vv_method: string | null;
  vv_signed_by_name: string | null;
  vv_signed_at: string | null;
  user_notification_method: string | null;
  user_notified_at: string | null;
  user_notified_by_name: string | null;
  released_at: string | null;
  released_by_name: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  affected_rxswins: SuAffectedRxswin[];
  targets: SuTarget[];
  release_blockers: string[];
  revisions: { id: string; revision: number; status: SuStatus }[];
}

// ─── Konfiguracija vozila (R156 §7.1.2.2) ────────────────────────────────────

export interface SnapshotItem {
  ecu: string;
  ecu_id: string;
  part_number: string;
  sw_version: string;
  sw_file_name: string | null;
  sw_file_sha256: string | null;
  sw_config_version: string | null;
  sw_config_file_name: string | null;
  sw_config_sha256: string | null;
  compatible_hardware: string | null;
}

export interface SnapshotRxswin {
  rxswin_id: string;
  rxswin: string;
  baseline_id: string;
  baseline_number: number;
  items: SnapshotItem[];
}

export interface SnapshotEcu {
  ecu: string;
  ecu_id: string;
  part_number: string;
  serial_number: string | null;
  hardware_version: string | null;
  batch_number: string | null;
}

export interface VehicleConfig {
  id: string;
  config_type: "initial_eol" | "last_known";
  config_id: string | null;
  reason: string | null;
  snapshot: { vin: string; rxswins: SnapshotRxswin[]; ecus: SnapshotEcu[] };
  system_schemes_baseline: string | null;
  vv_status: string | null;
  erp_work_order: string | null;
  software_update_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface EcuInstance {
  ecu_id: string;
  ecu_name: string;
  part_number: string;
  serial_number: string | null;
  hardware_version: string | null;
  batch_number: string | null;
}

export interface VehicleR156 {
  id: string;
  vin: string;
  name: string;
  year: number;
  status: string;
  vehicle_type_id: string | null;
  vehicle_type_name: string | null;
  ecu_instances: EcuInstance[];
  has_eol: boolean;
  current: VehicleConfig | null;
  history: VehicleConfig[];
}
