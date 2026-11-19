import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { LicenseKeysModule } from "./license/license-keys.module";
import { PharmacyModule } from "./pharmacy/pharmacy.module";
import { PlatformModule } from "./platform/platform.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET || "dev-only-change-me",
        signOptions: { expiresIn: 60 * 60 * 12 },
      }),
    }),
    PrismaModule,
    LicenseKeysModule,
    PlatformModule,
    PharmacyModule,
  ],
})
export class AppModule {}
