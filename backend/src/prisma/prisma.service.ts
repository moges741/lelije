import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createConnection } from 'node:net';
import { createInMemoryPrisma } from './in-memory-prisma';
import { DEMO_FAMILY_CODE, seedDemoFamily } from './seed-demo';

/** Fast TCP reachability probe so an unreachable local DATABASE_URL never delays boot or spams stderr. */
function isDatabaseReachable(databaseUrl: string, timeoutMs = 800): Promise<boolean> {
  let host: string;
  let port: number;
  try {
    const parsed = new URL(databaseUrl);
    host = parsed.hostname;
    port = Number(parsed.port) || 5432;
    if (!host) return Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://localhost:5432/lelije',
        },
      },
      log: [],
    });
  }

  async onModuleInit() {
    let connected = false;
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (databaseUrl && (await isDatabaseReachable(databaseUrl))) {
      try {
        await this.$connect();
        connected = true;
      } catch {
        connected = false;
      }
    }

    if (!connected) {
      console.log(
        '[LeLije] Running with built-in in-memory store (configure a reachable PostgreSQL DATABASE_URL for persistent storage).',
      );
      const mock = createInMemoryPrisma();
      for (const [key, value] of Object.entries(mock)) {
        Object.defineProperty(this, key, {
          value,
          configurable: true,
          writable: true,
        });
      }
    }

    try {
      const seeded = await seedDemoFamily(this);
      if (seeded) {
        console.log(
          `[LeLije] Demo family ready (code: ${DEMO_FAMILY_CODE}, parent PIN: 1234).`,
        );
      }
    } catch {
      // Skip silently if seed already exists or cannot be written.
    }
  }
}
