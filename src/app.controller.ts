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
    const protocol = await this.auditLogService.registerLog('LOGIN', {
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
      protocol,
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

  /**
   * Registra um evento e devolve o protocolo. Como EVENT grava de forma
   * síncrona, o protocolo já deve existir no banco quando esta rota responde.
   */
  @Post('events')
  async logEvent(
    @Body()
    body: {
      type?: string;
      description?: string;
      details?: Record<string, any>;
      buffered?: boolean;
    },
  ) {
    const protocol = await this.auditLogService.logEvent(
      {
        type: body.type ?? 'MANUAL_EVENT',
        description: body.description ?? 'manual event',
        details: body.details ?? {},
        eventStatus: 'SUCCESS',
      },
      body.buffered ? { sync: false } : undefined,
    );

    return { ok: true, protocol, buffered: Boolean(body.buffered) };
  }

  @Post('error')
  async logExpectedError() {
    await this.auditLogService.registerLog('ERROR', {
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
    const protocols: Record<string, string[]> = {
      ENTITY: [],
      EVENT: [],
      INTEGRATION: [],
      REQUEST: [],
      LOGIN: [],
      ERROR: [],
    };

    for (let i = 0; i < 2; i += 1) {
      const item = await this.itemModel.create({
        name: `load-${seq}-${i}`,
        quantity: seq + i,
        status: 'ACTIVE',
      } as any);

      protocols.ENTITY.push(
        this.requireProtocol(
          'ENTITY',
          await this.auditLogService.registerLog('ENTITY', {
            action: 'CREATE',
            entity: 'items',
            changedValues: item.toJSON(),
            entityPk: { id: item.id },
            entityKey: String(item.id),
          }),
        ),
      );
    }

    for (let i = 0; i < 2; i += 1) {
      protocols.EVENT.push(
        this.requireProtocol(
          'EVENT',
          await this.auditLogService.registerLog('EVENT', {
            type: 'LOAD_TICK',
            description: `load event ${seq}-${i}`,
            details: { seq, index: i },
            eventStatus: 'SUCCESS',
          }),
        ),
      );
    }

    for (let i = 0; i < 2; i += 1) {
      protocols.INTEGRATION.push(
        this.requireProtocol(
          'INTEGRATION',
          await this.auditLogService.registerLog('INTEGRATION', {
            integrationName: 'load-runner',
            method: 'POST',
            requestPayload: JSON.stringify({ seq, index: i }),
            responsePayload: JSON.stringify({ ok: true }),
            status: '200',
            duration: 1,
          }),
        ),
      );
    }

    for (let i = 0; i < 2; i += 1) {
      protocols.REQUEST.push(
        this.requireProtocol(
          'REQUEST',
          await this.auditLogService.registerLog('REQUEST', {
            ...this.requestLog('POST', `/load/request-${i}`, 200, { seq, i }),
            responseBody: JSON.stringify({ ok: true, seq, i }),
          }),
        ),
      );
    }

    protocols.LOGIN.push(
      this.requireProtocol(
        'LOGIN',
        await this.auditLogService.registerLog('LOGIN', {
          system: 'e2e-auth',
          registerRequest: true,
          userId: `login-${seq}`,
          request: this.requestLog('POST', '/auth/login', 201, {
            userId: `login-${seq}`,
          }),
        }),
      ),
    );

    protocols.ERROR.push(
      this.requireProtocol(
        'ERROR',
        await this.auditLogService.registerLog('ERROR', {
          message: JSON.stringify({ message: 'expected e2e error' }),
          errorType: 'E2EExpectedError',
          stackTrace: 'stack omitted in e2e harness',
          routePath: '/error',
          routeMethod: 'POST',
        }),
      ),
    );

    return { ok: true, seq, protocols };
  }

  /**
   * Todo registerLog deve devolver um protocolo; `null` significa que a
   * gravação falhou e o teste precisa quebrar em vez de seguir silenciosamente.
   */
  private requireProtocol(logType: string, protocol: string | null) {
    if (!protocol) {
      throw new InternalServerErrorException({
        message: `audit log ${logType} returned no protocol`,
      });
    }

    return protocol;
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
