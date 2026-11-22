import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { encodeLicenseToken } from "@pharmacyos/license-sdk";
import { LicenseKeysService } from "../license/license-keys.service";
import { licenseFile } from "../platform/licenses.controller";
import { PrismaService } from "../prisma/prisma.module";
import {
  CreateMedicineDto,
  UpdateMedicineDto,
  CreatePatientDto,
  CreatePrescriptionDto,
  UpdatePatientDto,
  UpdateSupplierDto,
  AdjustmentDto,
  CreatePurchaseDto,
  UpdatePurchaseDto,
  UpdateWasteDto,
  AccountPaymentDto,
  CreateSaleDto,
  RefundAllDto,
  RefundSaleDto,
  ReplaceSaleDto,
  SetRateDto,
  TakePaymentDto,
  CreateStaffDto,
  UpdateStaffDto,
  CreateSupplierDto,
  WasteDto,
  PharmacyLoginDto,
  ReceiveStockDto,
} from "./dto";
import { assertFeature, assertPermission, assertRole, loadActiveLicense, staffPermissions, StaffPrincipal } from "./pharmacy.guard";

const TILL_ROLES = ["owner", "manager", "pharmacist", "cashier"];

type OrderLine = {
  medicineId: string;
  name: string;
  strength: string | null;
  inDate: number;
  reorderLevel: number;
  sold: number;
  daysCover: number | null;
  orderQty: number;
  costCents: number;
  lineCents: number;
  reason: "reorder" | "fast" | "both";
};

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly keys: LicenseKeysService,
  ) {}

  async login(body: PharmacyLoginDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: body.tenantCode.toLowerCase() } });
    if (!tenant) throw new UnauthorizedException("Pharmacy, email, or password is incorrect");
    const license = await loadActiveLicense(this.prisma, this.keys, body.licenseToken, tenant.id);
    const user = await this.prisma.tenantUser.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: body.email.toLowerCase() } },
    });
    const valid = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException("Pharmacy, email, or password is incorrect");

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      aud: "staff",
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    await this.prisma.staffLog.create({
      data: { tenantId: tenant.id, staffId: user.id, action: "login", summary: "Signed in." },
    }).catch(() => undefined);
    return {
      accessToken,
      licenseToken: encodeLicenseToken(licenseFile(license)),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant: { id: tenant.id, name: tenant.name, code: tenant.code },
        permissions: staffPermissions(user.role, user.permissions),
      },
      license: {
        keyId: license.keyId,
        plan: license.plan,
        seats: license.seats,
        features: license.features,
        expiresAt: license.expiresAt,
      },
      branches: license.features.includes("branches")
        ? await this.prisma.branch.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })
        : [],
    };
  }

  async logout(user: StaffPrincipal) {
    await this.wrote(user, "logout", "Signed out.");
    return { ok: true };
  }

  async bootstrap(user: StaffPrincipal) {
    const today = { gte: startOfToday() };
    const seesMain = user.role === "owner" || user.permissions.includes("mainReading");
    const mine = seesMain ? {} : { staffId: user.sub };
    const settled = { tenantId: user.tenantId, paymentMethod: { not: "credit" }, ...mine, ...this.place(user) };
    const [medicines, patientCount, pendingPrescriptions, receiptsToday, salesToday, adjustmentsToday, accountToday, rate] = await Promise.all([
      this.medicines(user),
      this.prisma.patient.count({ where: { tenantId: user.tenantId } }),
      this.prisma.prescription.count({ where: { tenantId: user.tenantId, status: "pending" } }),
      this.prisma.sale.count({ where: { tenantId: user.tenantId, createdAt: today, ...mine, ...this.place(user) } }),
      this.prisma.sale.aggregate({
        where: { ...settled, createdAt: today },
        _sum: { totalCents: true },
      }),
      this.prisma.saleEvent.aggregate({
        where: { tenantId: user.tenantId, createdAt: today, ...mine, ...this.place(user), sale: { paymentMethod: { not: "credit" } } },
        _sum: { amountCents: true },
      }),
      this.prisma.accountPayment.aggregate({
        where: { tenantId: user.tenantId, createdAt: today, ...mine, ...this.place(user) },
        _sum: { amountCents: true },
      }),
      this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { llPerUsd: true } }),
    ]);
    return {
      medicines,
      lowStock: medicines.filter((medicine) => medicine.onHand <= medicine.reorderLevel),
      expired: medicines.flatMap((medicine) =>
        medicine.batches
          .filter((batch) => batch.quantity > 0 && batch.expiryDate.getTime() < Date.now())
          .map((batch) => ({ medicine: medicine.name, ...batch, expiryStatus: "expired" })),
      ),
      expiring: medicines.flatMap((medicine) =>
        medicine.batches
          .filter((batch) => {
            const days = (batch.expiryDate.getTime() - Date.now()) / 86400000;
            return batch.quantity > 0 && days >= 0 && days <= 90;
          })
          .map((batch) => ({
            medicine: medicine.name,
            ...batch,
            expiryStatus: (batch.expiryDate.getTime() - Date.now()) / 86400000 <= 30 ? "critical" : "soon",
          })),
      ),
      patientCount,
      pendingPrescriptions,
      llPerUsd: rate?.llPerUsd || 0,
      agedCount: (await this.aged(user)).length,
      supplierAgedCount: user.features.includes("suppliers") ? (await this.supplierAged(user)).length : 0,
      orderCount: user.features.includes("suppliers") ? (await this.orderList(user)).count : 0,
      branches: user.features.includes("branches")
        ? await this.prisma.branch.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })
        : [],
      me: { role: user.role, permissions: user.permissions, features: user.features, plan: user.plan, seats: user.seats },
      salesToday: {
        count: receiptsToday,
        totalCents: (salesToday._sum.totalCents || 0) + (adjustmentsToday._sum.amountCents || 0) + (accountToday._sum.amountCents || 0),
      },
    };
  }

  async medicines(user: StaffPrincipal) {
    assertFeature(user, "inventory");
    const rows = await this.prisma.medicine.findMany({
      where: { tenantId: user.tenantId },
      include: { batches: { where: this.place(user), orderBy: { expiryDate: "asc" } } },
      orderBy: { name: "asc" },
    });
    return rows.map(presentMedicine);
  }

  async createMedicine(user: StaffPrincipal, body: CreateMedicineDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const sku = body.sku.trim().toUpperCase();
    const existing = await this.prisma.medicine.findUnique({
      where: { tenantId_sku: { tenantId: user.tenantId, sku } },
    });
    if (existing) throw new ConflictException("SKU already exists in this pharmacy");
    const barcode = cleanCode(body.barcode);
    if (barcode) {
      const coded = await this.prisma.medicine.findFirst({ where: { tenantId: user.tenantId, barcode } });
      if (coded) throw new ConflictException("That barcode is already on another medicine");
    }
    return this.prisma.medicine.create({
      data: {
        tenantId: user.tenantId,
        sku,
        barcode,
        medicineType: body.medicineType || "tablet",
        name: body.name.trim(),
        genericName: body.genericName?.trim(),
        form: body.form?.trim(),
        strength: body.strength?.trim(),
        unitPriceCents: body.unitPriceCents,
        reorderLevel: body.reorderLevel ?? 10,
      },
    });
  }

  async updateMedicine(user: StaffPrincipal, id: string, body: UpdateMedicineDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const medicine = await this.ownedMedicine(user.tenantId, id);
    const data: {
      name?: string;
      sku?: string;
      barcode?: string | null;
      medicineType?: string;
      genericName?: string | null;
      strength?: string | null;
      unitPriceCents?: number;
      reorderLevel?: number;
    } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.sku !== undefined) {
      const sku = body.sku.trim().toUpperCase();
      const clash = await this.prisma.medicine.findUnique({ where: { tenantId_sku: { tenantId: user.tenantId, sku } } });
      if (clash && clash.id !== medicine.id) throw new ConflictException("SKU already exists in this pharmacy");
      data.sku = sku;
    }
    if (body.barcode !== undefined) {
      const barcode = cleanCode(body.barcode);
      if (barcode) {
        const coded = await this.prisma.medicine.findFirst({ where: { tenantId: user.tenantId, barcode } });
        if (coded && coded.id !== medicine.id) throw new ConflictException("That barcode is already on another medicine");
      }
      data.barcode = barcode;
    }
    if (body.medicineType !== undefined) data.medicineType = body.medicineType;
    if (body.genericName !== undefined) data.genericName = blank(body.genericName);
    if (body.strength !== undefined) data.strength = blank(body.strength);
    if (body.unitPriceCents !== undefined) data.unitPriceCents = body.unitPriceCents;
    if (body.reorderLevel !== undefined) data.reorderLevel = body.reorderLevel;
    return this.prisma.medicine.update({ where: { id: medicine.id }, data });
  }

  async receiveStock(user: StaffPrincipal, body: ReceiveStockDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const medicine = await this.ownedMedicine(user.tenantId, body.medicineId);
    const branchId = this.requireBranch(user);
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          medicineId: medicine.id,
          batchNumber: body.batchNumber.trim(),
          serialNumber: cleanCode(body.serialNumber),
          quantity: body.quantity,
          expiryDate: parseExpiry(body.expiryDate),
          costCents: body.costCents,
          supplierId: body.supplierId,
        },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          medicineId: medicine.id,
          batchId: batch.id,
          branchId,
          kind: "purchase",
          quantity: body.quantity,
          reason: "goods in",
        },
      });
      return batch;
    });
  }

  async purchases(user: StaffPrincipal) {
    assertFeature(user, "inventory");
    return this.prisma.purchase.findMany({
      where: { tenantId: user.tenantId, ...this.place(user) },
      include: {
        supplier: { select: { id: true, name: true } },
        payments: { select: { amountCents: true } },
        lines: { include: { medicine: true, batch: { select: { quantity: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }

  async createPurchase(user: StaffPrincipal, body: CreatePurchaseDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const branchId = this.requireBranch(user);
    const saved = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          supplierId: body.supplierId || null,
          reference: body.reference.trim(),
          notes: body.notes?.trim(),
        },
      });
      for (const line of body.lines) {
        const medicine = await tx.medicine.findFirst({ where: { id: line.medicineId, tenantId: user.tenantId } });
        if (!medicine) throw new NotFoundException("Medicine not found");
        const serialNumber = cleanCode(line.serialNumber);
        if (serialNumber) {
          const clash = await tx.stockBatch.findFirst({ where: { tenantId: user.tenantId, serialNumber } });
          if (clash) throw new ConflictException(`Serial ${serialNumber} is already on a batch`);
        }
        const batch = await tx.stockBatch.create({
          data: {
            tenantId: user.tenantId,
            branchId,
            medicineId: medicine.id,
            batchNumber: line.batchNumber.trim(),
            serialNumber,
            quantity: line.quantity,
            expiryDate: parseExpiry(line.expiryDate),
            costCents: line.costCents,
            supplierId: body.supplierId || null,
          },
        });
        await tx.purchaseLine.create({
          data: {
            purchaseId: purchase.id,
            medicineId: medicine.id,
            batchId: batch.id,
            quantity: line.quantity,
            costCents: line.costCents,
            batchNumber: line.batchNumber.trim(),
            serialNumber,
            expiryDate: parseExpiry(line.expiryDate),
          },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
          medicineId: medicine.id,
          batchId: batch.id,
          branchId,
          kind: "purchase",
          quantity: line.quantity,
            reason: "purchase",
            note: body.reference.trim(),
          },
        });
      }
      return tx.purchase.findUnique({
        where: { id: purchase.id },
        include: { lines: { include: { medicine: true } } },
      });
    });
    const packs = saved?.lines.reduce((sum, line) => sum + line.quantity, 0) || 0;
    await this.wrote(user, "purchase", `Received invoice ${body.reference.trim()}, ${packs === 1 ? "1 pack" : `${packs} packs`}.`);
    return saved;
  }

  async updatePurchase(user: StaffPrincipal, id: string, body: UpdatePurchaseDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "manager"]);
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, tenantId: user.tenantId, ...this.place(user) },
      include: { lines: { include: { batch: true } }, payments: { select: { amountCents: true } } },
    });
    if (!purchase) throw new NotFoundException("Delivery not found");
    if (body.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId: user.tenantId } });
      if (!supplier) throw new NotFoundException("Supplier not found");
    }
    const seen = new Set<string>();
    for (const line of body.lines) {
      if (seen.has(line.id)) throw new BadRequestException("Each pack can only appear once.");
      seen.add(line.id);
      if (!purchase.lines.some((existing) => existing.id === line.id)) throw new BadRequestException("That pack is not on this delivery.");
    }
    const paid = purchase.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const nextTotal = body.lines.reduce((sum, line) => sum + line.quantity * line.costCents, 0);
    if (nextTotal < paid) throw new BadRequestException(`This invoice already has $${(paid / 100).toFixed(2)} paid against it. The corrected total has to stay at least that.`);
    const reference = body.reference.trim();
    const supplierId = body.supplierId || null;
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { reference, supplierId, notes: body.notes?.trim() || null },
      });
      for (const existing of purchase.lines) {
        const next = body.lines.find((line) => line.id === existing.id);
        if (!next) {
          await this.removePurchaseLine(tx, user.tenantId, existing);
          continue;
        }
        const expiry = parseExpiry(next.expiryDate);
        if (Number.isNaN(expiry.getTime())) throw new BadRequestException("Enter a real expiry date");
        const medicineId = next.medicineId;
        if (medicineId !== existing.medicineId) {
          const medicine = await tx.medicine.findFirst({ where: { id: medicineId, tenantId: user.tenantId } });
          if (!medicine) throw new NotFoundException("Medicine not found");
          if (!(await this.packUntouched(tx, existing))) {
            throw new BadRequestException("Some of this pack has already moved, so the medicine stays as it was received.");
          }
        }
        const delta = next.quantity - existing.quantity;
        if (existing.batch.quantity + delta < 0) {
          const floor = existing.quantity - existing.batch.quantity;
          throw new BadRequestException(`${existing.batchNumber} already has stock that left the shelf. The quantity has to stay at least ${Math.max(floor, 1)}.`);
        }
        const serialNumber = cleanCode(next.serialNumber);
        if (serialNumber && serialNumber !== existing.serialNumber) {
          const clash = await tx.stockBatch.findFirst({ where: { tenantId: user.tenantId, serialNumber, NOT: { id: existing.batchId } } });
          if (clash) throw new ConflictException(`Serial ${serialNumber} is already on a batch`);
        }
        await tx.stockBatch.update({
          where: { id: existing.batchId },
          data: {
            medicineId,
            quantity: existing.batch.quantity + delta,
            costCents: next.costCents,
            expiryDate: expiry,
            batchNumber: next.batchNumber.trim(),
            serialNumber,
            supplierId,
          },
        });
        await tx.purchaseLine.update({
          where: { id: existing.id },
          data: {
            medicineId,
            quantity: next.quantity,
            costCents: next.costCents,
            expiryDate: expiry,
            batchNumber: next.batchNumber.trim(),
            serialNumber,
          },
        });
        await tx.stockMovement.updateMany({
          where: { tenantId: user.tenantId, batchId: existing.batchId, kind: "purchase" },
          data: { medicineId, quantity: next.quantity, note: reference },
        });
      }
      return tx.purchase.findUnique({
        where: { id: purchase.id },
        include: { supplier: { select: { id: true, name: true } }, lines: { include: { medicine: true } } },
      });
    });
    await this.wrote(user, "correction", `Corrected invoice ${reference}.`);
    return saved;
  }

  async movements(user: StaffPrincipal, kind?: string) {
    assertFeature(user, "inventory");
    return this.prisma.stockMovement.findMany({
      where: { tenantId: user.tenantId, ...this.place(user), ...(kind ? { kind } : {}) },
      include: { medicine: true, batch: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
  }

  async adjust(user: StaffPrincipal, body: AdjustmentDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const batch = await this.ownedBatch(user.tenantId, body.batchId, user.branchId);
    const next = batch.quantity + body.quantityDelta;
    if (next < 0) throw new BadRequestException("That would take the batch below zero");
    const nextExpiry = body.expiryDate ? parseExpiry(body.expiryDate) : null;
    if (nextExpiry && Number.isNaN(nextExpiry.getTime())) throw new BadRequestException("Enter a real expiry date");
    const expiryChanged = Boolean(nextExpiry && !sameDay(batch.expiryDate, nextExpiry));
    if (body.quantityDelta === 0 && !expiryChanged) throw new BadRequestException("That matches the shelf. Nothing to record.");
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { quantity: next, ...(expiryChanged && nextExpiry ? { expiryDate: nextExpiry } : {}) },
      });
      return tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          branchId: batch.branchId,
          kind: "adjustment",
          quantity: body.quantityDelta,
          reason: body.reason,
          note: body.note?.trim(),
          ...(expiryChanged && nextExpiry ? { expiryFrom: batch.expiryDate, expiryTo: nextExpiry } : {}),
        },
        include: { medicine: true, batch: true },
      });
    });
    const change = body.quantityDelta === 0 ? "expiry updated" : body.quantityDelta > 0 ? `added ${body.quantityDelta}` : `removed ${-body.quantityDelta}`;
    await this.wrote(user, "adjustment", `Adjusted ${saved.medicine.name} ${saved.batch.batchNumber}, ${change}${expiryChanged && body.quantityDelta !== 0 ? ", expiry updated" : ""}.`);
    return saved;
  }

  async waste(user: StaffPrincipal, body: WasteDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const batch = await this.ownedBatch(user.tenantId, body.batchId, user.branchId);
    if (body.quantity > batch.quantity) throw new BadRequestException("Waste quantity is higher than the batch");
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: batch.quantity - body.quantity } });
      return tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          branchId: batch.branchId,
          kind: "waste",
          quantity: -body.quantity,
          reason: body.reason,
          note: body.note?.trim(),
        },
        include: { medicine: true, batch: true },
      });
    });
    await this.wrote(user, "waste", `Wrote off ${body.quantity} of ${saved.medicine.name} ${saved.batch.batchNumber}, ${body.reason}.`);
    return saved;
  }

  async updateWaste(user: StaffPrincipal, id: string, body: UpdateWasteDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "manager"]);
    const movement = await this.prisma.stockMovement.findFirst({
      where: { id, tenantId: user.tenantId, kind: "waste", ...this.place(user) },
      include: { batch: true },
    });
    if (!movement) throw new NotFoundException("Waste record not found");
    const written = -movement.quantity;
    const targetId = body.batchId || movement.batchId;
    const target = targetId === movement.batchId ? movement.batch : await this.ownedBatch(user.tenantId, targetId, user.branchId);
    if (targetId === movement.batchId) {
      const next = movement.batch.quantity - (body.quantity - written);
      if (next < 0) throw new BadRequestException("That is more than this pack has on the shelf.");
    } else if (body.quantity > target.quantity) {
      throw new BadRequestException("That is more than the new pack has on the shelf.");
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      if (targetId === movement.batchId) {
        await tx.stockBatch.update({
          where: { id: movement.batchId },
          data: { quantity: movement.batch.quantity - (body.quantity - written) },
        });
      } else {
        await tx.stockBatch.update({ where: { id: movement.batchId }, data: { quantity: movement.batch.quantity + written } });
        await tx.stockBatch.update({ where: { id: target.id }, data: { quantity: target.quantity - body.quantity } });
      }
      return tx.stockMovement.update({
        where: { id: movement.id },
        data: {
          batchId: target.id,
          medicineId: target.medicineId,
          quantity: -body.quantity,
          reason: body.reason,
          note: body.note?.trim() || null,
        },
        include: { medicine: true, batch: true },
      });
    });
    await this.wrote(user, "correction", `Corrected a write-off of ${saved.medicine.name} to ${body.quantity}, ${body.reason}.`);
    return saved;
  }

  async patients(user: StaffPrincipal) {
    assertFeature(user, "patients");
    return this.prisma.patient.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: "asc" },
    });
  }

  async createPatient(user: StaffPrincipal, body: CreatePatientDto) {
    assertFeature(user, "patients");
    assertRole(user, TILL_ROLES);
    return this.prisma.patient.create({
      data: {
        tenantId: user.tenantId,
        name: body.name.trim(),
        phone: blank(body.phone),
        sex: body.sex || null,
        dateOfBirth: body.dateOfBirth ? parseCalendar(body.dateOfBirth) : null,
        nationalId: blank(body.nationalId),
        address: blank(body.address),
        allergies: blank(body.allergies),
        notes: blank(body.notes),
      },
    });
  }

  async patientProfile(user: StaffPrincipal, id: string) {
    assertFeature(user, "patients");
    const patient = await this.ownedPatient(user.tenantId, id);
    const [sales, ledger, payments, paymentSum, prescriptions] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId: user.tenantId, patientId: id },
        include: saleDetail,
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      this.prisma.sale.findMany({
        where: { tenantId: user.tenantId, patientId: id },
        select: { paymentMethod: true, totalCents: true, events: { select: { amountCents: true } } },
      }),
      this.prisma.accountPayment.findMany({
        where: { tenantId: user.tenantId, patientId: id },
        include: { lines: { include: { sale: { select: { receiptNo: true, createdAt: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.accountPayment.aggregate({
        where: { tenantId: user.tenantId, patientId: id },
        _sum: { amountCents: true },
      }),
      user.features.includes("prescriptions")
        ? this.prisma.prescription.findMany({
            where: { tenantId: user.tenantId, patientId: id },
            include: { items: { include: { medicine: true } } },
            orderBy: { createdAt: "desc" },
            take: 12,
          })
        : Promise.resolve([]),
    ]);
    const received = paymentSum._sum.amountCents || 0;
    const settledNet = ledger.filter((sale) => sale.paymentMethod !== "credit").reduce((sum, sale) => sum + netOf(sale), 0);
    const creditNet = ledger.filter((sale) => sale.paymentMethod === "credit").reduce((sum, sale) => sum + netOf(sale), 0);
    return {
      ...patient,
      sales,
      payments,
      prescriptions,
      saleCount: ledger.length,
      spentCents: settledNet + received,
      owedCents: creditNet - received,
    };
  }

  async updatePatient(user: StaffPrincipal, id: string, body: UpdatePatientDto) {
    assertFeature(user, "patients");
    assertRole(user, TILL_ROLES);
    await this.ownedPatient(user.tenantId, id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.phone !== undefined ? { phone: blank(body.phone) } : {}),
        ...(body.sex !== undefined ? { sex: body.sex || null } : {}),
        ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth ? parseCalendar(body.dateOfBirth) : null } : {}),
        ...(body.nationalId !== undefined ? { nationalId: blank(body.nationalId) } : {}),
        ...(body.address !== undefined ? { address: blank(body.address) } : {}),
        ...(body.allergies !== undefined ? { allergies: blank(body.allergies) } : {}),
        ...(body.notes !== undefined ? { notes: blank(body.notes) } : {}),
      },
    });
  }

  async prescriptions(user: StaffPrincipal) {
    assertFeature(user, "prescriptions");
    return this.prisma.prescription.findMany({
      where: { tenantId: user.tenantId },
      include: { patient: true, items: { include: { medicine: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPrescription(user: StaffPrincipal, body: CreatePrescriptionDto) {
    assertFeature(user, "prescriptions");
    assertRole(user, ["owner", "pharmacist"]);
    await this.ownedPatient(user.tenantId, body.patientId);
    for (const item of body.items) await this.ownedMedicine(user.tenantId, item.medicineId);
    return this.prisma.prescription.create({
      data: {
        tenantId: user.tenantId,
        patientId: body.patientId,
        doctorName: body.doctorName,
        notes: body.notes,
        items: {
          create: body.items.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            dosage: item.dosage,
          })),
        },
      },
      include: { patient: true, items: { include: { medicine: true } } },
    });
  }

  async updatePrescription(user: StaffPrincipal, id: string, body: CreatePrescriptionDto) {
    assertFeature(user, "prescriptions");
    assertRole(user, ["owner", "pharmacist"]);
    const existing = await this.prisma.prescription.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException("Prescription not found");
    if (existing.status !== "pending") throw new BadRequestException("A dispensed prescription cannot be changed");
    await this.ownedPatient(user.tenantId, body.patientId);
    for (const item of body.items) await this.ownedMedicine(user.tenantId, item.medicineId);
    return this.prisma.$transaction(async (tx) => {
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });
      return tx.prescription.update({
        where: { id },
        data: {
          patientId: body.patientId,
          doctorName: body.doctorName?.trim() || null,
          notes: body.notes?.trim() || null,
          items: {
            create: body.items.map((item) => ({
              medicineId: item.medicineId,
              quantity: item.quantity,
              dosage: item.dosage?.trim() || null,
            })),
          },
        },
        include: { patient: true, items: { include: { medicine: true } } },
      });
    });
  }

  async dispense(user: StaffPrincipal, id: string, body: TakePaymentDto = {}) {
    assertFeature(user, "prescriptions");
    assertRole(user, ["owner", "pharmacist"]);
    return this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { items: { include: { medicine: true } } },
      });
      if (!prescription) throw new NotFoundException("Prescription not found");
      if (prescription.status !== "pending") throw new BadRequestException("Prescription is already closed");
      const saleItems = [];
      for (const item of prescription.items) {
        const takes = await consumeStock(tx, user.tenantId, item.medicineId, item.quantity, "sale", undefined, this.requireBranch(user));
        saleItems.push({
          medicineId: item.medicineId,
          quantity: item.quantity,
          unitPriceCents: item.medicine.unitPriceCents,
          lineCents: item.medicine.unitPriceCents * item.quantity,
          batches: { create: takes },
        });
      }
      const totalCents = saleItems.reduce((sum, item) => sum + item.lineCents, 0);
      const tender = await paymentFields(tx, user.tenantId, body.paymentMethod || "cash_usd", totalCents, prescription.patientId);
      const sale = await tx.sale.create({
        data: {
          tenantId: user.tenantId,
          branchId: this.requireBranch(user),
          staffId: user.sub,
          receiptNo: await nextReceipt(tx, user.tenantId),
          patientId: prescription.patientId,
          totalCents,
          ...tender,
          items: { create: saleItems },
        },
      });
      await tx.prescription.update({ where: { id }, data: { status: "dispensed" } });
      return sale;
    });
  }

  async sales(user: StaffPrincipal) {
    assertFeature(user, "sales");
    return this.prisma.sale.findMany({
      where: { tenantId: user.tenantId, ...this.place(user) },
      include: saleDetail,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async sale(user: StaffPrincipal, id: string) {
    assertFeature(user, "sales");
    return this.ownedSale(user.tenantId, id);
  }

  async createSale(user: StaffPrincipal, body: CreateSaleDto) {
    assertFeature(user, "sales");
    assertRole(user, TILL_ROLES);
    if (body.patientId) await this.ownedPatient(user.tenantId, body.patientId);
    return this.prisma.$transaction(async (tx) => {
      const saleItems = [];
      for (const item of body.items) {
        const medicine = await tx.medicine.findFirst({
          where: { id: item.medicineId, tenantId: user.tenantId },
        });
        if (!medicine) throw new NotFoundException("Medicine not found");
        const takes = await consumeStock(tx, user.tenantId, medicine.id, item.quantity, "sale", undefined, this.requireBranch(user));
        saleItems.push({
          medicineId: medicine.id,
          quantity: item.quantity,
          unitPriceCents: medicine.unitPriceCents,
          lineCents: medicine.unitPriceCents * item.quantity,
          batches: { create: takes },
        });
      }
      const totalCents = saleItems.reduce((sum, item) => sum + item.lineCents, 0);
      const tender = await paymentFields(tx, user.tenantId, body.paymentMethod || "cash_usd", totalCents, body.patientId);
      return tx.sale.create({
        data: {
          tenantId: user.tenantId,
          branchId: this.requireBranch(user),
          staffId: user.sub,
          receiptNo: await nextReceipt(tx, user.tenantId),
          patientId: body.patientId,
          totalCents,
          ...tender,
          items: { create: saleItems },
        },
        include: saleDetail,
      });
    });
  }

  async till(user: StaffPrincipal) {
    assertFeature(user, "sales");
    if (user.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: user.branchId, tenantId: user.tenantId }, select: { llPerUsd: true } });
      return { llPerUsd: branch?.llPerUsd || 0 };
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { llPerUsd: true } });
    return { llPerUsd: tenant?.llPerUsd || 0 };
  }

  async setTill(user: StaffPrincipal, body: SetRateDto) {
    assertFeature(user, "sales");
    assertRole(user, TILL_ROLES);
    if (user.branchId) {
      await this.prisma.branch.updateMany({ where: { id: user.branchId, tenantId: user.tenantId }, data: { llPerUsd: body.llPerUsd } });
      return { llPerUsd: body.llPerUsd };
    }
    await this.prisma.tenant.update({ where: { id: user.tenantId }, data: { llPerUsd: body.llPerUsd } });
    return { llPerUsd: body.llPerUsd };
  }

  async receivePayment(user: StaffPrincipal, patientId: string, body: AccountPaymentDto) {
    assertFeature(user, "sales");
    assertRole(user, TILL_ROLES);
    const patient = await this.ownedPatient(user.tenantId, patientId);
    const closing = await this.prisma.$transaction(async (tx) => {
      const open = await openCredit(tx, user.tenantId, patientId, this.requireBranch(user));
      const owed = open.reduce((sum, row) => sum + row.openCents, 0);
      if (owed < 1) throw new BadRequestException("This client has nothing on account.");
      if (body.amountCents > owed) throw new BadRequestException("That is more than this client owes.");
      const applied = allocateCredit(open, body.amountCents);
      const tender = await paymentFields(tx, user.tenantId, body.method, body.amountCents, patientId);
      const payment = await tx.accountPayment.create({
        data: {
          tenantId: user.tenantId,
          branchId: this.requireBranch(user),
          staffId: user.sub,
          patientId,
          receiptNo: await nextClosing(tx, user.tenantId),
          method: tender.paymentMethod,
          amountCents: body.amountCents,
          llPerUsd: tender.llPerUsd,
          llAmount: tender.llAmount,
          note: blank(body.note),
          lines: { create: applied.map((line) => ({ saleId: line.saleId, amountCents: line.amountCents })) },
        },
        include: { lines: { include: { sale: { select: { receiptNo: true, createdAt: true } } } } },
      });
      return {
        receiptNo: payment.receiptNo,
        method: payment.method,
        amountCents: payment.amountCents,
        llPerUsd: payment.llPerUsd,
        llAmount: payment.llAmount,
        note: payment.note,
        createdAt: payment.createdAt,
        patient: { name: patient.name },
        lines: payment.lines.map((line) => ({
          receiptNo: line.sale.receiptNo,
          createdAt: line.sale.createdAt,
          amountCents: line.amountCents,
        })),
        balanceCents: owed - body.amountCents,
      };
    });
    return { ...(await this.patientProfile(user, patientId)), closing };
  }

  async aged(user: StaffPrincipal) {
    assertFeature(user, "patients");
    assertFeature(user, "sales");
    const [sales, payments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId: user.tenantId, ...this.place(user), paymentMethod: "credit", patientId: { not: null } },
        select: {
          id: true,
          receiptNo: true,
          createdAt: true,
          totalCents: true,
          patientId: true,
          patient: { select: { id: true, name: true, phone: true } },
          events: { select: { amountCents: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.accountPayment.findMany({
        where: { tenantId: user.tenantId, ...this.place(user) },
        select: { patientId: true, amountCents: true },
      }),
    ]);
    const paid = new Map<string, number>();
    for (const payment of payments) paid.set(payment.patientId, (paid.get(payment.patientId) || 0) + payment.amountCents);
    const grouped = new Map<string, typeof sales>();
    for (const sale of sales) {
      if (!sale.patientId) continue;
      const rows = grouped.get(sale.patientId) || [];
      rows.push(sale);
      grouped.set(sale.patientId, rows);
    }
    const now = Date.now();
    return [...grouped.entries()].map(([patientId, rows]) => {
      const buckets = { currentCents: 0, days31Cents: 0, days61Cents: 0, days91Cents: 0 };
      const open = unpaidCredit(rows, paid.get(patientId) || 0, now);
      for (const row of open) {
        const bucket = row.ageDays <= 30 ? "currentCents" : row.ageDays <= 60 ? "days31Cents" : row.ageDays <= 90 ? "days61Cents" : "days91Cents";
        buckets[bucket] += row.openCents;
      }
      const patient = rows[0].patient;
      return {
        id: patient?.id || patientId,
        name: patient?.name || "Client",
        phone: patient?.phone || null,
        ...buckets,
        totalCents: buckets.currentCents + buckets.days31Cents + buckets.days61Cents + buckets.days91Cents,
        open,
      };
    }).filter((client) => client.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents);
  }

  async refundAll(user: StaffPrincipal, id: string, body: RefundAllDto) {
    assertFeature(user, "sales");
    assertRole(user, TILL_ROLES);
    assertPermission(user, "refund");
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.ownedSale(user.tenantId, id, tx);
      const pending = sale.items
        .map((item) => ({ item, left: item.quantity - returnedQty(sale, item.id) }))
        .filter((row) => row.left > 0);
      if (pending.length === 0) throw new BadRequestException("Nothing on this receipt can be refunded");
      const lines = [];
      for (const row of pending) {
        await returnStock(tx, user.tenantId, row.item.medicineId, row.left, row.item.batches, sale.receiptNo, sale.branchId);
        lines.push({
          saleItemId: row.item.id,
          medicineId: row.item.medicineId,
          direction: "return",
          quantity: row.left,
          unitPriceCents: row.item.unitPriceCents,
          lineCents: -row.item.unitPriceCents * row.left,
        });
      }
      await tx.saleEvent.create({
        data: {
          tenantId: user.tenantId,
          branchId: sale.branchId,
          staffId: user.sub,
          saleId: sale.id,
          kind: "refund",
          note: blank(body.note),
          amountCents: lines.reduce((sum, line) => sum + line.lineCents, 0),
          lines: { create: lines },
        },
      });
      return this.ownedSale(user.tenantId, id, tx);
    });
  }

  async refundSale(user: StaffPrincipal, id: string, body: RefundSaleDto) {
    assertFeature(user, "sales");
    assertRole(user, TILL_ROLES);
    assertPermission(user, "refund");
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.ownedSale(user.tenantId, id, tx);
      const item = sale.items.find((line) => line.id === body.saleItemId);
      if (!item) throw new NotFoundException("That line is not on this receipt");
      const left = item.quantity - returnedQty(sale, item.id);
      if (body.quantity > left) throw new BadRequestException(left > 0 ? `Only ${left} can be refunded` : "That line is already fully refunded");
      await returnStock(tx, user.tenantId, item.medicineId, body.quantity, item.batches, sale.receiptNo, sale.branchId);
      await tx.saleEvent.create({
        data: {
          tenantId: user.tenantId,
          branchId: sale.branchId,
          staffId: user.sub,
          saleId: sale.id,
          kind: "refund",
          note: blank(body.note),
          amountCents: -item.unitPriceCents * body.quantity,
          lines: {
            create: {
              saleItemId: item.id,
              medicineId: item.medicineId,
              direction: "return",
              quantity: body.quantity,
              unitPriceCents: item.unitPriceCents,
              lineCents: -item.unitPriceCents * body.quantity,
            },
          },
        },
      });
      return this.ownedSale(user.tenantId, id, tx);
    });
  }

  async replaceSale(user: StaffPrincipal, id: string, body: ReplaceSaleDto) {
    assertFeature(user, "sales");
    assertRole(user, TILL_ROLES);
    assertPermission(user, "refund");
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.ownedSale(user.tenantId, id, tx);
      const item = sale.items.find((line) => line.id === body.saleItemId);
      if (!item) throw new NotFoundException("That line is not on this receipt");
      if (body.medicineId === item.medicineId) throw new BadRequestException("Choose a different medicine to replace it with");
      const left = item.quantity - returnedQty(sale, item.id);
      if (body.quantity > left) throw new BadRequestException(left > 0 ? `Only ${left} can be replaced` : "That line is already fully returned");
      const medicine = await tx.medicine.findFirst({ where: { id: body.medicineId, tenantId: user.tenantId } });
      if (!medicine) throw new NotFoundException("Medicine not found");
      await returnStock(tx, user.tenantId, item.medicineId, body.quantity, item.batches, sale.receiptNo, sale.branchId);
      const takes = await consumeStock(tx, user.tenantId, medicine.id, body.replacementQuantity, "replace", sale.receiptNo, sale.branchId);
      const returnedCents = item.unitPriceCents * body.quantity;
      const givenCents = medicine.unitPriceCents * body.replacementQuantity;
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          medicineId: medicine.id,
          quantity: body.replacementQuantity,
          unitPriceCents: medicine.unitPriceCents,
          lineCents: givenCents,
          origin: "replace",
          batches: { create: takes },
        },
      });
      await tx.saleEvent.create({
        data: {
          tenantId: user.tenantId,
          branchId: sale.branchId,
          staffId: user.sub,
          saleId: sale.id,
          kind: "replace",
          note: blank(body.note),
          amountCents: givenCents - returnedCents,
          lines: {
            create: [
              {
                saleItemId: item.id,
                medicineId: item.medicineId,
                direction: "return",
                quantity: body.quantity,
                unitPriceCents: item.unitPriceCents,
                lineCents: -returnedCents,
              },
              {
                medicineId: medicine.id,
                direction: "give",
                quantity: body.replacementQuantity,
                unitPriceCents: medicine.unitPriceCents,
                lineCents: givenCents,
              },
            ],
          },
        },
      });
      return this.ownedSale(user.tenantId, id, tx);
    });
  }

  private async ownedSale(tenantId: string, id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const sale = await tx.sale.findFirst({ where: { id, tenantId }, include: saleDetail });
    if (!sale) throw new NotFoundException("Receipt not found");
    return sale;
  }

  async suppliers(user: StaffPrincipal) {
    assertFeature(user, "suppliers");
    return this.prisma.supplier.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } });
  }

  async createSupplier(user: StaffPrincipal, body: CreateSupplierDto) {
    assertFeature(user, "suppliers");
    assertRole(user, ["owner"]);
    return this.prisma.supplier.create({
      data: {
        tenantId: user.tenantId,
        name: body.name.trim(),
        contactName: blank(body.contactName),
        phone: blank(body.phone),
        email: body.email?.toLowerCase() || null,
        address: blank(body.address),
        taxNumber: blank(body.taxNumber),
        paymentTerms: blank(body.paymentTerms),
        notes: blank(body.notes),
      },
    });
  }

  async supplierProfile(user: StaffPrincipal, id: string) {
    assertFeature(user, "suppliers");
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    const [purchases, purchaseCount, open] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { tenantId: user.tenantId, supplierId: id },
        include: { lines: { include: { medicine: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      this.prisma.purchase.count({ where: { tenantId: user.tenantId, supplierId: id } }),
      openSupplierCredit(this.prisma, user.tenantId, id, user.branchId),
    ]);
    return {
      ...supplier,
      purchases,
      purchaseCount,
      owedCents: open.reduce((sum, row) => sum + row.openCents, 0),
    };
  }

  async updateSupplier(user: StaffPrincipal, id: string, body: UpdateSupplierDto) {
    assertFeature(user, "suppliers");
    assertRole(user, ["owner"]);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.contactName !== undefined ? { contactName: blank(body.contactName) } : {}),
        ...(body.phone !== undefined ? { phone: blank(body.phone) } : {}),
        ...(body.email !== undefined ? { email: body.email?.toLowerCase() || null } : {}),
        ...(body.address !== undefined ? { address: blank(body.address) } : {}),
        ...(body.taxNumber !== undefined ? { taxNumber: blank(body.taxNumber) } : {}),
        ...(body.paymentTerms !== undefined ? { paymentTerms: blank(body.paymentTerms) } : {}),
        ...(body.notes !== undefined ? { notes: blank(body.notes) } : {}),
      },
    });
  }

  async orderList(user: StaffPrincipal) {
    assertFeature(user, "suppliers");
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const now = Date.now();
    const [medicines, movements, purchases] = await Promise.all([
      this.prisma.medicine.findMany({
        where: { tenantId: user.tenantId },
        select: {
          id: true,
          name: true,
          strength: true,
          reorderLevel: true,
          batches: { where: this.place(user), select: { quantity: true, expiryDate: true, costCents: true, receivedAt: true } },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.stockMovement.findMany({
        where: { tenantId: user.tenantId, ...this.place(user), createdAt: { gte: since }, kind: { in: ["sale", "refund"] } },
        select: { medicineId: true, quantity: true },
      }),
      this.prisma.purchase.findMany({
        where: { tenantId: user.tenantId, ...this.place(user) },
        select: {
          supplierId: true,
          supplier: { select: { name: true } },
          lines: { select: { medicineId: true, costCents: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const soldByMedicine = new Map<string, number>();
    for (const movement of movements) {
      soldByMedicine.set(movement.medicineId, (soldByMedicine.get(movement.medicineId) || 0) - movement.quantity);
    }
    const lastSupply = new Map<string, { supplierId: string | null; supplierName: string; costCents: number }>();
    for (const purchase of purchases) {
      for (const line of purchase.lines) {
        if (lastSupply.has(line.medicineId)) continue;
        lastSupply.set(line.medicineId, {
          supplierId: purchase.supplierId,
          supplierName: purchase.supplier?.name || "No supplier yet",
          costCents: line.costCents,
        });
      }
    }
    const groups = new Map<string, { supplierId: string | null; supplierName: string; totalCents: number; lines: OrderLine[] }>();
    for (const medicine of medicines) {
      const inDate = medicine.batches.reduce((sum, batch) => sum + (batch.expiryDate.getTime() > now && batch.quantity > 0 ? batch.quantity : 0), 0);
      const sold = Math.max(0, soldByMedicine.get(medicine.id) || 0);
      const daily = sold / 30;
      const low = inDate <= medicine.reorderLevel;
      const fast = daily > 0 && inDate / daily < 14;
      if (!low && !fast) continue;
      const target = Math.max(medicine.reorderLevel, Math.ceil(daily * 30));
      let orderQty = Math.max(0, target - inDate);
      if (orderQty < 1) orderQty = Math.max(1, medicine.reorderLevel - inDate);
      const newest = [...medicine.batches].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
      const supply = lastSupply.get(medicine.id) || {
        supplierId: null,
        supplierName: "No supplier yet",
        costCents: newest?.costCents || 0,
      };
      const line: OrderLine = {
        medicineId: medicine.id,
        name: medicine.name,
        strength: medicine.strength,
        inDate,
        reorderLevel: medicine.reorderLevel,
        sold,
        daysCover: sold > 0 ? Math.round((inDate * 30) / sold) : null,
        orderQty,
        costCents: supply.costCents,
        lineCents: orderQty * supply.costCents,
        reason: low && fast ? "both" : fast ? "fast" : "reorder",
      };
      const key = supply.supplierId || "none";
      const group = groups.get(key) || { supplierId: supply.supplierId, supplierName: supply.supplierName, totalCents: 0, lines: [] };
      group.lines.push(line);
      group.totalCents += line.lineCents;
      groups.set(key, group);
    }
    const listed = [...groups.values()]
      .map((group) => ({
        ...group,
        lines: group.lines.sort((a, b) => (a.daysCover ?? 999) - (b.daysCover ?? 999) || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.supplierName.localeCompare(b.supplierName));
    return {
      windowDays: 30,
      count: listed.reduce((sum, group) => sum + group.lines.length, 0),
      totalCents: listed.reduce((sum, group) => sum + group.totalCents, 0),
      groups: listed,
    };
  }

  async supplierAged(user: StaffPrincipal) {
    assertFeature(user, "suppliers");
    const [purchases, payments] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { tenantId: user.tenantId, ...this.place(user), supplierId: { not: null } },
        select: {
          id: true,
          reference: true,
          createdAt: true,
          supplierId: true,
          supplier: { select: { id: true, name: true, phone: true } },
          lines: { select: { quantity: true, costCents: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.supplierPayment.findMany({
        where: { tenantId: user.tenantId, ...this.place(user) },
        select: { supplierId: true, amountCents: true },
      }),
    ]);
    const paid = new Map<string, number>();
    for (const payment of payments) paid.set(payment.supplierId, (paid.get(payment.supplierId) || 0) + payment.amountCents);
    const grouped = new Map<string, typeof purchases>();
    for (const purchase of purchases) {
      if (!purchase.supplierId) continue;
      const rows = grouped.get(purchase.supplierId) || [];
      rows.push(purchase);
      grouped.set(purchase.supplierId, rows);
    }
    const now = Date.now();
    return [...grouped.entries()].map(([supplierId, rows]) => {
      const buckets = { currentCents: 0, days31Cents: 0, days61Cents: 0, days91Cents: 0 };
      const open = unpaidInvoices(rows, paid.get(supplierId) || 0, now);
      for (const row of open) {
        const bucket = row.ageDays <= 30 ? "currentCents" : row.ageDays <= 60 ? "days31Cents" : row.ageDays <= 90 ? "days61Cents" : "days91Cents";
        buckets[bucket] += row.openCents;
      }
      const supplier = rows[0].supplier;
      return {
        id: supplier?.id || supplierId,
        name: supplier?.name || "Supplier",
        phone: supplier?.phone || null,
        ...buckets,
        totalCents: buckets.currentCents + buckets.days31Cents + buckets.days61Cents + buckets.days91Cents,
        open,
      };
    }).filter((supplier) => supplier.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents);
  }

  async paySupplier(user: StaffPrincipal, supplierId: string, body: AccountPaymentDto) {
    assertFeature(user, "suppliers");
    assertRole(user, ["owner", "manager"]);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId: user.tenantId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    const closing = await this.prisma.$transaction(async (tx) => {
      const open = await openSupplierCredit(tx, user.tenantId, supplierId, this.requireBranch(user));
      const owed = open.reduce((sum, row) => sum + row.openCents, 0);
      if (owed < 1) throw new BadRequestException("This supplier has nothing outstanding.");
      if (body.amountCents > owed) throw new BadRequestException("That is more than this supplier is owed.");
      const applied = allocateSupplier(open, body.amountCents);
      const tender = await paymentFields(tx, user.tenantId, body.method, body.amountCents);
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId: user.tenantId,
          branchId: this.requireBranch(user),
          staffId: user.sub,
          supplierId,
          receiptNo: await nextWholesaler(tx, user.tenantId),
          method: tender.paymentMethod,
          amountCents: body.amountCents,
          llPerUsd: tender.llPerUsd,
          llAmount: tender.llAmount,
          note: blank(body.note),
          lines: { create: applied.map((line) => ({ purchaseId: line.purchaseId, amountCents: line.amountCents })) },
        },
        include: { lines: { include: { purchase: { select: { reference: true, createdAt: true } } } } },
      });
      return {
        receiptNo: payment.receiptNo,
        method: payment.method,
        amountCents: payment.amountCents,
        llPerUsd: payment.llPerUsd,
        llAmount: payment.llAmount,
        note: payment.note,
        createdAt: payment.createdAt,
        supplier: { name: supplier.name },
        lines: payment.lines.map((line) => ({
          reference: line.purchase.reference,
          createdAt: line.purchase.createdAt,
          amountCents: line.amountCents,
        })),
        balanceCents: owed - body.amountCents,
      };
    });
    return { closing };
  }

  async staff(user: StaffPrincipal) {
    assertRole(user, ["owner"]);
    const people = await this.prisma.tenantUser.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true, branch: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
    return {
      seats: user.seats,
      used: people.length,
      staff: people.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        role: person.role,
        permissions: staffPermissions(person.role, person.permissions),
        branch: person.branch,
        createdAt: person.createdAt,
      })),
    };
  }

  async createStaff(user: StaffPrincipal, body: CreateStaffDto) {
    assertRole(user, ["owner"]);
    const count = await this.prisma.tenantUser.count({ where: { tenantId: user.tenantId } });
    if (count >= user.seats) {
      throw new ConflictException(`This license includes ${user.seats} seats`);
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    try {
      await this.prisma.tenantUser.create({
        data: {
          tenantId: user.tenantId,
          name: body.name.trim(),
          email: body.email.toLowerCase(),
          role: body.role,
          branchId: user.features.includes("branches") ? this.requireBranch(user) : null,
          permissions: JSON.stringify(staffPermissions(body.role, JSON.stringify(body.permissions))),
          passwordHash,
        },
      });
    } catch {
      throw new ConflictException("That email is already on the staff list");
    }
    return this.staff(user);
  }

  async updateStaff(user: StaffPrincipal, id: string, body: UpdateStaffDto) {
    assertRole(user, ["owner"]);
    const person = await this.prisma.tenantUser.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!person) throw new NotFoundException("That person is not on the staff list");
    if (person.role === "owner") throw new BadRequestException("The owner account keeps full access");
    await this.prisma.tenantUser.update({
      where: { id: person.id },
      data: {
        role: body.role,
        permissions: JSON.stringify(staffPermissions(body.role, JSON.stringify(body.permissions))),
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      },
    });
    return this.staff(user);
  }

  async reading(user: StaffPrincipal, all = false) {
    assertFeature(user, "sales");
    const combined = all && user.role === "owner" && user.features.includes("branches");
    const place = combined ? {} : this.place(user);
    const today = { gte: startOfToday() };
    const tenantId = user.tenantId;
    const staffWhere = combined || !user.branchId ? { tenantId } : { tenantId, OR: [{ branchId: user.branchId }, { branchId: null }] };
    const [people, saleMoney, saleCount, eventMoney, accountMoney, sales, events, payments] = await Promise.all([
      this.prisma.tenantUser.findMany({ where: staffWhere, select: { id: true, name: true, role: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } }),
      this.prisma.sale.groupBy({
        by: ["staffId"],
        where: { tenantId, ...place, createdAt: today, paymentMethod: { not: "credit" } },
        _sum: { totalCents: true },
      }),
      this.prisma.sale.groupBy({ by: ["staffId"], where: { tenantId, ...place, createdAt: today }, _count: { _all: true } }),
      this.prisma.saleEvent.groupBy({
        by: ["staffId"],
        where: { tenantId, ...place, createdAt: today, sale: { paymentMethod: { not: "credit" } } },
        _sum: { amountCents: true },
      }),
      this.prisma.accountPayment.groupBy({ by: ["staffId"], where: { tenantId, ...place, createdAt: today }, _sum: { amountCents: true } }),
      this.prisma.sale.findMany({
        where: { tenantId, ...place, createdAt: today },
        select: {
          receiptNo: true,
          totalCents: true,
          paymentMethod: true,
          createdAt: true,
          staff: { select: { name: true } },
          patient: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      this.prisma.saleEvent.findMany({
        where: { tenantId, ...place, createdAt: today },
        select: {
          kind: true,
          amountCents: true,
          createdAt: true,
          staff: { select: { name: true } },
          sale: { select: { receiptNo: true, paymentMethod: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      this.prisma.accountPayment.findMany({
        where: { tenantId, ...place, createdAt: today },
        select: {
          receiptNo: true,
          amountCents: true,
          method: true,
          createdAt: true,
          staff: { select: { name: true } },
          patient: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);
    const takingsOf = (id: string | null) =>
      (saleMoney.find((row) => row.staffId === id)?._sum.totalCents || 0) +
      (eventMoney.find((row) => row.staffId === id)?._sum.amountCents || 0) +
      (accountMoney.find((row) => row.staffId === id)?._sum.amountCents || 0);
    const receiptsOf = (id: string | null) => saleCount.find((row) => row.staffId === id)?._count._all || 0;
    const minePerson = people.find((person) => person.id === user.sub);
    const mine = {
      id: user.sub,
      name: minePerson?.name || user.name,
      role: minePerson?.role || user.role,
      receipts: receiptsOf(user.sub),
      takingsCents: takingsOf(user.sub),
    };
    if (user.role !== "owner" && !user.permissions.includes("mainReading")) return { mine, main: null };
    const staff = people.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      branch: person.branch?.name || null,
      receipts: receiptsOf(person.id),
      takingsCents: takingsOf(person.id),
    }));
    if (receiptsOf(null) || takingsOf(null)) {
      staff.push({ id: "unassigned", name: "Not recorded", role: "", branch: null, receipts: receiptsOf(null), takingsCents: takingsOf(null) });
    }
    const lines = [
      ...sales.map((sale) => ({
        at: sale.createdAt,
        kind: "sale",
        who: sale.staff?.name || "Not recorded",
        label: `${sale.receiptNo}${sale.patient?.name ? ` · ${sale.patient.name}` : ""}`,
        amountCents: sale.totalCents,
        method: sale.paymentMethod,
      })),
      ...events.map((event) => ({
        at: event.createdAt,
        kind: event.kind,
        who: event.staff?.name || "Not recorded",
        label: event.sale.receiptNo,
        amountCents: event.amountCents,
        method: event.sale.paymentMethod,
      })),
      ...payments.map((payment) => ({
        at: payment.createdAt,
        kind: "close",
        who: payment.staff?.name || "Not recorded",
        label: `${payment.receiptNo || "Account"}${payment.patient?.name ? ` · ${payment.patient.name}` : ""}`,
        amountCents: payment.amountCents,
        method: payment.method,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 40);
    return {
      scope: combined ? "all" : "branch",
      mine,
      main: {
        receipts: staff.reduce((sum, row) => sum + row.receipts, 0),
        takingsCents: staff.reduce((sum, row) => sum + row.takingsCents, 0),
        staff,
        lines,
      },
    };
  }

  async employeeLog(user: StaffPrincipal, range?: string, fromText?: string, toText?: string, staffId?: string) {
    assertRole(user, ["owner"]);
    const window = reportWindow(range, fromText, toText);
    const span = { gte: window.from, lt: window.to };
    const tenantId = user.tenantId;
    const person = staffId ? { staffId } : {};
    const [people, logs, sales, events, payments, supplierPayments] = await Promise.all([
      this.prisma.tenantUser.findMany({ where: { tenantId }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
      this.prisma.staffLog.findMany({
        where: { tenantId, createdAt: span, ...person },
        include: { staff: { select: { name: true, role: true } }, branch: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
      this.prisma.sale.findMany({
        where: { tenantId, createdAt: span, ...person },
        select: {
          createdAt: true,
          receiptNo: true,
          totalCents: true,
          paymentMethod: true,
          staffId: true,
          staff: { select: { name: true, role: true } },
          branch: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
      this.prisma.saleEvent.findMany({
        where: { tenantId, createdAt: span, kind: { in: ["refund", "replace"] }, ...person },
        select: {
          createdAt: true,
          kind: true,
          amountCents: true,
          staffId: true,
          staff: { select: { name: true, role: true } },
          branch: { select: { name: true } },
          sale: { select: { receiptNo: true } },
          lines: { select: { quantity: true, direction: true, medicine: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
      this.prisma.accountPayment.findMany({
        where: { tenantId, createdAt: span, ...person },
        select: {
          createdAt: true,
          amountCents: true,
          receiptNo: true,
          staffId: true,
          staff: { select: { name: true, role: true } },
          branch: { select: { name: true } },
          patient: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
      this.prisma.supplierPayment.findMany({
        where: { tenantId, createdAt: span, ...person },
        select: {
          createdAt: true,
          amountCents: true,
          receiptNo: true,
          staffId: true,
          staff: { select: { name: true, role: true } },
          branch: { select: { name: true } },
          supplier: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
    ]);
    if (staffId && !people.some((row) => row.id === staffId)) throw new BadRequestException("That employee is not on this pharmacy.");
    const entries = [
      ...logs.map((row) => entry(row.createdAt, row.action, row.summary, row.staffId, row.staff, row.branch?.name)),
      ...sales.map((row) => entry(row.createdAt, "sale", `Sold ${row.receiptNo} for ${dollars(row.totalCents)}, ${tenderLabel(row.paymentMethod)}.`, row.staffId, row.staff, row.branch?.name)),
      ...events.map((row) => {
        const names = row.lines.filter((line) => line.direction === "return").map((line) => `${line.medicine.name} × ${line.quantity}`).join(", ");
        const detail = names ? `, ${names}` : "";
        const summary = row.kind === "refund"
          ? `Refunded ${dollars(Math.abs(row.amountCents))} on ${row.sale.receiptNo}${detail}.`
          : `Replaced a line on ${row.sale.receiptNo}${detail}.`;
        return entry(row.createdAt, row.kind, summary, row.staffId, row.staff, row.branch?.name);
      }),
      ...payments.map((row) => entry(row.createdAt, "payment", `Took ${dollars(row.amountCents)} from ${row.patient.name}${row.receiptNo ? ` (${row.receiptNo})` : ""}.`, row.staffId, row.staff, row.branch?.name)),
      ...supplierPayments.map((row) => entry(row.createdAt, "payment", `Paid ${row.supplier.name} ${dollars(row.amountCents)}${row.receiptNo ? ` (${row.receiptNo})` : ""}.`, row.staffId, row.staff, row.branch?.name)),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      range: window.range,
      from: window.from,
      to: window.to,
      staff: people,
      signIns: entries.filter((row) => row.action === "login").length,
      signOuts: entries.filter((row) => row.action === "logout").length,
      sales: entries.filter((row) => row.action === "sale").length,
      refunds: entries.filter((row) => row.action === "refund").length,
      entries: entries.slice(0, 400),
    };
  }

  async reports(user: StaffPrincipal, range?: string, fromText?: string, toText?: string) {
    assertFeature(user, "reports");
    assertPermission(user, "reports");
    const window = reportWindow(range, fromText, toText);
    const span = { gte: window.from, lt: window.to };
    const tenantId = user.tenantId;
    const [people, sales, events, payments, movements, expiredBatches, aged] = await Promise.all([
      this.prisma.tenantUser.findMany({ where: { tenantId }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
      this.prisma.sale.findMany({
        where: { tenantId, ...this.place(user), createdAt: span },
        select: {
          staffId: true,
          totalCents: true,
          paymentMethod: true,
          createdAt: true,
          staff: { select: { name: true, role: true } },
          items: { select: { medicineId: true, quantity: true, lineCents: true, medicine: { select: { name: true } } } },
        },
      }),
      this.prisma.saleEvent.findMany({
        where: { tenantId, ...this.place(user), createdAt: span },
        select: {
          kind: true,
          amountCents: true,
          staffId: true,
          createdAt: true,
          staff: { select: { name: true, role: true } },
          sale: { select: { paymentMethod: true } },
          lines: { select: { medicineId: true, direction: true, quantity: true, lineCents: true, medicine: { select: { name: true } } } },
        },
      }),
      this.prisma.accountPayment.findMany({
        where: { tenantId, ...this.place(user), createdAt: span },
        select: { amountCents: true, staffId: true, createdAt: true, staff: { select: { name: true, role: true } } },
      }),
      this.prisma.stockMovement.findMany({
        where: { tenantId, ...this.place(user), createdAt: span, kind: { in: ["sale", "refund", "waste"] } },
        select: { kind: true, quantity: true, reason: true, createdAt: true, medicineId: true, medicine: { select: { name: true } }, batch: { select: { costCents: true } } },
      }),
      this.prisma.stockBatch.findMany({
        where: { tenantId, ...this.place(user), quantity: { gt: 0 }, expiryDate: { lt: new Date() } },
        select: { quantity: true, costCents: true },
      }),
      user.features.includes("patients") ? this.aged(user) : Promise.resolve([]),
    ]);

    const products = new Map<string, { id: string; name: string; quantity: number; soldCents: number; costCents: number }>();
    const touchProduct = (id: string, name: string) => {
      const row = products.get(id) || { id, name, quantity: 0, soldCents: 0, costCents: 0 };
      products.set(id, row);
      return row;
    };
    const staff = new Map<string, { id: string; name: string; role: string; receipts: number; soldCents: number; collectedCents: number }>();
    for (const person of people) staff.set(person.id, { id: person.id, name: person.name, role: person.role, receipts: 0, soldCents: 0, collectedCents: 0 });
    const touchStaff = (id: string | null, name?: string | null, role?: string | null) => {
      const key = id || "unassigned";
      const row = staff.get(key) || { id: key, name: name || "Not recorded", role: role || "", receipts: 0, soldCents: 0, collectedCents: 0 };
      staff.set(key, row);
      return row;
    };
    const days = new Map<string, { date: string; soldCents: number; collectedCents: number; costCents: number; receipts: number }>();
    const touchDay = (date: Date) => {
      const key = dayKey(date);
      const row = days.get(key) || { date: key, soldCents: 0, collectedCents: 0, costCents: 0, receipts: 0 };
      days.set(key, row);
      return row;
    };
    const spanDays = Math.round((window.to.getTime() - window.from.getTime()) / 86400000);
    if (spanDays <= 62) {
      for (let cursor = new Date(window.from); cursor < window.to; cursor.setDate(cursor.getDate() + 1)) touchDay(cursor);
    }
    const tenders = new Map<string, { method: string; receipts: number; cents: number }>();
    const touchTender = (method: string, cents: number, receipt: boolean) => {
      const row = tenders.get(method) || { method, receipts: 0, cents: 0 };
      row.cents += cents;
      if (receipt) row.receipts += 1;
      tenders.set(method, row);
    };

    let soldCents = 0;
    let collectedCents = 0;
    let costCents = 0;
    let refundCents = 0;
    let expiredWasteCents = 0;
    let otherWasteCents = 0;

    for (const sale of sales) {
      soldCents += sale.totalCents;
      const collected = sale.paymentMethod === "credit" ? 0 : sale.totalCents;
      collectedCents += collected;
      const day = touchDay(sale.createdAt);
      day.soldCents += sale.totalCents;
      day.collectedCents += collected;
      day.receipts += 1;
      const person = touchStaff(sale.staffId, sale.staff?.name, sale.staff?.role);
      person.receipts += 1;
      person.soldCents += sale.totalCents;
      person.collectedCents += collected;
      touchTender(sale.paymentMethod, sale.totalCents, true);
      for (const item of sale.items) {
        const product = touchProduct(item.medicineId, item.medicine.name);
        product.quantity += item.quantity;
        product.soldCents += item.lineCents;
      }
    }
    for (const event of events) {
      soldCents += event.amountCents;
      const collected = event.sale.paymentMethod === "credit" ? 0 : event.amountCents;
      collectedCents += collected;
      if (event.kind === "refund") refundCents += event.amountCents;
      const day = touchDay(event.createdAt);
      day.soldCents += event.amountCents;
      day.collectedCents += collected;
      const person = touchStaff(event.staffId, event.staff?.name, event.staff?.role);
      person.soldCents += event.amountCents;
      person.collectedCents += collected;
      touchTender(event.sale.paymentMethod, event.amountCents, false);
      for (const line of event.lines) {
        const product = touchProduct(line.medicineId, line.medicine.name);
        product.quantity += line.direction === "return" ? -line.quantity : line.quantity;
        product.soldCents += line.lineCents;
      }
    }
    for (const payment of payments) {
      collectedCents += payment.amountCents;
      touchDay(payment.createdAt).collectedCents += payment.amountCents;
      touchStaff(payment.staffId, payment.staff?.name, payment.staff?.role).collectedCents += payment.amountCents;
    }
    for (const movement of movements) {
      const packs = Math.abs(movement.quantity) * movement.batch.costCents;
      if (movement.kind === "waste") {
        if (movement.reason === "expired") expiredWasteCents += packs;
        else otherWasteCents += packs;
        continue;
      }
      const signed = movement.kind === "sale" ? packs : -packs;
      costCents += signed;
      touchDay(movement.createdAt).costCents += signed;
      touchProduct(movement.medicineId, movement.medicine.name).costCents += signed;
    }

    const byProduct = [...products.values()]
      .map((row) => ({ ...row, profitCents: row.soldCents - row.costCents }))
      .sort((a, b) => b.soldCents - a.soldCents)
      .slice(0, 15);
    const byStaff = [...staff.values()]
      .filter((row) => row.id !== "unassigned" || row.receipts || row.soldCents || row.collectedCents)
      .sort((a, b) => b.soldCents - a.soldCents || a.name.localeCompare(b.name));
    const byDay = [...days.values()]
      .filter((row) => spanDays <= 62 || row.receipts || row.soldCents || row.collectedCents || row.costCents)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({ ...row, profitCents: row.soldCents - row.costCents }));
    const profitCents = soldCents - costCents;
    const byMethod = [...tenders.values()].filter((row) => row.cents !== 0 || row.receipts > 0).sort((a, b) => b.cents - a.cents);
    const bestDay = [...byDay].sort((a, b) => b.soldCents - a.soldCents)[0];
    const topProduct = byProduct[0];
    const highlights = [
      `${sales.length} ${sales.length === 1 ? "receipt" : "receipts"}. Sold ${dollars(soldCents)} and collected ${dollars(collectedCents)}.`,
      `Profit is ${dollars(profitCents)}${soldCents > 0 ? `, ${Math.round((profitCents / soldCents) * 100)}% of what sold` : ""}.`,
      bestDay && bestDay.soldCents ? `The strongest day was ${writtenDay(bestDay.date)} at ${dollars(bestDay.soldCents)}.` : "",
      topProduct ? `${topProduct.name} led the shelf with ${topProduct.quantity} ${Math.abs(topProduct.quantity) === 1 ? "pack" : "packs"}.` : "",
      expiredWasteCents + otherWasteCents ? `Written off ${dollars(expiredWasteCents + otherWasteCents)}.` : "",
    ].filter(Boolean);
    return {
      range: window.range,
      from: window.from,
      to: window.to,
      soldCents,
      collectedCents,
      costCents,
      profitCents,
      margin: soldCents > 0 ? Math.round((profitCents / soldCents) * 100) : 0,
      receipts: sales.length,
      refundCents,
      expiredWasteCents,
      otherWasteCents,
      expiredOnShelfCents: expiredBatches.reduce((sum, batch) => sum + batch.quantity * batch.costCents, 0),
      openCreditCents: aged.reduce((sum, client) => sum + client.totalCents, 0),
      byDay,
      byProduct,
      byStaff,
      byMethod,
      highlights,
    };
  }

  async branches(user: StaffPrincipal) {
    assertFeature(user, "branches");
    return this.prisma.branch.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  }

  async createBranch(user: StaffPrincipal, name: string) {
    assertFeature(user, "branches");
    assertRole(user, ["owner"]);
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new BadRequestException("Give the branch a name.");
    try {
      return await this.prisma.branch.create({ data: { tenantId: user.tenantId, name: trimmed }, select: { id: true, name: true } });
    } catch {
      throw new ConflictException("That branch already exists");
    }
  }

  private async wrote(user: StaffPrincipal, action: string, summary: string) {
    await this.prisma.staffLog.create({
      data: { tenantId: user.tenantId, staffId: user.sub, branchId: user.branchId, action, summary },
    }).catch(() => undefined);
  }

  private place(user: StaffPrincipal) {
    if (!user.features.includes("branches") || !user.branchId) return {};
    return { branchId: user.branchId };
  }

  private requireBranch(user: StaffPrincipal) {
    if (!user.features.includes("branches")) return null;
    if (!user.branchId) throw new BadRequestException("Choose a branch before recording that.");
    return user.branchId;
  }

  private async ownedMedicine(tenantId: string, id: string) {
    const medicine = await this.prisma.medicine.findFirst({ where: { id, tenantId } });
    if (!medicine) throw new NotFoundException("Medicine not found");
    return medicine;
  }

  private async packUntouched(tx: Prisma.TransactionClient, line: { batchId: string; quantity: number; batch: { quantity: number } }) {
    const [sold, otherMoves] = await Promise.all([
      tx.saleLineBatch.count({ where: { batchId: line.batchId } }),
      tx.stockMovement.count({ where: { batchId: line.batchId, kind: { not: "purchase" } } }),
    ]);
    return sold === 0 && otherMoves === 0 && line.batch.quantity === line.quantity;
  }

  private async removePurchaseLine(
    tx: Prisma.TransactionClient,
    tenantId: string,
    line: { id: string; batchId: string; batchNumber: string; quantity: number; batch: { quantity: number } },
  ) {
    if (!(await this.packUntouched(tx, line))) {
      throw new BadRequestException(`${line.batchNumber} has already moved, so that pack stays on the delivery.`);
    }
    await tx.stockMovement.deleteMany({ where: { tenantId, batchId: line.batchId, kind: "purchase" } });
    await tx.purchaseLine.delete({ where: { id: line.id } });
    await tx.stockBatch.delete({ where: { id: line.batchId } });
  }

  private async ownedBatch(tenantId: string, id: string, branchId?: string | null) {
    const batch = await this.prisma.stockBatch.findFirst({ where: { id, tenantId, ...(branchId ? { branchId } : {}) } });
    if (!batch) throw new NotFoundException("Batch not found");
    return batch;
  }

  private async ownedPatient(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, tenantId } });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }
}

function presentMedicine<T extends { batches: { quantity: number; expiryDate: Date }[] }>(medicine: T) {
  const batches = medicine.batches.map((batch) => ({
    ...batch,
    expiryStatus: expiryStatus(batch.expiryDate),
    daysToExpiry: Math.ceil((batch.expiryDate.getTime() - Date.now()) / 86400000),
  }));
  const stocked = batches.filter((batch) => batch.quantity > 0);
  const nearest = [...stocked].sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())[0];
  return {
    ...medicine,
    batches,
    onHand: stocked.reduce((sum, batch) => sum + batch.quantity, 0),
    inDate: stocked.filter((batch) => batch.expiryStatus !== "expired").reduce((sum, batch) => sum + batch.quantity, 0),
    nearestExpiry: nearest?.expiryDate ?? null,
    expiryStatus: nearest?.expiryStatus ?? "none",
  } as T & {
    batches: (T["batches"][number] & { expiryStatus: string; daysToExpiry: number })[];
    onHand: number;
    inDate: number;
    nearestExpiry: Date | null;
    expiryStatus: string;
  };
}

function expiryStatus(date: Date) {
  const days = (date.getTime() - Date.now()) / 86400000;
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "soon";
  return "ok";
}

function blank(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseCalendar(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0);
  return new Date(value);
}

function parseExpiry(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59);
  return new Date(value);
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function cleanCode(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const saleDetail = {
  patient: true,
  items: { include: { medicine: true, batches: true } },
  events: {
    include: { lines: { include: { medicine: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.SaleInclude;

function unpaidCredit(
  sales: { id: string; receiptNo: string; createdAt: Date; totalCents: number; events: { amountCents: number }[] }[],
  paidCents: number,
  now = Date.now(),
) {
  let pool = paidCents;
  const open = [];
  for (const sale of sales) {
    const net = Math.max(0, netOf(sale));
    const covered = Math.min(pool, net);
    pool -= covered;
    const openCents = net - covered;
    if (openCents < 1) continue;
    open.push({
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      createdAt: sale.createdAt,
      openCents,
      ageDays: Math.max(0, Math.floor((now - sale.createdAt.getTime()) / 86400000)),
    });
  }
  return open;
}

function allocateCredit(open: { saleId: string; openCents: number }[], amount: number) {
  const lines = [];
  let left = amount;
  for (const row of open) {
    if (left < 1) break;
    const take = Math.min(row.openCents, left);
    if (take < 1) continue;
    lines.push({ saleId: row.saleId, amountCents: take });
    left -= take;
  }
  return lines;
}

async function openCredit(tx: Prisma.TransactionClient, tenantId: string, patientId: string, branchId?: string | null) {
  const place = branchId ? { branchId } : {};
  const [sales, paid] = await Promise.all([
    tx.sale.findMany({
      where: { tenantId, patientId, ...place, paymentMethod: "credit" },
      select: { id: true, receiptNo: true, createdAt: true, totalCents: true, events: { select: { amountCents: true } } },
      orderBy: { createdAt: "asc" },
    }),
    tx.accountPayment.aggregate({ where: { tenantId, patientId, ...place }, _sum: { amountCents: true } }),
  ]);
  return unpaidCredit(sales, paid._sum.amountCents || 0);
}

async function nextClosing(tx: Prisma.TransactionClient, tenantId: string) {
  const count = await tx.accountPayment.count({ where: { tenantId, receiptNo: { not: null } } });
  return `C-${String(count + 1).padStart(5, "0")}`;
}

function invoiceCents(lines: { quantity: number; costCents: number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.costCents, 0);
}

function unpaidInvoices(
  purchases: { id: string; reference: string; createdAt: Date; lines: { quantity: number; costCents: number }[] }[],
  paidCents: number,
  now = Date.now(),
) {
  let pool = paidCents;
  const open = [];
  for (const purchase of purchases) {
    const net = invoiceCents(purchase.lines);
    const covered = Math.min(pool, net);
    pool -= covered;
    const openCents = net - covered;
    if (openCents < 1) continue;
    open.push({
      purchaseId: purchase.id,
      reference: purchase.reference,
      createdAt: purchase.createdAt,
      openCents,
      ageDays: Math.max(0, Math.floor((now - purchase.createdAt.getTime()) / 86400000)),
    });
  }
  return open;
}

function allocateSupplier(open: { purchaseId: string; openCents: number }[], amount: number) {
  const lines = [];
  let left = amount;
  for (const row of open) {
    if (left < 1) break;
    const take = Math.min(row.openCents, left);
    if (take < 1) continue;
    lines.push({ purchaseId: row.purchaseId, amountCents: take });
    left -= take;
  }
  return lines;
}

async function openSupplierCredit(
  tx: { purchase: Prisma.TransactionClient["purchase"]; supplierPayment: Prisma.TransactionClient["supplierPayment"] },
  tenantId: string,
  supplierId: string,
  branchId?: string | null,
) {
  const place = branchId ? { branchId } : {};
  const [purchases, paid] = await Promise.all([
    tx.purchase.findMany({
      where: { tenantId, supplierId, ...place },
      select: { id: true, reference: true, createdAt: true, lines: { select: { quantity: true, costCents: true } } },
      orderBy: { createdAt: "asc" },
    }),
    tx.supplierPayment.aggregate({ where: { tenantId, supplierId, ...place }, _sum: { amountCents: true } }),
  ]);
  return unpaidInvoices(purchases, paid._sum.amountCents || 0);
}

async function nextWholesaler(tx: Prisma.TransactionClient, tenantId: string) {
  const count = await tx.supplierPayment.count({ where: { tenantId, receiptNo: { not: null } } });
  return `W-${String(count + 1).padStart(5, "0")}`;
}

function netOf(sale: { totalCents: number; events: { amountCents: number }[] }) {
  return sale.totalCents + sale.events.reduce((sum, event) => sum + event.amountCents, 0);
}

function liraOf(cents: number, rate: number) {
  return Math.round((cents / 100) * rate);
}

async function paymentFields(
  tx: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  method: string,
  totalCents: number,
  patientId?: string | null,
) {
  if (method === "credit" && !patientId) throw new BadRequestException("Choose a client to put this on account.");
  if (method !== "cash_ll") return { paymentMethod: method, llPerUsd: null as number | null, llAmount: null as number | null };
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { llPerUsd: true } });
  if (!tenant?.llPerUsd) throw new BadRequestException("Set how many lira equal one dollar before taking lira.");
  return { paymentMethod: method, llPerUsd: tenant.llPerUsd, llAmount: liraOf(totalCents, tenant.llPerUsd) };
}

function returnedQty(sale: { events: { lines: { saleItemId: string | null; direction: string; quantity: number }[] }[] }, saleItemId: string) {
  return sale.events.reduce(
    (sum, event) =>
      sum + event.lines.filter((line) => line.saleItemId === saleItemId && line.direction === "return").reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  );
}

async function consumeStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  medicineId: string,
  quantity: number,
  reason = "sale",
  note?: string,
  branchId?: string | null,
) {
  const batches = await tx.stockBatch.findMany({
    where: { tenantId, medicineId, quantity: { gt: 0 }, ...(branchId ? { branchId } : {}) },
    orderBy: { expiryDate: "asc" },
  });
  const now = new Date();
  const usable = batches.filter((batch) => batch.expiryDate.getTime() > now.getTime());
  let remaining = quantity;
  const takes: { batchId: string; quantity: number }[] = [];
  for (const batch of usable) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: batch.quantity - take } });
    await tx.stockMovement.create({
      data: {
        tenantId,
        medicineId,
        batchId: batch.id,
        branchId: branchId || null,
        kind: "sale",
        quantity: -take,
        reason,
        note,
      },
    });
    takes.push({ batchId: batch.id, quantity: take });
    remaining -= take;
  }
  if (remaining > 0) {
    const expiredLeft = batches.some((batch) => batch.expiryDate.getTime() <= now.getTime() && batch.quantity > 0);
    if (expiredLeft) {
      throw new BadRequestException("Not enough in-date stock. Expired packs have to be recorded as waste.");
    }
    throw new BadRequestException("Not enough stock to complete that");
  }
  return takes;
}

async function returnStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  medicineId: string,
  quantity: number,
  allocations: { id: string; batchId: string; quantity: number; returned: number }[],
  receiptNo: string,
  branchId?: string | null,
) {
  let remaining = quantity;
  for (const allocation of allocations) {
    const room = allocation.quantity - allocation.returned;
    if (room <= 0 || remaining <= 0) continue;
    const put = Math.min(room, remaining);
    await tx.stockBatch.update({ where: { id: allocation.batchId }, data: { quantity: { increment: put } } });
    await tx.saleLineBatch.update({ where: { id: allocation.id }, data: { returned: { increment: put } } });
    await tx.stockMovement.create({
      data: {
        tenantId,
        medicineId,
        batchId: allocation.batchId,
        branchId: branchId || null,
        kind: "refund",
        quantity: put,
        reason: "refund",
        note: receiptNo,
      },
    });
    remaining -= put;
  }
  if (remaining <= 0) return;
  const batches = await tx.stockBatch.findMany({ where: { tenantId, medicineId, ...(branchId ? { branchId } : {}) }, orderBy: { expiryDate: "asc" } });
  const now = Date.now();
  const target = batches.find((batch) => batch.expiryDate.getTime() > now) || batches[0];
  if (!target) throw new BadRequestException("There is no batch left to return this medicine to.");
  await tx.stockBatch.update({ where: { id: target.id }, data: { quantity: { increment: remaining } } });
  await tx.stockMovement.create({
    data: {
      tenantId,
      medicineId,
      batchId: target.id,
      branchId: branchId || null,
      kind: "refund",
      quantity: remaining,
      reason: "refund",
      note: receiptNo,
    },
  });
}

async function nextReceipt(tx: Prisma.TransactionClient, tenantId: string) {
  const count = await tx.sale.count({ where: { tenantId } });
  return `R-${String(count + 1).padStart(5, "0")}`;
}

function reportWindow(range: string | undefined, fromText?: string, toText?: string) {
  if (range === "custom") {
    if (!fromText || !toText) throw new BadRequestException("Choose a start date and an end date.");
    const from = parseDay(fromText);
    const end = parseDay(toText);
    if (from.getTime() > end.getTime()) throw new BadRequestException("The start date has to come first.");
    const to = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    if (to.getTime() - from.getTime() > 366 * 86400000) throw new BadRequestException("Choose a range of a year or less.");
    return { range: "custom" as const, from, to };
  }
  return {
    range: range === "month" ? ("month" as const) : ("today" as const),
    from: range === "month" ? startOfMonth() : startOfToday(),
    to: startOfTomorrow(),
  };
}

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BadRequestException("Enter a real date.");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(match[2]) - 1) throw new BadRequestException("Enter a real date.");
  return date;
}

function entry(
  at: Date,
  action: string,
  summary: string,
  staffId: string | null,
  staff: { name: string; role: string } | null,
  branch: string | null | undefined,
) {
  return { at: at.toISOString(), action, summary, staffId, name: staff?.name || "Someone", role: staff?.role || "", branch: branch || null };
}

function tenderLabel(method: string) {
  if (method === "cash_ll") return "cash LL";
  if (method === "card") return "card";
  if (method === "credit") return "on account";
  return "cash USD";
}

function dollars(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function writtenDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(year, (month || 1) - 1, day || 1));
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfTomorrow() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
