/**
 * Converted CakePHP StaffsController
 * Handles 1:1 Staffs / Agents / Cashiers administrative operations and hierarchical trees.
 */

import { Group } from '../models/group.ts';
import { AppController } from './AppController.ts';

export interface StaffRecord {
  id: number | string;
  username: string;
  group_id: number;
  referal_id?: number | string | null;
  status: number;
  password?: string;
}

export class StaffsController extends AppController {
  private staffs: Map<string, StaffRecord> = new Map();

  constructor(req?: any) {
    super(req);
    this.name = 'Staffs';
    this.seedDefaultStaffs();
  }

  public admin_index(): any {
    const user = this.request.user || { id: 1, group_id: Group.ADMINISTRATOR_GROUP };
    return this.renderJson(this.adminIndex(user, this.request.params.pass));
  }

  public admin_add(): any {
    return this.renderJson(this.adminAdd(this.request.data));
  }

  public admin_edit(id?: string | number): any {
    const staffId = id || this.request.params.pass?.[0];
    return this.renderJson(this.adminEdit(staffId, this.request.data));
  }

  public admin_deposit_bonus_history(staffId?: string | number): any {
    return this.renderJson({ staffId, history: [] });
  }

  private seedDefaultStaffs(): void {
    this.staffs.set('1', { id: 1, username: 'superadmin', group_id: Group.ADMINISTRATOR_GROUP, referal_id: null, status: 1 });
    this.staffs.set('2', { id: 2, username: 'london_branch', group_id: Group.BRANCH_GROUP, referal_id: 1, status: 1 });
    this.staffs.set('3', { id: 3, username: 'agent_soho', group_id: Group.AGENT_GROUP, referal_id: 2, status: 1 });
    this.staffs.set('4', { id: 4, username: 'cashier_01', group_id: Group.CASHIER_GROUP, referal_id: 3, status: 1 });
  }

  /**
   * 1:1 Port of StaffsController::admin_index($conditions, $model)
   */
  public adminIndex(
    currentUser: { id: number | string; group_id: number },
    passParams: (string | number | null)[] = []
  ): { data: StaffRecord[]; group_id: string | number | null } {
    const groupIdParam = passParams[0] !== undefined ? passParams[0] : null;
    const childIdParam = passParams[1] !== undefined ? passParams[1] : null;

    let filtered: StaffRecord[] = Array.from(this.staffs.values());

    switch (currentUser.group_id) {
      case Group.ADMINISTRATOR_GROUP: {
        filtered = filtered.filter((s) => s.group_id !== Group.USER_GROUP || groupIdParam !== null);
        if (groupIdParam !== null) {
          if (childIdParam !== null && !isNaN(Number(childIdParam))) {
            const gid = Number(groupIdParam);
            const cid = Number(childIdParam);
            if (gid === Group.BRANCH_GROUP) {
              filtered = filtered.filter((s) => s.group_id === Group.AGENT_GROUP && Number(s.referal_id) === cid);
            } else if (gid === Group.AGENT_GROUP) {
              filtered = filtered.filter((s) => s.group_id === Group.USER_GROUP && Number(s.referal_id) === cid);
            }
          } else {
            filtered = filtered.filter((s) => s.group_id === Number(groupIdParam));
          }
        }
        break;
      }

      case Group.BRANCH_GROUP: {
        filtered = filtered.filter((s) => s.group_id === Group.AGENT_GROUP && String(s.referal_id) === String(currentUser.id));
        break;
      }

      default: {
        filtered = filtered.filter((s) => String(s.id) === String(currentUser.id));
        break;
      }
    }

    return {
      data: filtered,
      group_id: groupIdParam,
    };
  }

  /**
   * 1:1 Port of StaffsController::admin_add
   */
  public adminAdd(data: { username: string; password_raw: string; group_id: number; referal_id?: number | string }): StaffRecord {
    const id = this.staffs.size + 1;
    const newStaff: StaffRecord = {
      id,
      username: data.username,
      group_id: data.group_id,
      referal_id: data.referal_id || null,
      status: 1,
      password: `hashed_${data.password_raw}`,
    };
    this.staffs.set(String(id), newStaff);
    return newStaff;
  }

  /**
   * 1:1 Port of StaffsController::admin_edit
   */
  public adminEdit(id: number | string, data: Partial<StaffRecord> & { password?: string }): StaffRecord {
    const staff = this.staffs.get(String(id));
    if (!staff) throw new Error(`Staff with ID ${id} not found`);

    if (data.username) staff.username = data.username;
    if (data.group_id) staff.group_id = data.group_id;
    if (data.referal_id !== undefined) staff.referal_id = data.referal_id;
    if (data.status !== undefined) staff.status = data.status;
    if (data.password && data.password.trim() !== '') {
      staff.password = `hashed_${data.password}`;
    }

    return staff;
  }
}
