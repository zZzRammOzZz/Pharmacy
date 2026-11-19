import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class PharmacyLoginDto {
  @IsString()
  tenantCode!: string;

  @IsEmail({ require_tld: false })
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  licenseToken!: string;
}

export class CreateMedicineDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsIn(["tablet", "capsule", "syrup", "suspension", "injection", "cream", "drops", "inhaler", "device", "other"])
  medicineType?: string;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  strength?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;
}

export class ReceiveStockDto {
  @IsString()
  medicineId!: string;

  @IsString()
  batchNumber!: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsISO8601()
  expiryDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  costCents!: number;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(["female", "male", "unspecified"])
  sex?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsIn(["female", "male", "unspecified"])
  sex?: string | null;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  nationalId?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  allergies?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class LineDto {
  @IsString()
  medicineId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  dosage?: string;
}

export class CreatePrescriptionDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  doctorName?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  items!: LineDto[];
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  items!: LineDto[];
}

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({ require_tld: false })
  email?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  contactName?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsEmail({ require_tld: false })
  email?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  paymentTerms?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class PurchaseLineDto {
  @IsString()
  medicineId!: string;

  @IsString()
  batchNumber!: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsISO8601()
  expiryDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  costCents!: number;
}

export class CreatePurchaseDto {
  @IsString()
  @MinLength(1)
  reference!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class AdjustmentDto {
  @IsString()
  batchId!: string;

  @Type(() => Number)
  @IsInt()
  quantityDelta!: number;

  @IsIn(["count", "found", "correction", "return"])
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class WasteDto {
  @IsString()
  batchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsIn(["expired", "damaged", "broken", "recalled", "contaminated", "spilled"])
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail({ require_tld: false })
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(["pharmacist", "cashier", "owner"])
  role!: "pharmacist" | "cashier" | "owner";
}
