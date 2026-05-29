import {
  Body,
  Controller,
  Inject,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuditLogService } from 'nestjs-sequelize-audit-log';

import { ItemModel } from './item.model';

@Controller()
export class AppController {
  constructor(
    @InjectModel(ItemModel)
    private readonly itemModel: typeof ItemModel,
    @Inject(AuditLogService)
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('auth/login')
  async login(@Body() body: { userId?: string }) {
    await this.auditLogService.registerLog('LOGIN' as any, {
      system: 'e2e-auth',
      registerRequest: true,
      userId: body.userId ?? 'login-user',
      request: this.requestLog('POST', '/auth/login', 201, {
        userId: body.userId ?? 'login-user',
      }),
    });

    return {
      ok: true,
      userId: body.userId ?? 'login-user',
    };
  }

  @Post('items')
  async createItem(@Body() body: { name?: string; quantity?: number }) {
    return this.itemModel.create({
      name: body.name ?? `manual-${Date.now()}`,
      quantity: body.quantity ?? 1,
      status: 'ACTIVE',
    } as any);
  }

  @Patch('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() body: { quantity?: number; status?: string },
  ) {
    const item = await this.itemModel.findByPk(Number(id));
    if (!item) {
      throw new InternalServerErrorException({ message: 'item not found' });
    }

    item.quantity = body.quantity ?? item.quantity + 1;
    item.status = body.status ?? 'UPDATED';
    await item.save();
    return item;
  }

  @Post('error')
  async logExpectedError() {
    await this.auditLogService.registerLog('ERROR' as any, {
      message: JSON.stringify({ message: 'expected e2e error' }),
      errorType: 'E2EExpectedError',
      stackTrace: 'stack omitted in e2e harness',
      routePath: '/error',
      routeMethod: 'POST',
    });

    throw new InternalServerErrorException({ message: 'expected e2e error' });
  }

  @Post('load/tick')
  async loadTick(@Body() body: { seq?: number }) {
    const seq = body.seq ?? Date.now();

    for (let i = 0; i < 2; i += 1) {
      const item = await this.itemModel.create({
        name: `load-${seq}-${i}`,
        quantity: seq + i,
        status: 'ACTIVE',
      } as any);

      await this.auditLogService.registerLog('ENTITY' as any, {
        action: 'CREATE',
        entity: 'items',
        changedValues: item.toJSON(),
        entityPk: { id: item.id },
        entityKey: String(item.id),
      });
    }

    for (let i = 0; i < 2; i += 1) {
      await this.auditLogService.registerLog('EVENT' as any, {
        type: 'LOAD_TICK',
        description: `load event ${seq}-${i}`,
        details: { seq, index: i },
        eventStatus: 'SUCCESS',
      });
    }

    for (let i = 0; i < 2; i += 1) {
      await this.auditLogService.registerLog('INTEGRATION' as any, {
        integrationName: 'load-runner',
        method: 'POST',
        requestPayload: JSON.stringify({ seq, index: i }),
        responsePayload: JSON.stringify({ ok: true }),
        status: '200',
        duration: 1,
      });
    }

    for (let i = 0; i < 2; i += 1) {
      await this.auditLogService.registerLog('REQUEST' as any, {
        ...this.requestLog('POST', `/load/request-${i}`, 200, { seq, i }),
        responseBody: JSON.stringify({ ok: true, seq, i }),
      });
    }

    await this.auditLogService.registerLog('LOGIN' as any, {
      system: 'e2e-auth',
      registerRequest: true,
      userId: `login-${seq}`,
      request: this.requestLog('POST', '/auth/login', 201, {
        userId: `login-${seq}`,
      }),
    });

    await this.auditLogService.registerLog('ERROR' as any, {
      message: JSON.stringify({ message: 'expected e2e error' }),
      errorType: 'E2EExpectedError',
      stackTrace: 'stack omitted in e2e harness',
      routePath: '/error',
      routeMethod: 'POST',
    });

    return { ok: true, seq };
  }

  private requestLog(
    requestMethod: string,
    requestURL: string,
    responseStatus: number,
    payload: Record<string, any>,
  ) {
    return {
      requestMethod,
      requestURL,
      responseStatus,
      responseSize: 0,
      duration: 1,
      payload: JSON.stringify(payload),
      responseBody: JSON.stringify({ ok: responseStatus < 400 }),
    };
  }
}
