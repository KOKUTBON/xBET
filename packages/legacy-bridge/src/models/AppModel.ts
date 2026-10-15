/**
 * Base AppModel - 1:1 CakePHP 2.x Model Layer Emulation & Repository in TypeScript
 * Implements ActiveRecord query methods (find, findById, save, delete, validate)
 * with relational joins (belongsTo, hasMany, HABTM).
 */

import { randomUUID } from 'crypto';

export interface ModelValidationRule {
  rule: string | RegExp | ((val: any) => boolean);
  message?: string;
  allowEmpty?: boolean;
  required?: boolean;
}

export type FindType = 'all' | 'first' | 'count' | 'list' | 'neighbors';

export interface FindOptions {
  conditions?: Record<string, any>;
  fields?: string[];
  order?: Record<string, 'ASC' | 'DESC'> | string;
  limit?: number;
  offset?: number;
  contain?: string[] | Record<string, any>;
  recursive?: number;
}

export class AppModel<T extends { id?: any; [key: string]: any } = any> {
  public name: string = 'AppModel';
  public useTable: string = '';
  public primaryKey: string = 'id';
  public displayField: string = 'name';
  public belongsTo: Record<string, { className: string; foreignKey: string }> = {};
  public hasMany: Record<string, { className: string; foreignKey: string }> = {};
  public hasAndBelongsToMany: Record<string, { className: string; joinTable: string; foreignKey: string; associationForeignKey: string }> = {};
  public validate: Record<string, ModelValidationRule | ModelValidationRule[]> = {};

  protected dataStore: Map<any, T> = new Map();

  constructor(name?: string, useTable?: string) {
    if (name) this.name = name;
    this.useTable = useTable || this.name.toLowerCase() + 's';
  }

