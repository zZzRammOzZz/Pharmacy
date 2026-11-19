import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.module";
import { CreateTenantDto, UpdateTenantDto } from "./dto";
import { PlatformGuard } from "./platform.guard";

@Controller("platform/tenants")
@UseGuards(PlatformGuard)
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        licenses: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { users: true, medicines: true } },
      },
    });
    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      code: tenant.code,
      email: tenant.email,
      phone: tenant.phone,
      address: tenant.address,
      status: tenant.status,
      createdAt: tenant.createdAt,
      users: tenant._count.users,
      medicines: tenant._count.medicines,
      license: tenant.licenses[0] ? presentLicense(tenant.licenses[0]) : null,
    }));
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        licenses: { orderBy: { createdAt: "desc" } },
        _count: { select: { medicines: true, patients: true, sales: true } },
      },
    });
    if (!tenant) throw new NotFoundException("Pharmacy not found");
    return {
      id: tenant.id,
      name: tenant.name,
      code: tenant.code,
      email: tenant.email,
      phone: tenant.phone,
      address: tenant.address,
      status: tenant.status,
      createdAt: tenant.createdAt,
      users: tenant.users,
      counts: tenant._count,
      licenses: tenant.licenses.map(presentLicense),
    };
  }

  @Post()
  async create(@Body() body: CreateTenantDto) {
    const code = body.code.toLowerCase();
    const existing = await this.prisma.tenant.findUnique({ where: { code } });
    if (existing) throw new ConflictException("A pharmacy with this code already exists");
    const passwordHash = await bcrypt.hash(body.ownerPassword, 10);
    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: body.name.trim(),
          code,
          email: body.email?.toLowerCase(),
          phone: body.phone,
          address: body.address,
          users: {
            create: {
              name: body.ownerName.trim(),
              email: body.ownerEmail.toLowerCase(),
              role: "owner",
              passwordHash,
            },
          },
        },
        include: { users: { select: { id: true, name: true, email: true, role: true } } },
      });
      return tenant;
    } catch {
      throw new ConflictException("Owner email is already used in this pharmacy");
    }
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Pharmacy not found");
    return this.prisma.tenant.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        email: body.email?.toLowerCase(),
        phone: body.phone,
        address: body.address,
        status: body.status,
      },
      select: { id: true, name: true, code: true, email: true, phone: true, address: true, status: true },
    });
  }
}

export function presentLicense(license: {
  id: string;
  keyId: string;
  plan: string;
  seats: number;
  features: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  tenantId?: string;
}) {
  const now = Date.now();
  const status = license.revokedAt
    ? "revoked"
    : license.expiresAt.getTime() <= now
      ? "expired"
      : "active";
  return {
    id: license.id,
    keyId: license.keyId,
    tenantId: license.tenantId,
    plan: license.plan,
    seats: license.seats,
    features: JSON.parse(license.features) as string[],
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
    revokedAt: license.revokedAt,
    status,
  };
}
