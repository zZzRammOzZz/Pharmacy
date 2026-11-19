import { randomBytes } from "crypto";
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { PLANS, encodeLicenseToken, type LicenseFile, type PlanId } from "@pharmacyos/license-sdk";
import { LicenseKeysService } from "../license/license-keys.service";
import { PrismaService } from "../prisma/prisma.module";
import { IssueLicenseDto } from "./dto";
import { PlatformGuard } from "./platform.guard";
import { presentLicense } from "./tenants.controller";

@Controller("platform")
@UseGuards(PlatformGuard)
export class LicensesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: LicenseKeysService,
  ) {}

  @Get("licenses")
  async list() {
    const licenses = await this.prisma.license.findMany({
      orderBy: { createdAt: "desc" },
      include: { tenant: { select: { id: true, name: true, code: true, status: true } } },
    });
    return licenses.map((license) => ({
      ...presentLicense(license),
      tenant: license.tenant,
    }));
  }

  @Post("tenants/:tenantId/licenses")
  async issue(@Param("tenantId") tenantId: string, @Body() body: IssueLicenseDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Pharmacy not found");
    const plan = (body.plan || "standard") as PlanId;
    const termMonths = body.termMonths ?? 12;
    const definition = PLANS[plan];
    const issuedAt = new Date();
    const expiresAt = addMonths(issuedAt, termMonths);
    const payload = {
      keyId: `lic_${randomBytes(9).toString("hex")}`,
      tenantId: tenant.id,
      tenantCode: tenant.code,
      tenantName: tenant.name,
      plan,
      features: [...definition.features],
      seats: body.seats ?? definition.seats,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const file = this.keys.sign(payload);
    const license = await this.prisma.license.create({
      data: {
        keyId: payload.keyId,
        tenantId: tenant.id,
        plan,
        seats: payload.seats,
        features: JSON.stringify(payload.features),
        issuedAt,
        expiresAt,
        payloadJson: JSON.stringify(payload),
        signature: file.signature,
      },
    });
    return presentLicense(license);
  }

  @Post("licenses/:id/revoke")
  async revoke(@Param("id") id: string) {
    const license = await this.prisma.license.findUnique({ where: { id } });
    if (!license) throw new NotFoundException("License not found");
    const updated = await this.prisma.license.update({
      where: { id },
      data: { revokedAt: license.revokedAt ?? new Date() },
    });
    return presentLicense(updated);
  }

  @Get("licenses/:id/download")
  async download(@Param("id") id: string, @Res() response: Response) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!license) throw new NotFoundException("License not found");
    const file = licenseFile(license);
    const filename = `${license.tenant.code}-${license.keyId}.lic`;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.send(JSON.stringify(file, null, 2));
  }
}

@Controller("license")
export class PublicLicenseController {
  constructor(private readonly keys: LicenseKeysService) {}

  @Get("public-key")
  publicKey() {
    return { publicKey: this.keys.publicKeyPem, format: "pharmacyos-license-v1" };
  }
}

export function licenseFile(license: { payloadJson: string; signature: string }): LicenseFile {
  return {
    format: "pharmacyos-license-v1",
    payload: JSON.parse(license.payloadJson),
    signature: license.signature,
  };
}

function addMonths(start: Date, months: number) {
  const next = new Date(start.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function licenseTokenFromRow(license: { payloadJson: string; signature: string }) {
  return encodeLicenseToken(licenseFile(license));
}
