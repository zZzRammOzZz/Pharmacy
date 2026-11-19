import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createPrivateKey } from "node:crypto";
import { describe, it } from "node:test";
import {
  canonicalPayload,
  decodeLicenseToken,
  encodeLicenseToken,
  verifyLicense,
  type LicensePayload,
} from "./index.ts";

function samplePayload(expiresAt: string): LicensePayload {
  return {
    keyId: "lic_test",
    tenantId: "tenant_1",
    tenantCode: "green-cross",
    tenantName: "Green Cross Pharmacy",
    plan: "standard",
    features: ["inventory", "sales", "patients"],
    seats: 5,
    issuedAt: "2026-11-09T00:00:00.000Z",
    expiresAt,
  };
}

describe("license sdk", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  function signPayload(payload: LicensePayload) {
    const signature = sign(
      null,
      Buffer.from(canonicalPayload(payload)),
      createPrivateKey(privateKeyPem),
    ).toString("base64");
    return {
      format: "pharmacyos-license-v1" as const,
      payload,
      signature,
    };
  }

  it("accepts a signed license that has not expired", () => {
    const file = signPayload(samplePayload("2027-11-09T00:00:00.000Z"));
    const result = verifyLicense(file, publicKeyPem, new Date("2026-11-09T12:00:00.000Z"));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.tenantCode, "green-cross");
  });

  it("rejects a tampered license", () => {
    const file = signPayload(samplePayload("2027-11-09T00:00:00.000Z"));
    file.payload.seats = 500;
    const result = verifyLicense(file, publicKeyPem, new Date("2026-11-09T12:00:00.000Z"));
    assert.equal(result.ok, false);
  });

  it("rejects an expired license", () => {
    const file = signPayload(samplePayload("2026-01-01T00:00:00.000Z"));
    const result = verifyLicense(file, publicKeyPem, new Date("2026-11-09T12:00:00.000Z"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /expired/i);
  });

  it("round-trips a license token", () => {
    const file = signPayload(samplePayload("2027-11-09T00:00:00.000Z"));
    const decoded = decodeLicenseToken(encodeLicenseToken(file));
    assert.equal(decoded.payload.keyId, "lic_test");
    assert.equal(verifyLicense(decoded, publicKeyPem).ok, true);
  });
});
