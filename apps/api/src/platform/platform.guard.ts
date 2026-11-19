import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export interface PlatformPrincipal {
  sub: string;
  aud: "platform";
  email: string;
  name: string;
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = String(request.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException("Sign in required");
    try {
      const payload = await this.jwt.verifyAsync<PlatformPrincipal>(match[1]);
      if (payload.aud !== "platform") throw new Error("audience");
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Sign in required");
    }
  }
}
