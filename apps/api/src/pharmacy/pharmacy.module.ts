import { Module } from "@nestjs/common";
import { PharmacyGuard } from "./pharmacy.guard";
import { PharmacyController } from "./pharmacy.controller";
import { PharmacyService } from "./pharmacy.service";

@Module({
  controllers: [PharmacyController],
  providers: [PharmacyService, PharmacyGuard],
})
export class PharmacyModule {}
