import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';

@Module({
  imports: [PrismaModule, ScenariosModule],
  providers: [GamesService],
  controllers: [GamesController],
  exports: [GamesService],
})
export class GamesModule {}
