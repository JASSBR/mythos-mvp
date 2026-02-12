import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { JoinGameDto } from './dto/join-game.dto';

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post()
  async createGame(@Req() req: any, @Body() dto: CreateGameDto) {
    return this.gamesService.createGame(req.user.id, dto);
  }

  @Post('join')
  async joinGame(@Req() req: any, @Body() dto: JoinGameDto) {
    return this.gamesService.joinGame(req.user.id, dto.code);
  }

  @Get()
  async listPublicGames() {
    return this.gamesService.listPublicGames();
  }

  @Get('my')
  async getUserGames(@Req() req: any) {
    return this.gamesService.getUserGames(req.user.id);
  }

  @Get('code/:code')
  async getGameByCode(@Param('code') code: string) {
    return this.gamesService.getGameByCode(code);
  }

  @Get(':id')
  async getGame(@Param('id') id: string) {
    return this.gamesService.getGame(id);
  }

  @Post(':id/leave')
  async leaveGame(@Req() req: any, @Param('id') id: string) {
    return this.gamesService.leaveGame(req.user.id, id);
  }

  @Get(':id/events')
  async getGameEvents(@Param('id') id: string) {
    return this.gamesService.getGameEvents(id);
  }
}
