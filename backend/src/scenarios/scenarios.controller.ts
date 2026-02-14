import { Controller, Get, Param } from '@nestjs/common';
import { ScenariosService } from './scenarios.service';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Get()
  getAllScenarios() {
    return this.scenariosService.getAllScenarios();
  }

  @Get(':slug')
  getScenario(@Param('slug') slug: string) {
    return this.scenariosService.getScenario(slug);
  }
}
