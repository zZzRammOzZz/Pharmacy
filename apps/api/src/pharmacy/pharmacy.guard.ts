import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { decodeLicenseToken, verifyLicense } from "@pharmacyos/license-sdk";
import { LicenseKeysService } from "../license/license-keys.service";
import { PrismaService } from "../prisma/prisma.module";
import { STAFF_PERMISSIONS } from "./dto";

export interface StaffPrincipal {
  sub: string;
  aud: "staff";
  tenantId: string;
  role: string;
  email: string;
  name: string;
  permissions: string[];
  features: string[];
  seats: number;
  plan: string;
  licenseKeyId: string;
  branchId: string | null;
}

@Injectable()
export class PharmacyGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly keys: LicenseKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = String(request.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException("Sign in required");

    let payload: StaffPrincipal;
    try {
      payload = await this.jwt.verifyAsync(match[1]);
    } catch {
      throw new UnauthorizedException("Session expired");
    }
    if (payload.aud !== "staff") throw new UnauthorizedException("Sign in required");

    const token = request.headers["x-license-token"];
    if (!token || typeof token !== "string") {
      throw new UnauthorizedException("License token required");
    }

    const [license, staff] = await Promise.all([
      loadActiveLicense(this.prisma, this.keys, token, payload.tenantId),
      this.prisma.tenantUser.findFirst({
        where: { id: payload.sub, tenantId: payload.tenantId },
        select: { role: true, name: true, email: true, permissions: true, branchId: true },
      }),
    ]);
    if (!staff) throw new UnauthorizedException("Sign in required");
    const branchId = await activeBranch(this.prisma, license.features, payload.tenantId, staff, request.headers["x-branch-id"]);
    request.user = {
      ...payload,
      role: staff.role,
      name: staff.name,
      email: staff.email,
      permissions: staffPermissions(staff.role, staff.permissions),
      features: license.features,
      seats: license.seats,
      plan: license.plan,
      licenseKeyId: license.keyId,
      branchId,
    } satisfies StaffPrincipal;
    return true;
  }
}

export async function loadActiveLicense(
  prisma: PrismaService,
  keys: LicenseKeysService,
  token: string,
  tenantId?: string,
) {
  let file;
  try {
    file = decodeLicenseToken(token);
  } catch {
    throw new UnauthorizedException("License token is not readable");
  }
  const checked = verifyLicense(file, keys.publicKeyPem);
  if (!checked.ok) throw new UnauthorizedException(checked.reason);

  const row = await prisma.license.findUnique({
    where: { keyId: checked.payload.keyId },
    include: { tenant: true },
  });
  if (!row || row.revokedAt) throw new UnauthorizedException("License has been revoked");
  if (row.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException("License has expired");
  if (tenantId && row.tenantId !== tenantId) {
    throw new UnauthorizedException("License does not match this pharmacy");
  }
  if (row.tenant.status !== "active") throw new ForbiddenException("This pharmacy is suspended");
  if (checked.payload.tenantId !== row.tenantId) {
    throw new UnauthorizedException("License does not match this pharmacy");
  }
  return {
    ...row,
    features: JSON.parse(row.features) as string[],
  };
}

async function activeBranch(
  prisma: PrismaService,
  features: string[],
  tenantId: string,
  staff: { role: string; branchId: string | null },
  header: unknown,
) {
  if (!features.includes("branches")) return null;
  if (staff.branchId) return staff.branchId;
  const requested = typeof header === "string" ? header : "";
  if (staff.role === "owner" && requested === "all") return null;
  const branches = await prisma.branch.findMany({ where: { tenantId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (branches.some((branch) => branch.id === requested)) return requested;
  return branches[0]?.id || null;
}

export function assertFeature(user: StaffPrincipal, feature: string) {
  if (!user.features.includes(feature)) {
    throw new ForbiddenException(`This license does not include ${feature}`);
  }
}

export function assertRole(user: StaffPrincipal, roles: string[]) {
  if (!roles.includes(user.role)) {
    throw new ForbiddenException("Your role cannot do that");
  }
}

export function staffPermissions(role: string, stored?: string | null) {
  if (role === "owner") return [...STAFF_PERMISSIONS];
  try {
    const parsed = JSON.parse(stored || "[]");
    if (!Array.isArray(parsed)) return [];
    return STAFF_PERMISSIONS.filter((key) => parsed.includes(key));
  } catch {
    return [];
  }
}

export function assertPermission(user: StaffPrincipal, permission: string) {
  if (user.role === "owner" || user.permissions.includes(permission)) return;
  throw new ForbiddenException("The owner has not given you that access");
}
