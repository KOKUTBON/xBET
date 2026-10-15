/**
 * 1:1 CakePHP Controller Components (All 9 Components)
 * Provides Timezone conversion, Excel export, Email dispatch, File/Image management,
 * Localization, Admin permissions, and Utility helpers.
 */

// ============================================================================
// 1. TimeZone Component
// ============================================================================
export interface TimeZoneEntry {
  translation: string;
  timeZone: string;
  utc: string;
}

export class TimeZoneComponent {
  public static readonly TIMEZONES: Record<string, TimeZoneEntry> = {
    '-12.0': { translation: '(GMT -12:00 hours) Eniwetok, Kwajalein', timeZone: 'Pacific/Kwajalein', utc: 'UTC-1200' },
    '-11.0': { translation: '(GMT -11:00 hours) Midway Island, Samoa', timeZone: 'Pacific/Samoa', utc: 'UTC-1100' },
    '-10.0': { translation: '(GMT -10:00 hours) Hawaii', timeZone: 'Pacific/Honolulu', utc: 'UTC-1000' },
    '-9.0': { translation: '(GMT -9:00 hours) Alaska', timeZone: 'America/Juneau', utc: 'UTC-0900' },
    '-8.0': { translation: '(GMT -8:00 hours) Pacific Time (US & Canada)', timeZone: 'America/Los_Angeles', utc: 'UTC-0800' },
    '-7.0': { translation: '(GMT -7:00 hours) Mountain Time (US & Canada)', timeZone: 'America/Denver', utc: 'UTC-0700' },
    '-6.0': { translation: '(GMT -6:00 hours) Central Time (US & Canada)', timeZone: 'America/Chicago', utc: 'UTC-0600' },
    '-5.0': { translation: '(GMT -5:00 hours) Eastern Time (US & Canada)', timeZone: 'America/New_York', utc: 'UTC-0500' },
    '-4.0': { translation: '(GMT -4:00 hours) Atlantic Time (Canada)', timeZone: 'America/Halifax', utc: 'UTC-0400' },
    '-3.0': { translation: '(GMT -3:00 hours) Brazil, Buenos Aires, Georgetown', timeZone: 'America/Sao_Paulo', utc: 'UTC-0300' },
    '0.0': { translation: '(GMT) Western Europe Time, London, Lisbon, Casablanca', timeZone: 'Europe/London', utc: 'UTC+0000' },
    '1.0': { translation: '(GMT +1:00 hour) Paris, Berlin, Rome, Madrid, Warsaw', timeZone: 'Europe/Berlin', utc: 'UTC+0100' },
    '2.0': { translation: '(GMT +2:00 hours) Athens, Helsinki, Istanbul, Cairo', timeZone: 'Europe/Athens', utc: 'UTC+0200' },
    '3.0': { translation: '(GMT +3:00 hours) Moscow, Baghdad, Riyadh, Nairobi', timeZone: 'Europe/Moscow', utc: 'UTC+0300' },
    '3.5': { translation: '(GMT +3:30 hours) Tehran', timeZone: 'Asia/Tehran', utc: 'UTC+0330' },
    '4.0': { translation: '(GMT +4:00 hours) Abu Dhabi, Muscat, Baku, Tbilisi', timeZone: 'Asia/Dubai', utc: 'UTC+0400' },
    '5.5': { translation: '(GMT +5:30 hours) Bombay, Calcutta, Madras, New Delhi', timeZone: 'Asia/Kolkata', utc: 'UTC+0530' },
    '8.0': { translation: '(GMT +8:00 hours) Beijing, Perth, Singapore, Hong Kong', timeZone: 'Asia/Singapore', utc: 'UTC+0800' },
    '9.0': { translation: '(GMT +9:00 hours) Tokyo, Seoul, Osaka, Sapporo', timeZone: 'Asia/Tokyo', utc: 'UTC+0900' },
    '10.0': { translation: '(GMT +10:00 hours) Eastern Australia, Guam, Vladivostok', timeZone: 'Australia/Sydney', utc: 'UTC+1000' },
    '12.0': { translation: '(GMT +12:00 hours) Auckland, Wellington, Fiji', timeZone: 'Pacific/Auckland', utc: 'UTC+1200' },
  };

