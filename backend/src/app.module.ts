import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { EngineModule } from './engine/engine.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { AiModule } from './ai/ai.module';
import { WebsocketModule } from './websocket/websocket.module';
import { CacheModule } from './cache/cache.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    // Global config from .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Core infrastructure
    PrismaModule,
    CacheModule,

    // Feature modules
    AuthModule,
    UsersModule,
    GamesModule,
    EngineModule,
    ScenariosModule,
    AiModule,
    WebsocketModule,
    AdminModule,
    NotificationsModule,
  ],
})
export class AppModule {}
