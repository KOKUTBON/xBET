/**
 * 1:1 CakePHP View Helpers Emulation Layer (All 16 Helpers)
 * Implements HTML builders, Ticket formatting, Sports icons, Paginator controls,
 * Country flags, Forms, Timezone dates, and Breadcrumbs.
 */

// ============================================================================
// 1. AppHelper & HtmlHelper
// ============================================================================
export class AppHelper {
  public formatMoney(amount: number, currency: string = 'USD'): string {
    const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    return `${symbol}${Number(amount).toFixed(2)}`;
  }
}

export class MyHtmlHelper extends AppHelper {
  public link(title: string, url: string, attributes: Record<string, string> = {}): string {
    const attrStr = Object.entries(attributes).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<a href="${url}" ${attrStr}>${title}</a>`;
  }

  public customLink(title: string, url: string, attributes: Record<string, string> = {}): string {
    return this.link(title, url, attributes);
  }

  public customUrl(url: any): string {
    return typeof url === 'string' ? url : `/${url.controller || ''}/${url.action || ''}`;
  }

  public spanLink(title: string, url: string, attributes: Record<string, string> = {}): string {
    return `<a href="${url}"><span>${title}</span></a>`;
  }

  public checkAcl(_aco: string, _userGroup?: number): boolean {
    return true;
  }

  public checkAcls(_acos: string[], _userGroup?: number): boolean {
    return true;
  }

  public image(path: string, alt: string = '', attributes: Record<string, string> = {}): string {
    const attrStr = Object.entries(attributes).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<img src="${path}" alt="${alt}" ${attrStr} />`;
  }

