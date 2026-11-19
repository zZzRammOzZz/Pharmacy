import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { LicensesController, PublicLicenseController } from "./licenses.controller";
import { PlatformAuthController } from "./platform-auth.controller";
import { PlatformGuard } from "./platform.guard";
import { TenantsController } from "./tenants.controller";

@Module({
  controllers: [
    PlatformAuthController,
    DashboardController,
    TenantsController,
    LicensesController,
    PublicLicenseController,
  ],
  providers: [PlatformGuard],
})
export class PlatformModule {}
