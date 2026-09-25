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