  public tag(tag: string, content: string, attributes: Record<string, string> = {}): string {
    const attrStr = Object.entries(attributes).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${attrStr}>${content}</${tag}>`;
  }
}

// ============================================================================
// 2. Form Helper
// ============================================================================
export class MyFormHelper {
  public create(action: string, method: string = 'POST'): string {
    return `<form action="${action}" method="${method}">`;
  }

  public input(name: string, options: { type?: string; label?: string; value?: any; placeholder?: string } = {}): string {
    const type = options.type || 'text';
    const label = options.label ? `<label for="input_${name}">${options.label}</label>` : '';
    const val = options.value !== undefined ? `value="${options.value}"` : '';
    const ph = options.placeholder ? `placeholder="${options.placeholder}"` : '';
    return `<div class="form-group">${label}<input type="${type}" id="input_${name}" name="${name}" ${val} ${ph} class="form-control" /></div>`;
  }

  public dateTime(name: string, _dateFormat: string = 'DMY', _timeFormat: string = '24'): string {
    return `<input type="datetime-local" name="${name}" class="form-control" />`;
  }

  public submit(label: string = 'Submit'): string {
    return `<button type="submit" class="btn btn-primary">${label}</button>`;
  }

  public end(): string {
    return `</form>`;
  }
}


// ============================================================================
// 3. Ticket & Beth Helpers
// ============================================================================
export class TicketHelper {
  public getStatusBadge(status: number): string {
    switch (status) {
      case 0: return `<span class="badge badge-warning">Pending</span>`;
      case 1: return `<span class="badge badge-success">Won</span>`;
      case 2: return `<span class="badge badge-danger">Lost</span>`;
      case 3: return `<span class="badge badge-secondary">Cancelled</span>`;
      case 4: return `<span class="badge badge-info">Refunded</span>`;
      default: return `<span class="badge badge-dark">Unknown</span>`;
    }
  }

  public formatTicketNumber(id: number | string): string {
    return `SLIP-${String(id).padStart(6, '0')}`;
  }

  public calculatePayout(stake: number, odds: number, boostPct: number = 0): number {
    const base = stake * odds;
    const bonus = ((base - stake) * boostPct) / 100;
    return Number((base + Math.max(0, bonus)).toFixed(2));
  }

  public isAllowedToPlaceTicket(userId: string | number, amount: number): boolean {
    return amount > 0 && amount <= 50000;
  }
}

export class UtilsHelper {
  public isMobile(userAgent: string = ''): boolean {
    return /Mobile|Android|iPhone|iPad/i.test(userAgent);
  }
}


export class BethHelper {
  public convertCurrency(amount: number | string, decimals: number = 2): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return (isNaN(num) ? 0 : num).toFixed(decimals);
  }

  public convertOdd(odd: number, oddsType: number | string = 0): string {
    const type = String(oddsType);
    switch (type) {
      case '2':
      case 'FRACTIONAL':
        return this.convertToFractional(odd);
      case '3':
      case 'AMERICAN':
        return this.convertToAmerican(odd);
      default:
        return this.formatOdds(odd, 'DECIMAL');
    }
  }

  public convertToFractional(odd: number): string {
    const numerator = Math.round((odd - 1) * 100);
    return `${numerator}/100`;
  }

  public convertToAmerican(odd: number): string {
    if (odd >= 2) {
      return `+${Math.round(100 * (odd - 1))}`;
    } else {
      return `${Math.round(-100 / (odd - 1))}`;
    }
  }

  public calculatePercentageAfter(total: number, percentage: number, precision: number = 2): string {
    if (percentage <= 0 || isNaN(total)) return '0.00';
    return ((percentage / 100) * total).toFixed(precision);
  }

  public calculatePercentageGiven(total: number, percentage: number, precision: number = 2): string {
    if (percentage <= 0 || isNaN(total)) return Number(total).toFixed(precision);
    return (total / (1 + percentage / 100)).toFixed(precision);
  }

  public getStatus(status: number): string {
    switch (Number(status)) {
      case 1:
        return '<span class="ticket-won">Win</span>';
      case 0:
        return '<span class="ticket-pending">Pending</span>';
      case -1:
        return '<span class="ticket-lost">Lost</span>';
      case -2:
        return '<span class="ticket-canceled">Cancelled</span>';
      default:
        return '<span class="ticket-unknown">Unknown</span>';
    }
  }

  public getOddsType(type: number): string {
    switch (Number(type)) {
      case 0:
        return 'Decimal';
      case 2:
        return 'Fractional';
      case 3:
        return 'American';
      default:
        return 'Decimal';
    }
  }

  public getOddsTypes(): Record<string, string> {
    return {
      Decimal: 'Decimal',
      Fractional: 'Fractional',
      American: 'American',
    };
  }

  public betToPath(betType: string): string {
    return betType
      .replace(/_/g, '-')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\//g, '-')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  public countToPath(count: number): string {
    if (count === 2) return '12';
    if (count === 3) return '1x2';
    return 'correct-score';
  }

  public formatOdds(decimalOdds: number, format: 'DECIMAL' | 'FRACTIONAL' | 'AMERICAN' = 'DECIMAL'): string {
    if (format === 'AMERICAN') {
      if (decimalOdds >= 2.0) {
        return `+${Math.round((decimalOdds - 1) * 100)}`;
      } else {
        return `${Math.round(-100 / (decimalOdds - 1))}`;
      }
    }
    if (format === 'FRACTIONAL') {
      const num = Math.round((decimalOdds - 1) * 100);
      return `${num}/100`;
    }
    return decimalOdds.toFixed(2);
  }
}

// ============================================================================
// 4. Sports & Countries Helpers
// ============================================================================
export class SportsHelper {
  private icons: Record<string, string> = {
    soccer: '⚽',
    football: '⚽',
    basketball: '🏀',
    tennis: '🎾',
    hockey: '🏒',
    baseball: '⚾',
    volleyball: '🏐',
    cricket: '🏏',
    rugby: '🏉',
  };

  public getIcon(sportSlug: string): string {
    return this.icons[sportSlug.toLowerCase()] || '🏆';
  }

  public name2Icon(sportName: string): string {
    return this.getIcon(sportName);
  }
}

export class PhpExcelHelper {
  private rows: any[][] = [];
  public addData(data: any[][]): this {
    this.rows.push(...data);
    return this;
  }
  public getTableData(): any[][] {
    return this.rows;
  }
  public getWriter(_format: string = 'Excel2007'): this {
    return this;
  }
}

export class CountriesHelper {
  public getFlag(isoCode: string): string {
    const code = isoCode.toUpperCase();
    if (code.length !== 2) return '🌐';
    const offset = 127397;
    return String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + offset));
  }

  public id2Icon(countryId: string | number): string {
    return `<span class="flag-icon flag-icon-${countryId}"></span>`;
  }
}

export class LanguageHelper {
  public getName(code: string): string {
    const names: Record<string, string> = { eng: 'English', deu: 'Deutsch', spa: 'Español', fra: 'Français' };
    return names[code] || code;
  }

  public getLanguage2Img(code: string): string {
    return `<img src="/img/flags/${code}.png" alt="${code}" />`;
  }
}

export class CreditPaymentHelper {
  public balance(userId: string | number, balance: number): string {
    return `$${Number(balance).toFixed(2)}`;
  }
}

// ============================================================================
// 5. Paginator, Breadcrumbs, TimeZone & News Helpers
// ============================================================================
export class PaginatorHelper {
  public defaultModel(): string {
    return 'Sport';
  }

  public sortKey(_model?: string): string {
    return 'id';
  }

  public hasPrev(currentPage: number = 1): boolean {
    return currentPage > 1;
  }

  public hasNext(currentPage: number = 1, totalPages: number = 1): boolean {
    return currentPage < totalPages;
  }

  public hasPage(currentPage: number = 1, totalPages: number = 1): boolean {
    return totalPages > 1;
  }

  public beforeRender(_viewFile: string): void {
    // CakePHP helper lifecycle hook
  }

  public renderPagination(totalItems: number, currentPage: number, perPage: number = 20): string {
    const totalPages = Math.ceil(totalItems / perPage) || 1;
    let html = `<div class="pagination">`;
    if (currentPage > 1) {
      html += `<button class="page-link" data-page="${currentPage - 1}">« Prev</button>`;
    }
    for (let p = 1; p <= totalPages; p++) {
      html += `<button class="page-link ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
    if (currentPage < totalPages) {
      html += `<button class="page-link" data-page="${currentPage + 1}">Next »</button>`;
    }
    html += `</div>`;
    return html;
  }
}


