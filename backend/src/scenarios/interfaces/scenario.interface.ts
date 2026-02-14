export interface ScenarioRole {
  id: string;
  name: string;
  team: string;
  description: string;
  unique: boolean;
  required: boolean;
}

export interface ScenarioGauge {
  id: string;
  name: string;
  min: number;
  max: number;
  initial: number;
  appliesTo: 'player' | 'global' | 'all';
}

export interface ScenarioAiPrompt {
  systemPrompt: string;
  introPrompt: string;
  roundPrompt: string;
  epiloguePrompt: string;
}

export interface ScenarioWinConditions {
  [team: string]: string;
}

export interface ScenarioPack {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  duration: string;
  difficulty: string;
  maxRounds: number;
  roles: ScenarioRole[];
  phases: string[];
  actions: string[];
  gauges: ScenarioGauge[];
  winConditions: ScenarioWinConditions;
  aiPrompt: ScenarioAiPrompt;
}

export interface ScenarioMetadata {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  duration: string;
  difficulty: string;
  roles: Pick<ScenarioRole, 'id' | 'name' | 'team'>[];
}

export interface ScenarioConfig {
  roles: ScenarioRole[];
  phases: string[];
  actions: string[];
  gauges: ScenarioGauge[];
  winConditions: ScenarioWinConditions;
  aiPrompt: ScenarioAiPrompt;
  maxRounds: number;
}
