import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.module";
import { LoginDto } from "./dto";
import { PlatformGuard, PlatformPrincipal } from "./platform.guard";

@Controller("platform/auth")
export class PlatformAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Post("login")
  async login(@Body() body: LoginDto) {
    const user = await this.prisma.platformUser.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    const valid = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException("Email or password is incorrect");
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      aud: "platform",
      email: user.email,
      name: user.name,
    });
    return { accessToken, user: { id: user.id, email: user.email, name: user.name } };
  }

  @Get("me")
  @UseGuards(PlatformGuard)
  me(@Req() request: { user: PlatformPrincipal }) {
    return request.user;
  }
}
