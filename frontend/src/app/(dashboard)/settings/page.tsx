"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usersApi, alarmsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/utils";
import { Users, Plus, UserX, Bell, Mail, Wifi, CheckCircle2, XCircle } from "lucide-react";
import type { User, AlarmConfig } from "@/types";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { useTranslations } from "@/lib/i18n";

const ROLES = ["admin", "qc_manager", "technician", "partner_viewer"];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  qc_manager: "bg-blue-100 text-blue-800",
  technician: "bg-green-100 text-green-800",
  partner_viewer: "bg-gray-100 text-gray-600",
};

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "technician" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      toast.success(t("userCreatedSuccess"));
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
      setForm({ email: "", full_name: "", password: "", role: "technician" });
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? t("createUserError"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createUserTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldFullName")}</label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Roman Adler" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldEmail")}</label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="roman@podjetje.si" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldPassword")}</label>
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={t("passwordHint")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldRole")}</label>
            <select
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.email || !form.full_name || form.password.length < 8}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { payload, user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
    enabled: payload?.role === "admin" || payload?.role === "qc_manager",
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => {
      toast.success(t("userDeactivatedSuccess"));
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => toast.error(t("deactivateError")),
  });

  const isAdmin = payload?.role === "admin";

  const { data: alarmConfigs } = useQuery<AlarmConfig[]>({
    queryKey: ["alarm-configs"],
    queryFn: () => alarmsApi.listConfigs(),
    enabled: isAdmin || payload?.role === "qc_manager",
  });

  const toggleAlarmMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      alarmsApi.updateConfig(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alarm-configs"] });
    },
    onError: () => toast.error(t("alarmUpdateError")),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      {/* Current user info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("myAccount")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700 select-none">
              {(currentUser?.full_name ?? payload?.role ?? "U")
                .split(" ")
                .map((w: string) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {currentUser?.full_name ?? "—"}
              </p>
              <p className="text-sm text-gray-500">
                {currentUser?.email ?? ""}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[payload?.role ?? ""] ?? "bg-gray-100"}`}>
                  {payload?.role}
                </span>
                <span className="text-xs text-gray-400">
                  {t("orgLabel")} {payload?.org_id?.slice(0, 8)}…
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users list */}
      {(isAdmin || payload?.role === "qc_manager") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                {t("usersTitle")}
              </CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("newUser")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-4 py-3">{t("colName")}</th>
                    <th className="px-4 py-3">{t("colEmail")}</th>
                    <th className="px-4 py-3">{t("colRole")}</th>
                    <th className="px-4 py-3">{t("colStatus")}</th>
                    {isAdmin && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(users ?? []).map((u) => (
                    <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 font-medium">{u.full_name}</td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="text-xs text-green-600 font-medium">{t("userActive")}</span>
                        ) : (
                          <span className="text-xs text-gray-400">{t("userInactive")}</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {u.is_active && u.id !== payload?.sub && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-500 hover:text-red-700"
                              onClick={() => deactivateMutation.mutate(u.id)}
                            >
                              <UserX className="mr-1 h-3.5 w-3.5" />
                              {t("deactivate")}
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Alarm configurations */}
      {(isAdmin || payload?.role === "qc_manager") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-orange-500" />
              {t("alarmConfigTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!alarmConfigs?.length ? (
              <p className="text-sm text-gray-400">{t("noAlarmConfigs")}</p>
            ) : (
              <div className="space-y-3">
                {alarmConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      cfg.is_active ? "bg-white" : "bg-gray-50 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {cfg.is_active ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cfg.alarm_type}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          {cfg.channels.map((ch) => (
                            <span
                              key={ch}
                              className="flex items-center gap-0.5 text-xs text-gray-500"
                            >
                              {ch === "email" ? <Mail className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                              {ch}
                            </span>
                          ))}
                          {cfg.recipient_roles?.map((role) => (
                            <span key={role} className={`rounded-full px-1.5 py-0.5 text-xs ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-600"}`}>
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() =>
                          toggleAlarmMutation.mutate({
                            id: cfg.id,
                            data: { ...cfg, is_active: !cfg.is_active },
                          })
                        }
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          cfg.is_active ? "bg-green-500" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            cfg.is_active ? "translate-x-4" : "translate-x-1"
                          }`}
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