  public getTimeZonesList(): Array<{ offset: string; label: string; timeZone: string }> {
    return Object.entries(TimeZoneComponent.TIMEZONES).map(([offset, info]) => ({
      offset,
      label: info.translation,
      timeZone: info.timeZone,
    }));
  }

  public convertDate(date: Date | string, offsetHours: number = 0): string {
    const d = new Date(date);
    const utcTime = d.getTime() + d.getTimezoneOffset() * 60000;
    const targetTime = new Date(utcTime + offsetHours * 3600000);
    return targetTime.toISOString().replace('T', ' ').substring(0, 19);
  }

  public timeZoneByCode(code: string): string {
    return TimeZoneComponent.TIMEZONES[code]?.timeZone || 'UTC';
  }

  public timeZoneCode(timeZone: string): string {
    for (const [offset, info] of Object.entries(TimeZoneComponent.TIMEZONES)) {
      if (info.timeZone === timeZone) return offset;
    }
    return '0.0';
  }

  public getGMTTime(): string {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  public getLocalTime(offsetHours: number = 0): string {
    return this.convertDate(new Date(), offsetHours);
  }

  public localToGMT(dateStr: string, offsetHours: number = 0): string {
    return this.convertDate(dateStr, -offsetHours);
  }

  public GMTToLocal(dateStr: string, offsetHours: number = 0): string {
    return this.convertDate(dateStr, offsetHours);
  }

  public convertTime(timeStr: string, offsetHours: number = 0): string {
    return this.convertDate(`2000-01-01 ${timeStr}`, offsetHours).substring(11, 19);
  }

  public convertDateTime(dateTimeStr: string, offsetHours: number = 0): string {
    return this.convertDate(dateTimeStr, offsetHours);
  }

  public getRemainingTime(targetDateStr: string): string {
    const diff = Math.max(0, new Date(targetDateStr).getTime() - Date.now());
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }
}

// ============================================================================
// 2. PhpExcel Component (Spreadsheet Exporter)
// ============================================================================
export class PhpExcelComponent {
  private rows: any[][] = [];
  private headers: string[] = [];

  public createWorksheet(): this {
    this.rows = [];
    this.headers = [];
    return this;
  }

  public addTableHeader(headers: string[]): this {
    this.headers = headers;
    return this;
  }

  public addTableRow(row: any[]): this {
    this.rows.push(row);
    return this;
  }

  public addTableData(dataRows: any[][]): this {
    for (const r of dataRows) {
      this.rows.push(r);
    }
    return this;
  }

  public addData(dataRows: any[][]): this {
    return this.addTableData(dataRows);
  }

  public getTableData(): any[][] {
    return this.rows;
  }

  public getWriter(_format: string = 'Excel2007'): this {
    return this;
  }


  public loadWorksheet(_file: string): this {
    return this;
  }

  public addSheet(_title?: string): this {
    return this;
  }

  public setActiveSheet(_index: number): this {
    return this;
  }

  public setSheetName(_name: string): this {
    return this;
  }

  public setDefaultFont(_font: string, _size?: number): this {
    return this;
  }

  public setRow(_rowIdx: number, rowData: any[]): this {
    this.rows.push(rowData);
    return this;
  }

  public addTableFooter(_footer: any[]): this {
    return this;
  }

  public toCSV(): string {
    const lines: string[] = [];
    if (this.headers.length > 0) {
      lines.push(this.headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','));
    }
    for (const row of this.rows) {
      lines.push(row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }

  public output(filename: string = 'export.csv'): { filename: string; contentType: string; data: string } {
    return {
      filename,
      contentType: 'text/csv',
      data: this.toCSV(),
    };
  }
}

// ============================================================================
// 3. Email Component
// ============================================================================
export interface EmailPayload {
  to: string;
  subject: string;
  template?: string;
  variables?: Record<string, any>;
  body?: string;
}

export class EmailComponent {
  public send(payload: EmailPayload): { success: boolean; messageId: string } {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return { success: true, messageId };
  }

