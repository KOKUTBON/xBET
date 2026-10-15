/**
 * Base AppController - 1:1 CakePHP 2.x Controller Layer Emulation in TypeScript
 * Handles Request / Response lifecycle, Auth checks, Component composition,
 * Pagination, and Flash messages.
 */

import { IncomingMessage, ServerResponse } from 'http';
import {
  AdminComponent,
  AppComponent,
  EmailComponent,
  FilesComponent,
  ImagesComponent,
  LanguageComponent,
  PhpExcelComponent,
  TimeZoneComponent,
  UtilsComponent,
} from '../components/cake-components.ts';

export interface CakeRequest {
  params: {
    controller?: string;
    action?: string;
    pass?: string[];
    named?: Record<string, string>;
    prefix?: string;
    admin?: boolean;
    plugin?: string;
  };
  query: Record<string, string>;
  data: Record<string, any>;
  session: Record<string, any>;
  user?: {
    id: string | number;
    username: string;
    group_id: number;
    role: string;
    email: string;
  } | null;
}

export interface CakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  viewVars: Record<string, any>;
  redirectUrl?: string;
}

export class AppController {
  public name: string = 'App';
  public uses: string[] = [];
  public components: Record<string, any> = {};
  public request: CakeRequest;
  public response: CakeResponse;

  // Components
  public Admin: AdminComponent;
  public App: AppComponent;
  public Email: EmailComponent;
  public Files: FilesComponent;
  public Images: ImagesComponent;
  public Language: LanguageComponent;
  public PhpExcel: PhpExcelComponent;
  public TimeZone: TimeZoneComponent;
  public Utils: UtilsComponent;

  constructor(req?: Partial<CakeRequest>) {
    this.request = {
      params: { action: 'index', pass: [], named: {} },
      query: {},
      data: {},
      session: {},
      user: null,
      ...req,
    };

    this.response = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: null,
      viewVars: {},
    };

    // Instantiate components
    this.Admin = new AdminComponent();
    this.App = new AppComponent();
    this.Email = new EmailComponent();
    this.Files = new FilesComponent();
    this.Images = new ImagesComponent();
    this.Language = new LanguageComponent();
    this.PhpExcel = new PhpExcelComponent();
    this.TimeZone = new TimeZoneComponent();
    this.Utils = new UtilsComponent();
  }

  public beforeFilter(): boolean {
    // Check admin action prefix authorization
    if (this.request.params.admin || (this.request.params.action && this.request.params.action.startsWith('admin_'))) {
      const userGroup = this.request.user?.group_id || 1;
      if (userGroup < 2) {
        this.setFlash('You are not authorized to access this administrative area.', 'error');
        this.response.statusCode = 403;
        this.response.body = { error: 'Forbidden', message: 'Unauthorized administrative access' };
        return false;
      }
    }
    return true;
  }

  public set(key: string | Record<string, any>, value?: any): void {
    if (typeof key === 'object') {
      Object.assign(this.response.viewVars, key);
    } else {
      this.response.viewVars[key] = value;
    }
  }

  public setFlash(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    this.request.session.flash = { message, type };
  }

  public redirect(url: string, status: number = 302): void {
    this.response.statusCode = status;
    this.response.redirectUrl = url;
    this.response.headers['Location'] = url;
  }

  public paginate(modelInstance: any, conditions: Record<string, any> = {}, limit: number = 20, page: number = 1): { data: any[]; total: number; page: number; limit: number } {
    const offset = (page - 1) * limit;
    const data = modelInstance.find('all', { conditions, limit, offset });
    const total = modelInstance.find('count', { conditions });
    return { data, total, page, limit };
  }

  public renderJson(data: any, status: number = 200): CakeResponse {
    this.response.statusCode = status;
    this.response.headers['Content-Type'] = 'application/json';
    this.response.body = data;
    return this.response;
  }

  public __getModel(modelName?: string): string {
    const resolved = modelName || this.name;
    this.set('model', resolved);
    this.set('tabs', []);
    this.set('orderable', true);
    this.set('translate', false);
    return resolved;
  }

  public admin_translate(id: string | number, locale?: string): CakeResponse {
    if (!this.beforeFilter()) return this.response;
    const lang = locale || this.request.query?.locale || 'eng';
    this.set('locale', lang);
    return this.renderJson({ status: 'ok', id, locale: lang, message: 'Translation loaded' });
  }

  public admin_moveUp(id: string | number): CakeResponse {
    if (!this.beforeFilter()) return this.response;
    return this.renderJson({ status: 'ok', id, direction: 'up', message: 'Item moved up' });
  }

  public admin_moveDown(id: string | number): CakeResponse {
    if (!this.beforeFilter()) return this.response;
    return this.renderJson({ status: 'ok', id, direction: 'down', message: 'Item moved down' });
  }
}

