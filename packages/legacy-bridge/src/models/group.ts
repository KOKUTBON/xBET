/**
 * Converted CakePHP Group Model
 * Handles 1:1 user role group hierarchy, constants, and permission scopes.
 */

import { AppModel } from './AppModel.ts';

export class Group extends AppModel {
  public static readonly GUEST_GROUP = 1;
  public static readonly USER_GROUP = 2;
  public static readonly ADMINISTRATOR_GROUP = 3;
  public static readonly OPERATOR_GROUP = 4;
  public static readonly CASHIER_GROUP = 5;
  public static readonly AGENT_GROUP = 6;
  public static readonly BRANCH_GROUP = 7;

  private static groups: Record<number, string> = {
    1: 'Guests',
    2: 'Users',
    3: 'Administrators',
    4: 'Operators',
    5: 'Cashiers',
    6: 'Agents',
    7: 'Branches',
  };

  constructor() {
    super('Group', 'groups');
    this.displayField = 'name';
    this.hasMany = {
      User: { className: 'User', foreignKey: 'group_id' },
    };
  }

  public static getGroups(): Record<number, string> {
    return { ...this.groups };
  }

  /**
   * 1:1 Port of Group::getAdminGroups()
   */
  public static getAdminGroups(currentUser?: { group_id: number }): Record<number, string> {
    const all = this.getGroups();
    const result: Record<number, string> = {};

    if (!currentUser) {
      for (const [k, v] of Object.entries(all)) {
        const gid = Number(k);
        if (gid !== this.GUEST_GROUP && gid !== this.USER_GROUP) {
          result[gid] = v;
        }
      }
      return result;
    }

    switch (currentUser.group_id) {
      case this.ADMINISTRATOR_GROUP:
        for (const [k, v] of Object.entries(all)) {
          const gid = Number(k);
          if (gid !== this.GUEST_GROUP && gid !== this.USER_GROUP) {
            result[gid] = v;
          }
        }
        break;
      case this.BRANCH_GROUP:
        result[this.AGENT_GROUP] = all[this.AGENT_GROUP];
        break;
      default:
        break;
    }

    return result;
  }
}