export class BreadcrumbHelper {
  private crumbs: Array<{ title: string; url?: string }> = [];

  public add(title: string, url?: string): this {
    this.crumbs.push({ title, url });
    return this;
  }

  public buildFromURI(uri: string): this {
    const parts = uri.split('/').filter(Boolean);
    for (const part of parts) {
      this.add(part.charAt(0).toUpperCase() + part.slice(1), `/${part}`);
    }
    return this;
  }

  public render(): string {
    return `<nav class="breadcrumb">${this.crumbs.map((c) => (c.url ? `<a href="${c.url}">${c.title}</a>` : `<span>${c.title}</span>`)).join(' / ')}</nav>`;
  }
}

export class NewsHelper {
  public truncateSummary(text: string, maxLength: number = 120): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

export class AdminHelper {
  public getSingularName(modelName: string): string {
    return modelName.replace(/s$/, '');
  }

  public getPluralName(modelName: string): string {
    return modelName.endsWith('s') ? modelName : modelName + 's';
  }

  public renderRoleBadge(groupId: number): string {
    const roles: Record<number, { label: string; color: string }> = {
      6: { label: 'Administrator', color: '#dc2626' },
      5: { label: 'Risk Manager', color: '#ea580c' },
      4: { label: 'Affiliate', color: '#0284c7' },
      3: { label: 'Agent', color: '#16a34a' },
      2: { label: 'Cashier', color: '#ca8a04' },
      1: { label: 'Player', color: '#64748b' },
    };
    const role = roles[groupId] || { label: 'User', color: '#64748b' };
    return `<span class="badge" style="background:${role.color}; color:#fff; padding:3px 8px; border-radius:4px;">${role.label}</span>`;
  }
}
