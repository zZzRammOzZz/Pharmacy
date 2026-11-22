import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  CreateMedicineDto,
  CreatePatientDto,
  CreatePrescriptionDto,
  AdjustmentDto,
  CreatePurchaseDto,
  UpdatePurchaseDto,
  UpdateWasteDto,
  UpdateMedicineDto,
  AccountPaymentDto,
  CreateSaleDto,
  RefundAllDto,
  RefundSaleDto,
  ReplaceSaleDto,
  SetRateDto,
  TakePaymentDto,
  CreateBranchDto,
  CreateStaffDto,
  UpdateStaffDto,
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

  @Post("auth/logout")
  @UseGuards(PharmacyGuard)
  logout(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.logout(request.user);
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

  @Patch("medicines/:id")
  @UseGuards(PharmacyGuard)
  updateMedicine(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: UpdateMedicineDto) {
    return this.pharmacy.updateMedicine(request.user, id, body);
  }

  @Post("stock")
  @UseGuards(PharmacyGuard)
  receiveStock(@Req() request: { user: StaffPrincipal }, @Body() body: ReceiveStockDto) {
    return this.pharmacy.receiveStock(request.user, body);
  }

  @Get("orders")
  @UseGuards(PharmacyGuard)
  orderList(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.orderList(request.user);
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

  @Patch("purchases/:id")
  @UseGuards(PharmacyGuard)
  updatePurchase(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: UpdatePurchaseDto) {
    return this.pharmacy.updatePurchase(request.user, id, body);
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

  @Patch("waste/:id")
  @UseGuards(PharmacyGuard)
  updateWaste(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: UpdateWasteDto) {
    return this.pharmacy.updateWaste(request.user, id, body);
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

  @Get("aged")
  @UseGuards(PharmacyGuard)
  aged(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.aged(request.user);
  }

  @Post("patients/:id/payments")
  @UseGuards(PharmacyGuard)
  receivePayment(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: AccountPaymentDto) {
    return this.pharmacy.receivePayment(request.user, id, body);
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

  @Patch("prescriptions/:id")
  @UseGuards(PharmacyGuard)
  updatePrescription(
    @Req() request: { user: StaffPrincipal },
    @Param("id") id: string,
    @Body() body: CreatePrescriptionDto,
  ) {
    return this.pharmacy.updatePrescription(request.user, id, body);
  }

  @Post("prescriptions/:id/dispense")
  @UseGuards(PharmacyGuard)
  dispense(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: TakePaymentDto) {
    return this.pharmacy.dispense(request.user, id, body);
  }

  @Get("till")
  @UseGuards(PharmacyGuard)
  till(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.till(request.user);
  }

  @Patch("till")
  @UseGuards(PharmacyGuard)
  setTill(@Req() request: { user: StaffPrincipal }, @Body() body: SetRateDto) {
    return this.pharmacy.setTill(request.user, body);
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

  @Get("sales/:id")
  @UseGuards(PharmacyGuard)
  sale(@Req() request: { user: StaffPrincipal }, @Param("id") id: string) {
    return this.pharmacy.sale(request.user, id);
  }

  @Post("sales/:id/refund")
  @UseGuards(PharmacyGuard)
  refundSale(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: RefundSaleDto) {
    return this.pharmacy.refundSale(request.user, id, body);
  }

  @Post("sales/:id/refund-all")
  @UseGuards(PharmacyGuard)
  refundAll(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: RefundAllDto) {
    return this.pharmacy.refundAll(request.user, id, body);
  }

  @Post("sales/:id/replace")
  @UseGuards(PharmacyGuard)
  replaceSale(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: ReplaceSaleDto) {
    return this.pharmacy.replaceSale(request.user, id, body);
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

  @Get("suppliers/aged")
  @UseGuards(PharmacyGuard)
  supplierAged(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.supplierAged(request.user);
  }

  @Post("suppliers/:id/payments")
  @UseGuards(PharmacyGuard)
  paySupplier(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: AccountPaymentDto) {
    return this.pharmacy.paySupplier(request.user, id, body);
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

  @Get("staff")
  @UseGuards(PharmacyGuard)
  staff(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.staff(request.user);
  }

  @Post("staff")
  @UseGuards(PharmacyGuard)
  createStaff(@Req() request: { user: StaffPrincipal }, @Body() body: CreateStaffDto) {
    return this.pharmacy.createStaff(request.user, body);
  }

  @Patch("staff/:id")
  @UseGuards(PharmacyGuard)
  updateStaff(@Req() request: { user: StaffPrincipal }, @Param("id") id: string, @Body() body: UpdateStaffDto) {
    return this.pharmacy.updateStaff(request.user, id, body);
  }

  @Get("reading")
  @UseGuards(PharmacyGuard)
  reading(@Req() request: { user: StaffPrincipal }, @Query("scope") scope?: string) {
    return this.pharmacy.reading(request.user, scope === "all");
  }

  @Get("branches")
  @UseGuards(PharmacyGuard)
  branches(@Req() request: { user: StaffPrincipal }) {
    return this.pharmacy.branches(request.user);
  }

  @Post("branches")
  @UseGuards(PharmacyGuard)
  createBranch(@Req() request: { user: StaffPrincipal }, @Body() body: CreateBranchDto) {
    return this.pharmacy.createBranch(request.user, body.name);
  }

  @Get("reports")
  @UseGuards(PharmacyGuard)
  reports(
    @Req() request: { user: StaffPrincipal },
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.pharmacy.reports(request.user, range, from, to);
  }

  @Get("employee-log")
  @UseGuards(PharmacyGuard)
  employeeLog(
    @Req() request: { user: StaffPrincipal },
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("staffId") staffId?: string,
  ) {
    return this.pharmacy.employeeLog(request.user, range, from, to, staffId);
  }
}
