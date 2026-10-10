/**
 * User Settings Manager
 * 1:1 Port of CakePHP UserSettings.php model
 * Handles hierarchical role overrides, agent/branch constraints, stake limits,
 * and user-specific risk parameters.
 */

export const GROUP_IDS = {
  PLAYER_GROUP: 1,
  BRANCH_GROUP: 2,
  AGENT_GROUP: 3,
  AFFILIATE_GROUP: 4,
  RISK_MANAGER_GROUP: 5,
  ADMIN_GROUP: 6,
} as const;

export interface UserSettingRecord {
  id: string;
  userId: string;
  groupId: number;
  model: string;
  key: string;
  value: string | number | boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DefaultGroupSettings {
  highest_number_of_agents?: number | null;
  highest_number_of_users?: number | null;
  highest_stake_of_agents_users?: number;
  lowest_stake_of_agents_users?: number;
  highest_winning_amount_of_agents_users?: number;
}

export class UserSettingsManager {
  private static instance: UserSettingsManager;
  private settingsStore: Map<string, UserSettingRecord[]> = new Map(); // userId -> records

  private defaultGroupSettings: Record<number, DefaultGroupSettings> = {
    [GROUP_IDS.BRANCH_GROUP]: {
      highest_number_of_agents: 50,
      highest_number_of_users: 500,
      highest_stake_of_agents_users: 5000,
      lowest_stake_of_agents_users: 1,
      highest_winning_amount_of_agents_users: 50000,
    },
    [GROUP_IDS.AGENT_GROUP]: {
      highest_stake_of_agents_users: 2500,
      lowest_stake_of_agents_users: 1,
      highest_winning_amount_of_agents_users: 25000,
    },
  };

  private constructor() {}

  public static getInstance(): UserSettingsManager {
    if (!UserSettingsManager.instance) {
      UserSettingsManager.instance = new UserSettingsManager();
    }
    return UserSettingsManager.instance;
  }

  public setSetting(
    userId: string,
    key: string,
    value: string | number | boolean,
    model: string = 'Staff',
    groupId: number = GROUP_IDS.AGENT_GROUP
  ): UserSettingRecord {
    const list = this.settingsStore.get(userId) || [];
    const existing = list.find((s) => s.key === key && s.model === model);

    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
      return existing;
    }

    const newRecord: UserSettingRecord = {
      id: `usr-set-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId,
      groupId,
      model,
      key,
      value,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    list.push(newRecord);
    this.settingsStore.set(userId, list);
    return newRecord;
  }

  public getSetting<T = any>(
    key: string,
    userId?: string,
    groupId: number = GROUP_IDS.AGENT_GROUP
  ): T | null {
    if (userId) {
      const userSettings = this.settingsStore.get(userId) || [];
      const match = userSettings.find((s) => s.key === key);
      if (match) return match.value as T;
    }

    const groupDefaults = this.defaultGroupSettings[groupId] as any;
    if (groupDefaults && groupDefaults[key] !== undefined) {
      return groupDefaults[key] as T;
    }

    return null;
  }

  public getDefaultSettingsByGroup(groupId: number): DefaultGroupSettings {
    return this.defaultGroupSettings[groupId] || {};
  }

  public validateHighestNumberOfAgents(currentAgentsCount: number, limit: number): boolean {
    return currentAgentsCount <= limit;
  }

  public validateStakeLimits(stake: number, minStake: number, maxStake: number): boolean {
    return stake >= minStake && stake <= maxStake;
  }

  public validateWinningLimit(potentialWinning: number, maxWin: number): boolean {
    return potentialWinning <= maxWin;
  }
}