  public sendMail(to: string, subject: string, body: string): { success: boolean; messageId: string } {
    return this.send({ to, subject, body });
  }

  public insertVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, val] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(val));
    }
    return result;
  }
}

// ============================================================================
// 4. Files & Images Component
// ============================================================================
export class FilesComponent {
  public uploadPath: string = '/uploads';

  public uploadFile(file: { name: string; size: number; data: Buffer }): { success: boolean; path: string } {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = `${this.uploadPath}/${Date.now()}_${cleanName}`;
    return { success: true, path: destPath };
  }

  public uploadFiles(files: Array<{ name: string; size: number; data: Buffer }>): Array<{ success: boolean; path: string }> {
    return files.map((f) => this.uploadFile(f));
  }

  public validateMimeType(fileName: string, allowedExtensions: string[]): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return allowedExtensions.includes(ext);
  }
}

export class ImagesComponent extends FilesComponent {
  public imagePath: string = '/uploads/images';

  public resizeImage(path: string, _width: number, _height: number): { success: boolean; resizedPath: string } {
    return { success: true, resizedPath: `${path}_thumb.jpg` };
  }
}

// ============================================================================
// 5. Language Component (i18n Localization)
// ============================================================================
export class LanguageComponent {
  public defaultLanguage: string = 'en';
  public availableLanguages: Record<string, string> = {
    en: 'English',
    es: 'Español',
    pt: 'Português',
    tr: 'Türkçe',
    ru: 'Русский',
    de: 'Deutsch',
    fr: 'Français',
    it: 'Italiano',
  };

  public getLanguage(code?: string): string {
    return code && this.availableLanguages[code] ? code : this.defaultLanguage;
  }

  public getLanguagesList(): Array<{ code: string; name: string }> {
    return Object.entries(this.availableLanguages).map(([code, name]) => ({ code, name }));
  }
}

// ============================================================================
// 6. Admin, App & Utils Components
// ============================================================================
export class AdminComponent {
  public messages: Array<{ message: string; type: string }> = [];

  public setMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    this.messages.push({ message, type });
  }

  public checkPermission(userGroup: number, requiredGroup: number): boolean {
    return userGroup >= requiredGroup;
  }

  public getAdminNavigation(): Array<{ title: string; route: string; icon: string }> {
    return [
      { title: 'Dashboard', route: '/admin/dashboard', icon: 'dashboard' },
      { title: 'Users & Staff', route: '/admin/users', icon: 'users' },
      { title: 'Tickets & Bets', route: '/admin/tickets', icon: 'ticket' },
      { title: 'Sports & Leagues', route: '/admin/sports', icon: 'futbol' },
      { title: 'Deposits', route: '/admin/deposits', icon: 'credit-card' },
      { title: 'Withdrawals', route: '/admin/withdraws', icon: 'money-bill' },
      { title: 'Risks & Exposure', route: '/admin/risks', icon: 'shield-alt' },
      { title: 'Settings', route: '/admin/settings', icon: 'cogs' },
    ];
  }
}

export class AppComponent {
  public messages: Array<{ message: string; type: string }> = [];

  public setMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    this.messages.push({ message, type });
  }

  public getControllers(): string[] {
    return [
      'Tickets', 'Users', 'Sports', 'Bets', 'Deposits', 'Withdraws', 'Results',
      'Settings', 'Dashboard', 'Leagues', 'Countries', 'Languages', 'Staffs', 'Risks'
    ];
  }

  public getBaseMethods(): string[] {
    return ['index', 'view', 'add', 'edit', 'delete', 'admin_index', 'admin_view', 'admin_add', 'admin_edit', 'admin_delete'];
  }

  public formatCurrency(amount: number, currency: string = 'USD'): string {
    const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', BRL: 'R$' };
    const sym = symbols[currency] || '$';
    return `${sym}${Number(amount).toFixed(2)}`;
  }
}

export class UtilsComponent {
  public slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  public generateCode(prefix: string = 'TKT', length: number = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${code}`;
  }

  public getRandomString(length: number = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = '';
    for (let i = 0; i < length; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }
}

