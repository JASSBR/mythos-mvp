import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ScenarioPack,
  ScenarioMetadata,
  ScenarioConfig,
  ScenarioRole,
} from './interfaces/scenario.interface';

@Injectable()
export class ScenariosService implements OnModuleInit {
  private scenarios: Map<string, ScenarioPack> = new Map();

  onModuleInit() {
    this.loadScenarioPacks();
  }

  private loadScenarioPacks(): void {
    const packsDir = join(__dirname, 'packs');
    const packFiles = ['tribunal.json', 'deep.json'];

    for (const file of packFiles) {
      const filePath = join(packsDir, file);
      const raw = readFileSync(filePath, 'utf-8');
      const pack: ScenarioPack = JSON.parse(raw);
      this.scenarios.set(pack.slug, pack);
    }
  }

  getAllScenarios(): ScenarioMetadata[] {
    const result: ScenarioMetadata[] = [];

    for (const pack of this.scenarios.values()) {
      result.push({
        slug: pack.slug,
        name: pack.name,
        description: pack.description,
        minPlayers: pack.minPlayers,
        maxPlayers: pack.maxPlayers,
        duration: pack.duration,
        difficulty: pack.difficulty,
        roles: pack.roles.map((r) => ({
          id: r.id,
          name: r.name,
          team: r.team,
        })),
      });
    }

    return result;
  }

  getScenario(slug: string): ScenarioPack {
    const pack = this.scenarios.get(slug);
    if (!pack) {
      throw new NotFoundException(`Scenario "${slug}" not found`);
    }
    return pack;
  }

  getScenarioConfig(slug: string): ScenarioConfig {
    const pack = this.getScenario(slug);
    return {
      roles: pack.roles,
      phases: pack.phases,
      actions: pack.actions || [],
      gauges: pack.gauges,
      winConditions: pack.winConditions,
      aiPrompt: pack.aiPrompt,
      maxRounds: pack.maxRounds,
    };
  }

  getRolesForPlayers(slug: string, playerCount: number): ScenarioRole[] {
    const pack = this.getScenario(slug);

    if (playerCount < pack.minPlayers) {
      throw new NotFoundException(
        `Scenario "${slug}" requires at least ${pack.minPlayers} players`,
      );
    }

    if (playerCount > pack.maxPlayers) {
      throw new NotFoundException(
        `Scenario "${slug}" allows at most ${pack.maxPlayers} players`,
      );
    }

    const assignedRoles: ScenarioRole[] = [];

    // First, assign all required roles
    const requiredRoles = pack.roles.filter((r) => r.required);
    for (const role of requiredRoles) {
      assignedRoles.push(role);
    }

    // Fill remaining slots with optional unique roles first, then non-unique roles
    let remaining = playerCount - assignedRoles.length;
    const optionalUnique = pack.roles.filter(
      (r) => !r.required && r.unique,
    );
    const optionalNonUnique = pack.roles.filter(
      (r) => !r.required && !r.unique,
    );

    // Add optional unique roles
    for (const role of optionalUnique) {
      if (remaining <= 0) break;
      assignedRoles.push(role);
      remaining--;
    }

    // Fill remaining slots with non-unique roles (cycle through them)
    let nonUniqueIndex = 0;
    while (remaining > 0 && optionalNonUnique.length > 0) {
      assignedRoles.push(
        optionalNonUnique[nonUniqueIndex % optionalNonUnique.length],
      );
      nonUniqueIndex++;
      remaining--;
    }

    return assignedRoles;
  }

  scenarioExists(slug: string): boolean {
    return this.scenarios.has(slug);
  }
}
