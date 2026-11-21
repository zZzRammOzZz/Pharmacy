import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail({ require_tld: false })
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "code must be lowercase letters, numbers, and hyphens",
  })
  code!: string;

  @IsOptional()
  @IsEmail({ require_tld: false })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @MinLength(2)
  ownerName!: string;

  @IsEmail({ require_tld: false })
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail({ require_tld: false })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(["active", "suspended"])
  status?: "active" | "suspended";
}

export class IssueLicenseDto {
  @IsOptional()
  @IsIn(["standard", "professional", "group"])
  plan?: "standard" | "professional" | "group";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  termMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  seats?: number;
}
