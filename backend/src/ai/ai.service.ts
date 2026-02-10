import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: 'anthropic' | 'openai';
  private readonly anthropic?: Anthropic;
  private readonly openai?: OpenAI;
  private readonly model: string;

  private static readonly FALLBACK_NARRATION =
    "Le Maitre du Jeu reflechit... (L'IA est momentanement indisponible, la partie continue.)";

  private static readonly FALLBACK_ACTIONS = [
    'Observer la situation attentivement',
    'Parler aux autres joueurs',
    'Agir prudemment',
    'Attendre et voir',
  ];

  constructor(private readonly configService: ConfigService) {
    this.provider =
      (this.configService.get<string>('AI_PROVIDER') as 'anthropic' | 'openai') || 'anthropic';

    if (this.provider === 'openai') {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        this.logger.warn(
          'OPENAI_API_KEY not set — AI features will use fallback responses',
        );
      }
      this.openai = new OpenAI({ apiKey: apiKey || 'missing-key', maxRetries: 0, timeout: 60000 });
      this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');
    } else {
      const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        this.logger.warn(
          'ANTHROPIC_API_KEY not set — AI features will use fallback responses',
        );
      }
      this.anthropic = new Anthropic({ apiKey: apiKey || 'missing-key' });
      this.model = this.configService.get<string>(
        'AI_MODEL',
        'claude-sonnet-4-5-20250929',
      );
    }

    this.logger.log(
      `AI Service initialized — provider: ${this.provider}, model: ${this.model}`,
    );
  }

  /**
   * Unified chat method that routes to the correct provider.
   * Includes a 15s timeout to prevent hanging requests.
   */
  private async chat(
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<string> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI request timed out after 60s')), 60000),
    );

    const request = this.provider === 'openai' && this.openai
      ? this.chatOpenAI(system, user, maxTokens)
      : this.chatAnthropic(system, user, maxTokens);

    return Promise.race([request, timeout]);
  }

  private async chatOpenAI(
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<string> {
    this.logger.debug('Calling OpenAI API...');
    const response = await this.openai!.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    this.logger.debug('OpenAI API responded');
    return response.choices[0]?.message?.content || '';
  }

  private async chatAnthropic(
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<string> {
    this.logger.debug('Calling Anthropic API...');
    const response = await this.anthropic!.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    this.logger.debug('Anthropic API responded');

    const textBlock = response.content.find(
      (block) => block.type === 'text',
    );

    if (!textBlock || textBlock.type !== 'text') {
      return '';
    }

    return textBlock.text;
  }

  /**
   * Generate a narrative text from the AI.
   */
  async narrate(
    systemPrompt: string,
    userPrompt: string,
    context?: string,
  ): Promise<string> {
    try {
      const userContent = context
        ? `${userPrompt}\n\nContexte actuel:\n${context}`
        : userPrompt;

      const text = await this.chat(systemPrompt, userContent, 1500);

      if (!text) {
        this.logger.warn('AI response was empty');
        return AiService.FALLBACK_NARRATION;
      }

      return text;
    } catch (error: any) {
      this.logger.error(`AI narration error: ${error.message}`);

      if (error.status === 429) {
        this.logger.warn('AI rate limit reached, using fallback');
      } else if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
        this.logger.warn('AI request timed out, using fallback');
      }

      return AiService.FALLBACK_NARRATION;
    }
  }

  /**
   * Stream narrative text from the AI for real-time display.
   * Supports Anthropic streaming natively; falls back to non-streamed for OpenAI.
   */
  async *streamNarrate(
    systemPrompt: string,
    userPrompt: string,
    context?: string,
  ): AsyncGenerator<string> {
    try {
      const userContent = context
        ? `${userPrompt}\n\nContexte actuel:\n${context}`
        : userPrompt;

      if (this.provider === 'openai' && this.openai) {
        const stream = await this.openai.chat.completions.create({
          model: this.model,
          max_tokens: 1500,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        }
        return;
      }

      // Anthropic streaming
      const stream = this.anthropic!.messages.stream({
        model: this.model,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (error: any) {
      this.logger.error(`AI stream narration error: ${error.message}`);
      yield AiService.FALLBACK_NARRATION;
    }
  }

  /**
   * Generate contextual action suggestions for a player.
   */
  async generateActionSuggestions(
    scenario: any,
    gameState: any,
    playerRole: string,
  ): Promise<string[]> {
    try {
      const systemPrompt =
        'Tu es un assistant de jeu narratif. Tu generes des suggestions d\'actions pour les joueurs. Reponds UNIQUEMENT avec un tableau JSON de 3 a 4 strings, sans explication supplementaire.';

      const userPrompt = `Scenario: ${scenario.name}
Role du joueur: ${playerRole}
Round: ${gameState.currentRound}/${gameState.maxRounds}
Phase actuelle: ${gameState.currentPhase}
Jauges globales: ${JSON.stringify(gameState.globalGauges)}
Joueurs en vie: ${gameState.players.filter((p: any) => p.isAlive).map((p: any) => p.username).join(', ')}

Genere 3 a 4 actions contextuelles que ce joueur pourrait faire. Les actions doivent etre variees (prudentes, audacieuses, sociales, strategiques).
Reponds UNIQUEMENT avec un tableau JSON de strings. Exemple: ["Action 1", "Action 2", "Action 3"]`;

      const text = await this.chat(systemPrompt, userPrompt, 500);

      if (!text) {
        return AiService.FALLBACK_ACTIONS;
      }

      const jsonMatch = text.trim().match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
          return parsed;
        }
      }

      this.logger.warn('Failed to parse AI action suggestions, using fallback');
      return AiService.FALLBACK_ACTIONS;
    } catch (error: any) {
      this.logger.error(`AI action suggestions error: ${error.message}`);
      return AiService.FALLBACK_ACTIONS;
    }
  }

  /**
   * Resolve all player actions by asking the AI to narrate consequences
   * and determine state changes (gauge updates, eliminations).
   */
  async resolveActions(
    scenario: any,
    gameState: any,
    actions: any[],
  ): Promise<{ narrative: string; stateChanges: any }> {
    try {
      const systemPrompt = `${scenario.aiPrompt.systemPrompt}

Tu dois aussi determiner les consequences mecaniques des actions des joueurs.
Reponds avec un objet JSON contenant:
- "narrative": un texte narratif (2-3 paragraphes) decrivant les consequences
- "stateChanges": un objet avec:
  - "globalGauges": objet avec les CHANGEMENTS (deltas) des jauges globales (ex: {"pression": -5, "oxygene": -3})
  - "playerGauges": objet ou chaque cle est un userId avec les changements de jauges (ex: {"userId1": {"suspicion": +10}})
  - "eliminations": tableau de userIds des joueurs elimines ce round (tableau vide si aucun)

IMPORTANT: Reponds UNIQUEMENT avec le JSON, sans texte supplementaire.`;

      const playersInfo = gameState.players
        .filter((p: any) => p.isAlive)
        .map(
          (p: any) =>
            `- ${p.username} (${p.role}, equipe: ${p.team}): jauges ${JSON.stringify(p.gauges)}`,
        )
        .join('\n');

      const actionsInfo = actions
        .map((a: any) => {
          const player = gameState.players.find(
            (p: any) => p.userId === a.userId,
          );
          return `- ${player?.username || a.userId} (${player?.role || 'inconnu'}): "${a.action}"`;
        })
        .join('\n');

      const votesInfo =
        gameState.rounds?.[gameState.currentRound - 1]?.votes
          ?.map((v: any) => {
            const voter = gameState.players.find(
              (p: any) => p.userId === v.userId,
            );
            const target = gameState.players.find(
              (p: any) => p.userId === v.targetId,
            );
            return `- ${voter?.username || v.userId} vote contre ${target?.username || v.targetId}`;
          })
          .join('\n') || 'Aucun vote';

      const userPrompt = `Round ${gameState.currentRound}/${gameState.maxRounds}
Jauges globales: ${JSON.stringify(gameState.globalGauges)}

Joueurs en vie:
${playersInfo}

Actions de ce round:
${actionsInfo}

Votes de ce round:
${votesInfo}

Determine les consequences narratives et mecaniques. Sois equilibre mais cree de la tension.`;

      const text = await this.chat(systemPrompt, userPrompt, 2000);

      if (!text) {
        return this.fallbackResolution();
      }

      const jsonMatch = text.trim().match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          narrative:
            parsed.narrative || 'Les evenements se deroulent de maniere inattendue...',
          stateChanges: {
            globalGauges: parsed.stateChanges?.globalGauges || {},
            playerGauges: parsed.stateChanges?.playerGauges || {},
            eliminations: parsed.stateChanges?.eliminations || [],
          },
        };
      }

      this.logger.warn('Failed to parse AI resolution response');
      return this.fallbackResolution();
    } catch (error: any) {
      this.logger.error(`AI resolve actions error: ${error.message}`);
      return this.fallbackResolution();
    }
  }

  /**
   * Generate an epilogue narrative for the end of the game.
   */
  async generateEpilogue(
    scenario: any,
    gameState: any,
    result: string,
  ): Promise<string> {
    try {
      let epiloguePrompt = scenario.aiPrompt.epiloguePrompt
        .replace('{result}', result)
        .replace('{verdict}', result);

      const saboteur = gameState.players.find(
        (p: any) => p.team === 'saboteur',
      );
      if (saboteur) {
        epiloguePrompt = epiloguePrompt.replace(
          '{saboteur}',
          saboteur.username,
        );
      }

      const context = this.buildStateContext(gameState);

      return await this.narrate(
        scenario.aiPrompt.systemPrompt,
        epiloguePrompt,
        context,
      );
    } catch (error: any) {
      this.logger.error(`AI epilogue generation error: ${error.message}`);
      return `La partie est terminee. Resultat: ${result}. Merci d'avoir joue!`;
    }
  }

  /**
   * Build a text summary of the game state for AI context.
   */
  private buildStateContext(gameState: any): string {
    const lines: string[] = [];

    lines.push(`Partie: ${gameState.gameId}`);
    lines.push(`Round: ${gameState.currentRound}/${gameState.maxRounds}`);
    lines.push(`Jauges globales: ${JSON.stringify(gameState.globalGauges)}`);
    lines.push('');
    lines.push('Joueurs:');

    for (const player of gameState.players) {
      const status = player.isAlive ? 'en vie' : 'elimine';
      lines.push(
        `- ${player.username} (${player.role}, ${player.team}) [${status}] - jauges: ${JSON.stringify(player.gauges)}`,
      );
    }

    if (gameState.rounds && gameState.rounds.length > 0) {
      lines.push('');
      lines.push('Historique recent:');
      const recentRounds = gameState.rounds.slice(-2);
      for (const round of recentRounds) {
        lines.push(`  Round ${round.round}: ${round.narration || '(pas de narration)'}`);
        if (round.resolution) {
          lines.push(`  Resolution: ${round.resolution.narrative || ''}`);
          if (round.resolution.eliminations?.length > 0) {
            lines.push(
              `  Eliminations: ${round.resolution.eliminations.join(', ')}`,
            );
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Provide a fallback resolution when AI is unavailable.
   */
  private fallbackResolution(): { narrative: string; stateChanges: any } {
    return {
      narrative:
        'Les evenements prennent une tournure inattendue. La tension monte parmi les joueurs, mais la situation reste incertaine...',
      stateChanges: {
        globalGauges: {},
        playerGauges: {},
        eliminations: [],
      },
    };
  }
}
