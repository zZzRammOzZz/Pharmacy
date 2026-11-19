import { createPublicKey, verify } from "crypto";

export const LICENSE_FORMAT = "pharmacyos-license-v1" as const;

export const PLANS = {
  standard: {
    label: "Standard",
    seats: 5,
    features: ["inventory", "sales", "patients"],
  },
  professional: {
    label: "Professional",
    seats: 15,
    features: ["inventory", "sales", "patients", "prescriptions", "suppliers"],
  },
} as const;

export type PlanId = keyof typeof PLANS;
export type Feature = (typeof PLANS)[PlanId]["features"][number];

export interface LicensePayload {
  keyId: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  plan: PlanId;
  features: string[];
  seats: number;
  issuedAt: string;
  expiresAt: string;
}

export interface LicenseFile {
  format: typeof LICENSE_FORMAT;
  payload: LicensePayload;
  signature: string;
}

export type LicenseCheck =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: string };

export function canonicalPayload(payload: LicensePayload): string {
  const ordered: LicensePayload = {
    keyId: payload.keyId,
    tenantId: payload.tenantId,
    tenantCode: payload.tenantCode,
    tenantName: payload.tenantName,
    plan: payload.plan,
    features: [...payload.features],
    seats: payload.seats,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
  return JSON.stringify(ordered);
}

export function encodeLicenseToken(file: LicenseFile): string {
  return Buffer.from(JSON.stringify(file), "utf8").toString("base64url");
}

export function decodeLicenseToken(token: string): LicenseFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new Error("License token is not readable");
  }
  if (!isLicenseFile(parsed)) {
    throw new Error("License token has the wrong shape");
  }
  return parsed;
}

export function verifyLicense(
  file: LicenseFile,
  publicKeyPem: string,
  now: Date = new Date(),
): LicenseCheck {
  if (!file || file.format !== LICENSE_FORMAT || !file.payload || !file.signature) {
    return { ok: false, reason: "Unsupported license file" };
  }

  const payload = file.payload;
  if (!payload.keyId || !payload.tenantId || !payload.expiresAt) {
    return { ok: false, reason: "License is missing required fields" };
  }

  let signatureOk = false;
  try {
    signatureOk = verify(
      null,
      Buffer.from(canonicalPayload(payload)),
      createPublicKey(publicKeyPem),
      Buffer.from(file.signature, "base64"),
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return { ok: false, reason: "License signature is not valid" };
  }

  const expires = new Date(payload.expiresAt);
  if (Number.isNaN(expires.getTime())) {
    return { ok: false, reason: "License expiry is not a valid date" };
  }
  if (expires.getTime() <= now.getTime()) {
    return { ok: false, reason: "License has expired" };
  }

  return { ok: true, payload };
}

function isLicenseFile(value: unknown): value is LicenseFile {
  if (!value || typeof value !== "object") return false;
  const file = value as LicenseFile;
  return file.format === LICENSE_FORMAT && !!file.payload && typeof file.signature === "string";
}
