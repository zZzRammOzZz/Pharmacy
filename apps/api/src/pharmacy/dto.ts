import { Type } from "class-transformer";
import { CAPABILITY_IDS, ROLE_ID } from "./access";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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
  substanceId?: string;

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

export class UpdateMedicineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

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
  substanceId?: string;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

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

export class TakePaymentDto {
  @IsOptional()
  @IsIn(["cash_usd", "cash_ll", "card", "credit"])
  paymentMethod?: string;
}

export class CreateSaleDto extends TakePaymentDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  items!: LineDto[];
}

export class BranchRateDto {
  @IsString()
  branchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  llPerUsd!: number;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail({ require_tld: false })
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  llPerUsd?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchRateDto)
  rates?: BranchRateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleGrantDto)
  roles?: RoleGrantDto[];
}

export class AccountPaymentDto {
  @IsIn(["cash_usd", "cash_ll", "card"])
  method!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RefundAllDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class RefundSaleDto {
  @IsString()
  saleItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReplaceSaleDto {
  @IsString()
  saleItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  medicineId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  replacementQuantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
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

export class UpdatePurchaseLineDto {
  @IsString()
  id!: string;

  @IsString()
  medicineId!: string;

  @IsString()
  @MinLength(1)
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

export class UpdatePurchaseDto {
  @IsString()
  @MinLength(1)
  reference!: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePurchaseLineDto)
  lines!: UpdatePurchaseLineDto[];
}

export class AdjustmentDto {
  @IsString()
  batchId!: string;

  @Type(() => Number)
  @IsInt()
  quantityDelta!: number;

  @IsIn(["count", "found", "correction", "return", "expiry"])
  reason!: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

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

export class UpdateWasteDto {
  @IsOptional()
  @IsString()
  batchId?: string;

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

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class RoleGrantDto {
  @IsString()
  @Matches(ROLE_ID)
  role!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  label?: string;

  @IsArray()
  @IsIn(CAPABILITY_IDS, { each: true })
  access!: string[];

  @IsBoolean()
  enabled!: boolean;
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

  @IsString()
  @Matches(ROLE_ID)
  role!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}

export class UpdateStaffDto {
  @IsString()
  @Matches(ROLE_ID)
  role!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
