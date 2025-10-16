/**
 * UserAgent - Represents the human player in the murder mystery game
 * Unlike PlayerAgent, this agent gets input from the user instead of an LLM
 */

import { Role, Fact, AllegedInfo, NightAction } from './types';

export interface UserInputHandler {
  getIntroduction(): Promise<string>;
  getNightAction(
    nightNumber: number,
    alivePlayers: string[],
    role: Role,
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    mustKill?: boolean
  ): Promise<NightAction>;
  getStatement(
    dayNumber: number,
    recentDeaths: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    murdererKillBlocked?: boolean
  ): Promise<string>;
  getVote(
    dayNumber: number,
    alivePlayers: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[]
  ): Promise<string | 'abstain'>;
}

export class UserAgent {
  public readonly playerId: string;
  public role: Role | null = null;
  public isAlive: boolean = true;
  public facts: Fact[] = [];
  public allegedInfo: AllegedInfo[] = [];

  private inputHandler: UserInputHandler;

  constructor(playerId: string, inputHandler: UserInputHandler) {
    this.playerId = playerId;
    this.inputHandler = inputHandler;
  }

  /**
   * Initialize the user with their role
   */
  public setRole(role: Role): void {
    this.role = role;
  }

  /**
   * Add a new fact that the user witnessed directly
   */
  public addFact(fact: Fact): void {
    this.facts.push(fact);
  }

  /**
   * Add information that the user heard from someone else
   */
  public addAllegedInfo(info: AllegedInfo): void {
    this.allegedInfo.push(info);
  }

  /**
   * Get introduction from user
   */
  public async makeIntroduction(): Promise<string> {
    return await this.inputHandler.getIntroduction();
  }

  /**
   * Get night action from user
   */
  public async chooseNightAction(
    nightNumber: number,
    alivePlayers: string[],
    lastNoKillNight: number | null
  ): Promise<NightAction> {
    const mustKill =
      this.role === 'murderer' &&
      lastNoKillNight !== null &&
      nightNumber - lastNoKillNight === 1;

    const action = await this.inputHandler.getNightAction(
      nightNumber,
      alivePlayers.filter(id => id !== this.playerId),
      this.role!,
      this.facts,
      this.allegedInfo,
      mustKill
    );

    return {
      ...action,
      playerId: this.playerId,
    };
  }

  /**
   * Get statement from user
   */
  public async makeStatement(
    dayNumber: number,
    recentDeaths: string[],
    murdererKillBlocked: boolean = false
  ): Promise<string> {
    return await this.inputHandler.getStatement(
      dayNumber,
      recentDeaths,
      this.facts,
      this.allegedInfo,
      murdererKillBlocked
    );
  }

  /**
   * Get vote from user
   */
  public async vote(dayNumber: number, alivePlayers: string[]): Promise<string | 'abstain'> {
    return await this.inputHandler.getVote(
      dayNumber,
      alivePlayers.filter(id => id !== this.playerId),
      this.facts,
      this.allegedInfo
    );
  }
}
