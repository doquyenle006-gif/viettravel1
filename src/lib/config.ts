import { useEffect, useState } from "react";
import { api } from "./api";
import type { PublicConfig } from "../types";

const FALLBACK: PublicConfig = {
  appName: "VietTrails",
  hotline: "1900 6868",
  supportEmail: "hotro@viettrails.vn",
  bank: { name: "", bin: "970407", accountName: "", accountNumber: "", branch: "" },
  paymentMethods: [],
  termsVersion: "2026-01",
  maxPaxOnline: 10,
  depositDefaultPercent: 30,
  fullRequiredDays: 7,
  balanceDueDays: 7,
  selfServiceMinDays: 4,
  passengerEditCutoffDays: 3,
  reviewWindowDays: 60,
  invoiceDeadlineDays: 7,
  refundSlaDays: 7,
  holdMinPaymentMinutes: 30,
  devOutbox: false,
  serverTime: new Date().toISOString(),
};

let cached: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

export function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(cached ?? FALLBACK);
  useEffect(() => {
    if (cached) return;
    inflight ??= api<PublicConfig>("/config/public").then((data) => {
      cached = data;
      return data;
    }).catch(() => FALLBACK);
    inflight.then((data) => setConfig(data));
  }, []);
  return config;
}