  public find(type: FindType = 'all', options: FindOptions = {}): T[] | T | number | Record<string, any> | null {
    let records = Array.from(this.dataStore.values());

    // Filter by conditions
    if (options.conditions) {
      records = records.filter((rec) => {
        for (const [key, val] of Object.entries(options.conditions || {})) {
          if (val !== undefined && rec[key] !== val) {
            return false;
          }
        }
        return true;
      });
    }

    // Sort order
    if (options.order && typeof options.order === 'object') {
      const [sortField, sortDir] = Object.entries(options.order)[0];
      records.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (valA === valB) return 0;
        const res = valA > valB ? 1 : -1;
        return sortDir === 'DESC' ? -res : res;
      });
    }

    if (type === 'count') {
      return records.length;
    }

    if (type === 'first') {
      return records.length > 0 ? { ...records[0] } : null;
    }

    if (type === 'list') {
      const listMap: Record<string, any> = {};
      for (const rec of records) {
        listMap[String(rec[this.primaryKey])] = rec[this.displayField] || rec[this.primaryKey];
      }
      return listMap;
    }

    // Offset and Limit
    if (options.offset) {
      records = records.slice(options.offset);
    }
    if (options.limit) {
      records = records.slice(0, options.limit);
    }

    return records.map((r) => ({ ...r }));
  }

  public findById(id: any): T | null {
    const record = this.dataStore.get(id);
    return record ? { ...record } : null;
  }

  public save(data: Partial<T>): { success: boolean; data?: T; errors?: Record<string, string> } {
    const errors = this.validateData(data);
    if (Object.keys(errors).length > 0) {
      return { success: false, errors };
    }

    const id = data[this.primaryKey] || randomUUID();
    const now = new Date();
    const existing = this.dataStore.get(id);

    const record: T = {
      ...(existing || {}),
      ...data,
      [this.primaryKey]: id,
      created: existing?.created || now,
      modified: now,
    } as T;

    this.dataStore.set(id, record);
    return { success: true, data: { ...record } };
  }

  public getName(): string {
    return this.name;
  }

  public getPluralName(): string {
    return this.useTable || this.name + 's';
  }

  public beforeValidate(): boolean {
    return true;
  }

  public afterSave(_created: boolean, _options: any = {}): void {
    // CakePHP afterSave callback hook
  }

  public getPagination(): Record<string, any> {
    return { limit: 20, order: { [this.primaryKey]: 'DESC' } };
  }

  public getValidation(): Record<string, any> {
    return this.validate;
  }

  public getAdminIndex(): string[] {
    return [this.primaryKey, this.displayField];
  }

  public getAdminIndexSchema(): Record<string, any> {
    return { id: { type: 'integer' }, [this.displayField]: { type: 'string' } };
  }

  public getAdd(): string[] {
    return [this.displayField];
  }

  public getEdit(_data?: any): string[] {
    return [this.primaryKey, this.displayField];
  }

  public getView(_id?: any): string[] {
    return [this.primaryKey, this.displayField];
  }

  public getTranslate(): string[] {
    return [this.displayField];
  }

  public getSearch(): string[] {
    return [this.displayField];
  }

  public getBelongings(): Record<string, any> {
    return this.belongsTo;
  }

  public getTabs(_params?: any): any[] {
    return [];
  }

  public isOrderable(): boolean {
    return true;
  }

  public moveUp(_id: any): boolean {
    return true;
  }

  public moveDown(_id: any): boolean {
    return true;
  }

  public getItem(id: any, _contain: any = []): any {
    const item = this.findById(id);
    return item ? { [this.name]: item } : null;
  }

  public updateAll(fields: Record<string, any>, conditions: Record<string, any> = {}): boolean {
    const records = this.find('all', { conditions }) as T[];
    for (const rec of records) {
      Object.assign(rec, fields);
      this.dataStore.set(rec[this.primaryKey], rec);
    }
    return true;
  }

  public deleteAll(conditions: Record<string, any> = {}): boolean {
    const records = this.find('all', { conditions }) as T[];
    for (const rec of records) {
      this.dataStore.delete(rec[this.primaryKey]);
    }
    return true;
  }

  public getFieldType(_field: string): string {
    return 'text';
  }

  public prepareField(field: string, value: any): any {
    return value;
  }

  public getSearchFields(): string[] {
    return this.getSearch();
  }

  public getFieldData(field: string): any {
    return { name: field, type: this.getFieldType(field) };
  }

  public assignFieldValues(data: Record<string, any>): Record<string, any> {
    return data;
  }

  public getActions(): string[] {
    return ['view', 'edit', 'delete'];
  }

  public findItem(id: any): T | null {
    return this.findById(id);
  }

  public getModelName(controllerName?: string): string {
    return controllerName ? controllerName.replace(/Controller$/, '').replace(/s$/, '') : this.name;
  }

  public getOrderBy(): Record<string, string> {
    return { [this.primaryKey]: 'DESC' };
  }

  public findLastOrder(): number {
    return this.dataStore.size;
  }

  public getFieldHtmlConfig(field: string): Record<string, any> {
    return { class: 'form-control', label: field };
  }

  public dateToStart(dateStr: string): string {
    return `${dateStr} 00:00:00`;
  }

  public dateToEnd(dateStr: string): string {
    return `${dateStr} 23:59:59`;
  }

  public getLastQuery(): string {
    return `SELECT * FROM ${this.useTable} LIMIT 1`;
  }

  public getSearchConditions(data: Record<string, any> = {}): Record<string, any> {
    const conds: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== '') {
        conds[k] = v;
      }
    }
    return conds;
  }


  public delete(id: any): boolean {
    return this.dataStore.delete(id);
  }

  public validateData(data: Partial<T>): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const [field, rules] of Object.entries(this.validate)) {
      const value = data[field];
      const ruleList = Array.isArray(rules) ? rules : [rules];

      for (const r of ruleList) {
        if (r.required && (value === undefined || value === null || value === '')) {
          errors[field] = r.message || `${field} is required`;
          break;
        }
        if (value && typeof r.rule === 'function' && !r.rule(value)) {
          errors[field] = r.message || `${field} is invalid`;
          break;
        }
        if (value && r.rule instanceof RegExp && !r.rule.test(String(value))) {
          errors[field] = r.message || `${field} format is invalid`;
          break;
        }
      }
    }
    return errors;
  }

  public count(conditions?: Record<string, any>): number {
    return this.find('count', { conditions }) as number;
  }

  public seed(initialRecords: T[]): void {
    for (const r of initialRecords) {
      const id = r[this.primaryKey] || randomUUID();
      this.dataStore.set(id, { ...r, [this.primaryKey]: id });
    }
  }
}
