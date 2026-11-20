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
  AccountPaymentDto,
  CreateSaleDto,
  RefundSaleDto,
  ReplaceSaleDto,
  SetRateDto,
  TakePaymentDto,
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
    const today = { gte: startOfToday() };
    const settled = { tenantId: user.tenantId, paymentMethod: { not: "credit" } };
    const [medicines, patientCount, pendingPrescriptions, receiptsToday, salesToday, adjustmentsToday, accountToday, rate] = await Promise.all([
      this.medicines(user),
      this.prisma.patient.count({ where: { tenantId: user.tenantId } }),
      this.prisma.prescription.count({ where: { tenantId: user.tenantId, status: "pending" } }),
      this.prisma.sale.count({ where: { tenantId: user.tenantId, createdAt: today } }),
      this.prisma.sale.aggregate({
        where: { ...settled, createdAt: today },
        _sum: { totalCents: true },
      }),
      this.prisma.saleEvent.aggregate({
        where: { tenantId: user.tenantId, createdAt: today, sale: { paymentMethod: { not: "credit" } } },
        _sum: { amountCents: true },
      }),
      this.prisma.accountPayment.aggregate({
        where: { tenantId: user.tenantId, createdAt: today },
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
        const takes = await consumeStock(tx, user.tenantId, item.medicineId, item.quantity);
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
      where: { tenantId: user.tenantId },
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
    assertRole(user, ["owner", "pharmacist", "cashier"]);
    if (body.patientId) await this.ownedPatient(user.tenantId, body.patientId);
    return this.prisma.$transaction(async (tx) => {
      const saleItems = [];
      for (const item of body.items) {
        const medicine = await tx.medicine.findFirst({
          where: { id: item.medicineId, tenantId: user.tenantId },
        });
        if (!medicine) throw new NotFoundException("Medicine not found");
        const takes = await consumeStock(tx, user.tenantId, medicine.id, item.quantity);
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
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { llPerUsd: true } });
    return { llPerUsd: tenant?.llPerUsd || 0 };
  }

  async setTill(user: StaffPrincipal, body: SetRateDto) {
    assertFeature(user, "sales");
    assertRole(user, ["owner", "pharmacist", "cashier"]);
    await this.prisma.tenant.update({ where: { id: user.tenantId }, data: { llPerUsd: body.llPerUsd } });
    return { llPerUsd: body.llPerUsd };
  }

  async receivePayment(user: StaffPrincipal, patientId: string, body: AccountPaymentDto) {
    assertFeature(user, "sales");
    assertRole(user, ["owner", "pharmacist", "cashier"]);
    await this.ownedPatient(user.tenantId, patientId);
    const tender = await paymentFields(this.prisma, user.tenantId, body.method, body.amountCents, patientId);
    await this.prisma.accountPayment.create({
      data: {
        tenantId: user.tenantId,
        patientId,
        method: tender.paymentMethod,
        amountCents: body.amountCents,
        llPerUsd: tender.llPerUsd,
        llAmount: tender.llAmount,
        note: blank(body.note),
      },
    });
    return this.patientProfile(user, patientId);
  }

  async refundSale(user: StaffPrincipal, id: string, body: RefundSaleDto) {
    assertFeature(user, "sales");
    assertRole(user, ["owner", "pharmacist", "cashier"]);
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.ownedSale(user.tenantId, id, tx);
      const item = sale.items.find((line) => line.id === body.saleItemId);
      if (!item) throw new NotFoundException("That line is not on this receipt");
      const left = item.quantity - returnedQty(sale, item.id);
      if (body.quantity > left) throw new BadRequestException(left > 0 ? `Only ${left} can be refunded` : "That line is already fully refunded");
      await returnStock(tx, user.tenantId, item.medicineId, body.quantity, item.batches, sale.receiptNo);
      await tx.saleEvent.create({
        data: {
          tenantId: user.tenantId,
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
    assertRole(user, ["owner", "pharmacist", "cashier"]);
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.ownedSale(user.tenantId, id, tx);
      const item = sale.items.find((line) => line.id === body.saleItemId);
      if (!item) throw new NotFoundException("That line is not on this receipt");
      if (body.medicineId === item.medicineId) throw new BadRequestException("Choose a different medicine to replace it with");
      const left = item.quantity - returnedQty(sale, item.id);
      if (body.quantity > left) throw new BadRequestException(left > 0 ? `Only ${left} can be replaced` : "That line is already fully returned");
      const medicine = await tx.medicine.findFirst({ where: { id: body.medicineId, tenantId: user.tenantId } });
      if (!medicine) throw new NotFoundException("Medicine not found");
      await returnStock(tx, user.tenantId, item.medicineId, body.quantity, item.batches, sale.receiptNo);
      const takes = await consumeStock(tx, user.tenantId, medicine.id, body.replacementQuantity, "replace", sale.receiptNo);
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

const saleDetail = {
  patient: true,
  items: { include: { medicine: true, batches: true } },
  events: {
    include: { lines: { include: { medicine: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.SaleInclude;

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
) {
  const batches = await tx.stockBatch.findMany({
    where: { tenantId, medicineId, quantity: { gt: 0 } },
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
        kind: "refund",
        quantity: put,
        reason: "refund",
        note: receiptNo,
      },
    });
    remaining -= put;
  }
  if (remaining <= 0) return;
  const batches = await tx.stockBatch.findMany({ where: { tenantId, medicineId }, orderBy: { expiryDate: "asc" } });
  const now = Date.now();
  const target = batches.find((batch) => batch.expiryDate.getTime() > now) || batches[0];
  if (!target) throw new BadRequestException("There is no batch left to return this medicine to.");
  await tx.stockBatch.update({ where: { id: target.id }, data: { quantity: { increment: remaining } } });
  await tx.stockMovement.create({
    data: {
      tenantId,
      medicineId,
      batchId: target.id,
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

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
