import { Controller, Get, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.module";
import { PlatformGuard } from "./platform.guard";
import { presentLicense } from "./tenants.controller";

@Controller("platform/dashboard")
@UseGuards(PlatformGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async overview() {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [tenants, suspended, licenses, recent] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: "suspended" } }),
      this.prisma.license.findMany({ include: { tenant: { select: { name: true, code: true } } } }),
      this.prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { licenses: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    ]);
    const activeLicenses = licenses.filter((license) => !license.revokedAt && license.expiresAt > now);
    const expiringSoon = activeLicenses.filter((license) => license.expiresAt <= soon);
    return {
      tenants,
      suspended,
      activeLicenses: activeLicenses.length,
      expiringSoon: expiringSoon.length,
      recentTenants: recent.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        code: tenant.code,
        status: tenant.status,
        createdAt: tenant.createdAt,
        license: tenant.licenses[0] ? presentLicense(tenant.licenses[0]) : null,
      })),
      expiring: expiringSoon
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
        .slice(0, 6)
        .map((license) => ({
          ...presentLicense(license),
          tenant: license.tenant,
        })),
    };
  }
}
