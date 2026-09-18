import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // If a Bearer token is present, opportunistically validate it so
      // handlers can use @CurrentUser() to get the caller (e.g. agents
      // creating leads on a public endpoint). Failures are silently ignored.
      const request = context.switchToHttp().getRequest();
      const hasToken = !!request.headers?.authorization?.startsWith('Bearer ');
      if (hasToken) {
        return (super.canActivate(context) as Promise<boolean>).catch(() => true);
      }
      return true;
    }

    return super.canActivate(context);
  }
}
