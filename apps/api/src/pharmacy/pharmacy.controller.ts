import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  CreateMedicineDto,
  CreatePatientDto,
  CreatePrescriptionDto,
  AdjustmentDto,
  CreatePurchaseDto,
  CreateSaleDto,
  CreateStaffDto,
  CreateSupplierDto,
  UpdatePatientDto,
  UpdateSupplierDto,
  WasteDto,
  PharmacyLoginDto,
  ReceiveStockDto,
} from "./dto";
import { PharmacyGuard, StaffPrincipal } from "./pharmacy.guard";
import { PharmacyService } from "./pharmacy.service";

@Controller("pharmacy")
export class PharmacyController {
  constructor(private readonly pharmacy: PharmacyService) {}

  @Post("auth/login")
  login(@Body() body: PharmacyLoginDto) {
    return this.pharmacy.login(body);
  }

  @Get("bootstrap")
  @UseGuards(PharmacyGuard)
  bootstrap(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.bootstrap(request.user);
  }

  @Get("medicines")
  @UseGuards(PharmacyGuard)
  medicines(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.medicines(request.user);
  }

  @Post("medicines")
  @UseGuards(PharmacyGuard)
  createMedicine(@Req() request: { user: StaffPrincipal }, @Body() body: CreateMedicineDto) {
    return this.pharmacy.createMedicine(request.user, body);
  }

  @Post("stock")
  @UseGuards(PharmacyGuard)
  receiveStock(@Req() request: { user: StaffPrincipal }, @Body() body: ReceiveStockDto) {
    return this.pharmacy.receiveStock(request.user, body);
  }

  @Get("purchases")
  @UseGuards(PharmacyGuard)
  purchases(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.purchases(request.user);
  }

  @Post("purchases")
  @UseGuards(PharmacyGuard)
  createPurchase(@Req() request: { user: StaffPrincipal }, @Body() body: CreatePurchaseDto) {
    return this.pharmacy.createPurchase(request.user, body);
  }

  @Get("movements")
  @UseGuards(PharmacyGuard)
  movements(@Req() request: { user: StaffPrincipal }, @Query("kind") kind?: string) {
    return this.pharmacy.movements(request.user, kind);
  }

  @Post("adjustments")
  @UseGuards(PharmacyGuard)
  adjust(@Req() request: { user: StaffPrincipal }, @Body() body: AdjustmentDto) {
    return this.pharmacy.adjust(request.user, body);
  }

  @Post("waste")
  @UseGuards(PharmacyGuard)
  waste(@Req() request: { user: StaffPrincipal }, @Body() body: WasteDto) {
    return this.pharmacy.waste(request.user, body);
  }

  @Get("patients")
  @UseGuards(PharmacyGuard)
  patients(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.patients(request.user);
  }

  @Post("patients")
  @UseGuards(PharmacyGuard)
  createPatient(@Req() request: { user: StaffPrincipal }, @Body() body: CreatePatientDto) {
    return this.pharmacy.createPatient(request.user, body);
  }

  @Get("patients/:id")
  @UseGuards(PharmacyGuard)
  patientProfile(@Req() request: { user: StaffPrincipal }, @Param("id") id: string) {
    return this.pharmacy.patientProfile(request.user, id);
  }

  @Patch("patients/:id")
  @UseGuards(PharmacyGuard)
  updatePatient(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: UpdatePatientDto) {
    return this.pharmacy.updatePatient(request.user, id, body);
  }

  @Get("prescriptions")
  @UseGuards(PharmacyGuard)
  prescriptions(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.prescriptions(request.user);
  }

  @Post("prescriptions")
  @UseGuards(PharmacyGuard)
  createPrescription(@Req() request: { user: StaffPrincipal }, @Body() body: CreatePrescriptionDto) {
    return this.pharmacy.createPrescription(request.user, body);
  }

  @Post("prescriptions/:id/dispense")
  @UseGuards(PharmacyGuard)
  dispense(@Req() request: { user: StaffPrincipal }, @Param("id") id: string) {
    return this.pharmacy.dispense(request.user, id);
  }

  @Get("sales")
  @UseGuards(PharmacyGuard)
  sales(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.sales(request.user);
  }

  @Post("sales")
  @UseGuards(PharmacyGuard)
  createSale(@Req() request: { user: StaffPrincipal }, @Body() body: CreateSaleDto) {
    return this.pharmacy.createSale(request.user, body);
  }

  @Get("suppliers")
  @UseGuards(PharmacyGuard)
  suppliers(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.suppliers(request.user);
  }

  @Post("suppliers")
  @UseGuards(PharmacyGuard)
  createSupplier(@Req() request: { user: StaffPrincipal }, @Body() body: CreateSupplierDto) {
    return this.pharmacy.createSupplier(request.user, body);
  }

  @Get("suppliers/:id")
  @UseGuards(PharmacyGuard)
  supplierProfile(@Req() request: { user: StaffPrincipal }, @Param("id") id: string) {
    return this.pharmacy.supplierProfile(request.user, id);
  }

  @Patch("suppliers/:id")
  @UseGuards(PharmacyGuard)
  updateSupplier(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: UpdateSupplierDto) {
    return this.pharmacy.updateSupplier(request.user, id, body);
  }

  @Post("staff")
  @UseGuards(PharmacyGuard)
  createStaff(@Req() request: { user: StaffPrincipal }, @Body() body: CreateStaffDto) {
    return this.pharmacy.createStaff(request.user, body);
  }
}
