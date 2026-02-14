import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { GamesModule } from '../games/games.module';
import { CacheModule } from '../cache/cache.module';
import { EngineService } from './engine.service';
import { TimerService } from './timer.service';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ScenariosModule,
    forwardRef(() => GamesModule),
    CacheModule,
  ],
  providers: [EngineService, TimerService],
  exports: [EngineService, TimerService],
})
export class EngineModule {}
