import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PLANS } from "@pharmacyos/license-sdk";
import { LicenseKeysService } from "../src/license/license-keys.service";

const prisma = new PrismaClient();

async function main() {
  const platformPassword = "ChangeMe123!";
  const ownerPassword = "Pharmacy123!";
  const keys = new LicenseKeysService();

  await prisma.platformUser.upsert({
    where: { email: "admin@pharmacyos.local" },
    update: {},
    create: {
      email: "admin@pharmacyos.local",
      name: "Platform owner",
      passwordHash: await bcrypt.hash(platformPassword, 10),
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { code: "green-cross" },
    update: { name: "Green Cross Pharmacy", status: "active" },
    create: {
      name: "Green Cross Pharmacy",
      code: "green-cross",
      email: "hello@green-cross.local",
      phone: "+1 555 0142",
      address: "18 Market Street",
      users: {
        create: {
          name: "Nora Haddad",
          email: "pharmacist@green-cross.local",
          role: "owner",
          passwordHash: await bcrypt.hash(ownerPassword, 10),
        },
      },
    },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "pharmacist@green-cross.local" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Nora Haddad",
      email: "pharmacist@green-cross.local",
      role: "owner",
      passwordHash: await bcrypt.hash(ownerPassword, 10),
    },
  });

  const existingLicense = await prisma.license.findFirst({
    where: { tenantId: tenant.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  let licenseFile: { payloadJson: string; signature: string; keyId: string } | null = existingLicense;
  if (!existingLicense) {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const plan = PLANS.professional;
    const payload = {
      keyId: "lic_demo_green_cross",
      tenantId: tenant.id,
      tenantCode: tenant.code,
      tenantName: tenant.name,
      plan: "professional" as const,
      features: [...plan.features],
      seats: plan.seats,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const signed = keys.sign(payload);
    licenseFile = await prisma.license.create({
      data: {
        keyId: payload.keyId,
        tenantId: tenant.id,
        plan: "professional",
        seats: payload.seats,
        features: JSON.stringify(payload.features),
        issuedAt,
        expiresAt,
        payloadJson: JSON.stringify(payload),
        signature: signed.signature,
      },
    });
  }

  const medicineCount = await prisma.medicine.count({ where: { tenantId: tenant.id } });
  if (medicineCount === 0) {
    const supplier = await prisma.supplier.create({
      data: { tenantId: tenant.id, name: "City Wholesale", phone: "+1 555 0199" },
    });
    const paracetamol = await prisma.medicine.create({
      data: {
        tenantId: tenant.id,
        sku: "PARA-500",
        barcode: "5000123456789",
        medicineType: "tablet",
        name: "Paracetamol",
        genericName: "Acetaminophen",
        form: "Tablet",
        strength: "500 mg",
        unitPriceCents: 250,
        reorderLevel: 20,
      },
    });
    const amoxicillin = await prisma.medicine.create({
      data: {
        tenantId: tenant.id,
        sku: "AMOX-500",
        barcode: "5000987654321",
        medicineType: "capsule",
        name: "Amoxicillin",
        form: "Capsule",
        strength: "500 mg",
        unitPriceCents: 890,
        reorderLevel: 15,
      },
    });
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const soon = new Date();
    soon.setDate(soon.getDate() + 45);
    await prisma.stockBatch.createMany({
      data: [
        {
          tenantId: tenant.id,
          medicineId: paracetamol.id,
          batchNumber: "P-2401",
          quantity: 120,
          expiryDate: nextYear,
          costCents: 80,
          supplierId: supplier.id,
        },
        {
          tenantId: tenant.id,
          medicineId: amoxicillin.id,
          batchNumber: "A-118",
          quantity: 8,
          expiryDate: soon,
          costCents: 410,
          supplierId: supplier.id,
        },
      ],
    });
    const patient = await prisma.patient.create({
      data: { tenantId: tenant.id, name: "Layla Hassan", phone: "+1 555 0177" },
    });
    await prisma.prescription.create({
      data: {
        tenantId: tenant.id,
        patientId: patient.id,
        doctorName: "Dr. Samir Odeh",
        items: { create: [{ medicineId: amoxicillin.id, quantity: 2, dosage: "1 capsule three times a day" }] },
      },
    });
  }

  await prisma.medicine.updateMany({
    where: { tenantId: tenant.id, sku: "PARA-500" },
    data: { barcode: "5000123456789", medicineType: "tablet" },
  });
  await prisma.medicine.updateMany({
    where: { tenantId: tenant.id, sku: "AMOX-500" },
    data: { barcode: "5000987654321", medicineType: "capsule" },
  });
  const paracetamol = await prisma.medicine.findFirst({ where: { tenantId: tenant.id, sku: "PARA-500" } });
  const expiredBatch = paracetamol
    ? await prisma.stockBatch.findFirst({ where: { tenantId: tenant.id, batchNumber: "P-OLD" } })
    : null;
  if (paracetamol && !expiredBatch) {
    const past = new Date();
    past.setDate(past.getDate() - 18);
    await prisma.stockBatch.create({
      data: {
        tenantId: tenant.id,
        medicineId: paracetamol.id,
        batchNumber: "P-OLD",
        serialNumber: "SN-POLD-004",
        quantity: 4,
        expiryDate: past,
        costCents: 80,
      },
    });
  }

  await prisma.patient.updateMany({
    where: { tenantId: tenant.id, name: "Layla Hassan" },
    data: {
      sex: "female",
      nationalId: "ID-44219",
      address: "14 Garden Street",
      allergies: "Penicillin",
    },
  });
  await prisma.supplier.updateMany({
    where: { tenantId: tenant.id, name: "City Wholesale" },
    data: {
      contactName: "Hana Saleh",
      address: "Warehouse 4, Port Road",
      taxNumber: "TX-19022",
      paymentTerms: "30 days",
    },
  });

  if (licenseFile) {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const file = {
      format: "pharmacyos-license-v1",
      payload: JSON.parse(licenseFile.payloadJson),
      signature: licenseFile.signature,
    };
    const licensePath = path.join(dir, "green-cross.lic");
    writeFileSync(licensePath, JSON.stringify(file, null, 2));
    console.log("Demo license written to", licensePath);
  }

  console.log("Platform owner  admin@pharmacyos.local  /  ChangeMe123!");
  console.log("Demo pharmacy  green-cross  /  pharmacist@green-cross.local  /  Pharmacy123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
