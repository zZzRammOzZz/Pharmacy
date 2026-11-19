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
  CreatePatientDto,
  CreatePrescriptionDto,
  UpdatePatientDto,
  UpdateSupplierDto,
  AdjustmentDto,
  CreatePurchaseDto,
  CreateSaleDto,
  CreateStaffDto,
  CreateSupplierDto,
  WasteDto,
  PharmacyLoginDto,
  ReceiveStockDto,
} from "./dto";
import { assertFeature, assertRole, loadActiveLicense, StaffPrincipal } from "./pharmacy.guard";

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
    return {
      accessToken,
      licenseToken: encodeLicenseToken(licenseFile(license)),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant: { id: tenant.id, name: tenant.name, code: tenant.code },
      },
      license: {
        keyId: license.keyId,
        plan: license.plan,
        seats: license.seats,
        features: license.features,
        expiresAt: license.expiresAt,
      },
    };
  }

  async bootstrap(user: StaffPrincipal) {
    const [medicines, patientCount, pendingPrescriptions, salesToday] = await Promise.all([
      this.medicines(user),
      this.prisma.patient.count({ where: { tenantId: user.tenantId } }),
      this.prisma.prescription.count({ where: { tenantId: user.tenantId, status: "pending" } }),
      this.prisma.sale.aggregate({
        where: { tenantId: user.tenantId, createdAt: { gte: startOfToday() } },
        _sum: { totalCents: true },
        _count: true,
      }),
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
      salesToday: { count: salesToday._count, totalCents: salesToday._sum.totalCents || 0 },
    };
  }

  async medicines(user: StaffPrincipal) {
    assertFeature(user, "inventory");
    const rows = await this.prisma.medicine.findMany({
      where: { tenantId: user.tenantId },
      include: { batches: { orderBy: { expiryDate: "asc" } } },
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

  async receiveStock(user: StaffPrincipal, body: ReceiveStockDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const medicine = await this.ownedMedicine(user.tenantId, body.medicineId);
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          tenantId: user.tenantId,
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
      where: { tenantId: user.tenantId },
      include: { lines: { include: { medicine: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }

  async createPurchase(user: StaffPrincipal, body: CreatePurchaseDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          tenantId: user.tenantId,
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
  }

  async movements(user: StaffPrincipal, kind?: string) {
    assertFeature(user, "inventory");
    return this.prisma.stockMovement.findMany({
      where: { tenantId: user.tenantId, ...(kind ? { kind } : {}) },
      include: { medicine: true, batch: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
  }

  async adjust(user: StaffPrincipal, body: AdjustmentDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    if (body.quantityDelta === 0) throw new BadRequestException("Enter a quantity to add or remove");
    const batch = await this.ownedBatch(user.tenantId, body.batchId);
    const next = batch.quantity + body.quantityDelta;
    if (next < 0) throw new BadRequestException("That would take the batch below zero");
    return this.prisma.$transaction(async (tx) => {
      await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: next } });
      return tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          kind: "adjustment",
          quantity: body.quantityDelta,
          reason: body.reason,
          note: body.note?.trim(),
        },
        include: { medicine: true, batch: true },
      });
    });
  }

  async waste(user: StaffPrincipal, body: WasteDto) {
    assertFeature(user, "inventory");
    assertRole(user, ["owner", "pharmacist"]);
    const batch = await this.ownedBatch(user.tenantId, body.batchId);
    if (body.quantity > batch.quantity) throw new BadRequestException("Waste quantity is higher than the batch");
    return this.prisma.$transaction(async (tx) => {
      await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: batch.quantity - body.quantity } });
      return tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          kind: "waste",
          quantity: -body.quantity,
          reason: body.reason,
          note: body.note?.trim(),
        },
        include: { medicine: true, batch: true },
      });
    });
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
    assertRole(user, ["owner", "pharmacist", "cashier"]);
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
    const [sales, saleStats, prescriptions] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId: user.tenantId, patientId: id },
        include: { items: { include: { medicine: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      this.prisma.sale.aggregate({
        where: { tenantId: user.tenantId, patientId: id },
        _sum: { totalCents: true },
        _count: true,
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
    return {
      ...patient,
      sales,
      prescriptions,
      saleCount: saleStats._count,
      spentCents: saleStats._sum.totalCents || 0,
    };
  }

  async updatePatient(user: StaffPrincipal, id: string, body: UpdatePatientDto) {
    assertFeature(user, "patients");
    assertRole(user, ["owner", "pharmacist", "cashier"]);
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

  async dispense(user: StaffPrincipal, id: string) {
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
        await consumeStock(tx, user.tenantId, item.medicineId, item.quantity);
        saleItems.push({
          medicineId: item.medicineId,
          quantity: item.quantity,
          unitPriceCents: item.medicine.unitPriceCents,
          lineCents: item.medicine.unitPriceCents * item.quantity,
        });
      }
      const totalCents = saleItems.reduce((sum, item) => sum + item.lineCents, 0);
      const sale = await tx.sale.create({
        data: {
          tenantId: user.tenantId,
          receiptNo: await nextReceipt(tx, user.tenantId),
          patientId: prescription.patientId,
          totalCents,
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
      where: { tenantId: user.tenantId },
      include: { items: { include: { medicine: true } }, patient: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async createSale(user: StaffPrincipal, body: CreateSaleDto) {
    assertFeature(user, "sales");
    assertRole(user, ["owner", "pharmacist", "cashier"]);
    if (body.patientId) await this.ownedPatient(user.tenantId, body.patientId);
    return this.prisma.$transaction(async (tx) => {
      const saleItems = [];
      for (const item of body.items) {
        const medicine = await tx.medicine.findFirst({
          where: { id: item.medicineId, tenantId: user.tenantId },
        });
        if (!medicine) throw new NotFoundException("Medicine not found");
        await consumeStock(tx, user.tenantId, medicine.id, item.quantity);
        saleItems.push({
          medicineId: medicine.id,
          quantity: item.quantity,
          unitPriceCents: medicine.unitPriceCents,
          lineCents: medicine.unitPriceCents * item.quantity,
        });
      }
      return tx.sale.create({
        data: {
          tenantId: user.tenantId,
          receiptNo: await nextReceipt(tx, user.tenantId),
          patientId: body.patientId,
          totalCents: saleItems.reduce((sum, item) => sum + item.lineCents, 0),
          items: { create: saleItems },
        },
        include: { items: { include: { medicine: true } } },
      });
    });
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
    const [purchases, purchaseCount] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { tenantId: user.tenantId, supplierId: id },
        include: { lines: { include: { medicine: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      this.prisma.purchase.count({ where: { tenantId: user.tenantId, supplierId: id } }),
    ]);
    return { ...supplier, purchases, purchaseCount };
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

  async createStaff(user: StaffPrincipal, body: CreateStaffDto) {
    assertRole(user, ["owner"]);
    const count = await this.prisma.tenantUser.count({ where: { tenantId: user.tenantId } });
    if (count >= user.seats) {
      throw new ConflictException(`This license includes ${user.seats} seats`);
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    try {
      return await this.prisma.tenantUser.create({
        data: {
          tenantId: user.tenantId,
          name: body.name.trim(),
          email: body.email.toLowerCase(),
          role: body.role,
          passwordHash,
        },
        select: { id: true, name: true, email: true, role: true },
      });
    } catch {
      throw new ConflictException("That email is already on the staff list");
    }
  }

  private async ownedMedicine(tenantId: string, id: string) {
    const medicine = await this.prisma.medicine.findFirst({ where: { id, tenantId } });
    if (!medicine) throw new NotFoundException("Medicine not found");
    return medicine;
  }

  private async ownedBatch(tenantId: string, id: string) {
    const batch = await this.prisma.stockBatch.findFirst({ where: { id, tenantId } });
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

function cleanCode(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function consumeStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  medicineId: string,
  quantity: number,
) {
  const batches = await tx.stockBatch.findMany({
    where: { tenantId, medicineId, quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
  });
  const now = new Date();
  const usable = batches.filter((batch) => batch.expiryDate.getTime() > now.getTime());
  let remaining = quantity;
  for (const batch of usable) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: batch.quantity - take } });
    await tx.stockMovement.create({
      data: {
        tenantId,
        medicineId,
        batchId: batch.id,
        kind: "sale",
        quantity: -take,
        reason: "sale",
      },
    });
    remaining -= take;
  }
  if (remaining > 0) {
    const expiredLeft = batches.some((batch) => batch.expiryDate.getTime() <= now.getTime() && batch.quantity > 0);
    if (expiredLeft) {
      throw new BadRequestException("Not enough in-date stock. Expired packs have to be recorded as waste.");
    }
    throw new BadRequestException("Not enough stock to complete that");
  }
}

async function nextReceipt(tx: Prisma.TransactionClient, tenantId: string) {
  const count = await tx.sale.count({ where: { tenantId } });
  return `R-${String(count + 1).padStart(5, "0")}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
