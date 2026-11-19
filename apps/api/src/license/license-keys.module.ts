import { Global, Module } from "@nestjs/common";
import { LicenseKeysService } from "./license-keys.service";

@Global()
@Module({
  providers: [LicenseKeysService],
  exports: [LicenseKeysService],
})
export class LicenseKeysModule {}
