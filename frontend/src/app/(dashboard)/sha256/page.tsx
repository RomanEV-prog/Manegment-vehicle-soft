"use client";

import { useState } from "react";
import { CheckCircle2, Copy, FileSearch, Hash, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/lib/i18n";
import { formatBytes, isSha256, sha256File, type FileHash } from "@/lib/sha256";
import { cn } from "@/lib/utils";
import { Field } from "@/components/r156/shared";

// Samostojno orodje: izračun SHA-256 v brskalniku, brez zapisa na strežnik.
// Preverjanje proti registru (z zapisom v revizijsko sled) je na postavki baseline-a.
export default function Sha256Page() {
  const t = useTranslations("r156");
  const [hash, setHash] = useState<FileHash | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);

  const run = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setHash(await sha256File(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ref = reference.trim().toLowerCase();
  const compare = hash && ref ? (isSha256(ref) ? ref === hash.sha256 : null) : undefined;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t("shaToolTitle")}</h2>
        <p className="text-sm text-gray-500">{t("shaToolSubtitle")}</p>
      </div>

      <Card className="space-y-4 p-5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            run(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-sm text-gray-500 transition-colors",
            dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40"
          )}
        >
          {busy ? <Spinner className="h-7 w-7" /> : <FileSearch className="h-7 w-7 text-gray-400" />}
          <span>{busy ? t("computing") : t("dropFile")}</span>
          <span className="text-xs text-gray-400">{t("shaHint")}</span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              run(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {hash && (
          <dl className="grid grid-cols-[90px_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <dt className="text-gray-500">{t("fileName")}</dt>
            <dd className="font-mono">{hash.fileName}</dd>
            <dt className="text-gray-500">{t("fileSize")}</dt>
            <dd>{formatBytes(hash.fileSize)}</dd>
            <dt className="text-gray-500">{t("sha256")}</dt>
            <dd className="flex items-center gap-2">
              <code className="break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs">{hash.sha256}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(hash.sha256);
                  setCopied(true);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? t("copied") : t("copy")}
              </Button>
            </dd>
          </dl>
        )}

        <Field label={t("compareWith")} hint={t("compareHint")}>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="1a3997c70c0f43f1…"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </Field>

        {compare !== undefined && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
              compare === true && "bg-green-50 text-green-800",
              compare === false && "bg-red-50 text-red-800",
              compare === null && "bg-amber-50 text-amber-800"
            )}
          >
            {compare === true ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {compare === true ? t("verifyMatch") : compare === false ? t("verifyMismatch") : t("shaMissing")}
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-gray-400">
          <Hash className="h-3.5 w-3.5" />
          {t("shaToolNote")}
        </p>
      </Card>
    </div>
  );
}
