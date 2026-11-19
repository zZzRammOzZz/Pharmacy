import { createPrivateKey, generateKeyPairSync, sign } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { Injectable } from "@nestjs/common";
import {
  canonicalPayload,
  type LicenseFile,
  type LicensePayload,
} from "@pharmacyos/license-sdk";
import path from "path";

@Injectable()
export class LicenseKeysService {
  private readonly privateKeyPem: string;
  readonly publicKeyPem: string;

  constructor() {
    const dir = path.join(process.cwd(), "data", "keys");
    mkdirSync(dir, { recursive: true });
    const privatePath = path.join(dir, "license-private.pem");
    const publicPath = path.join(dir, "license-public.pem");
    if (!existsSync(privatePath) || !existsSync(publicPath)) {
      const pair = generateKeyPairSync("ed25519");
      writeFileSync(privatePath, pair.privateKey.export({ type: "pkcs8", format: "pem" }));
      writeFileSync(publicPath, pair.publicKey.export({ type: "spki", format: "pem" }));
    }
    this.privateKeyPem = readFileSync(privatePath, "utf8");
    this.publicKeyPem = readFileSync(publicPath, "utf8");
  }

  sign(payload: LicensePayload): LicenseFile {
    const signature = sign(
      null,
      Buffer.from(canonicalPayload(payload)),
      createPrivateKey(this.privateKeyPem),
    ).toString("base64");
    return { format: "pharmacyos-license-v1", payload, signature };
  }
}
