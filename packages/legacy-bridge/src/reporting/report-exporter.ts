/**
 * Multi-Format Report Exporter
 * Generates RFC 4180 CSV, Microsoft Excel XML, and Styled Printable HTML / PDF documents.
 */

export class ReportExporter {
  /**
   * Converts tabular data records into RFC 4180 compliant CSV string
   */
  public static exportToCsv(
    rows: Array<Record<string, unknown>>,
    options?: { delimiter?: string; headers?: string[] }
  ): string {
    if (!rows || rows.length === 0) return '';

    const delimiter = options?.delimiter || ',';
    const keys = options?.headers || Object.keys(rows[0]);

    const headerLine = keys
      .map((k) => `"${k.replace(/"/g, '""')}"`)
      .join(delimiter);

    const dataLines = rows.map((row) => {
      return keys
        .map((k) => {
          const val = row[k];
          if (val === null || val === undefined) return '""';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(delimiter);
    });

    return [headerLine, ...dataLines].join('\n');
  }

  /**
   * Generates Microsoft Excel 2003 XML format (opens natively in Excel / LibreOffice)
   */
  public static exportToExcelXml(
    rows: Array<Record<string, unknown>>,
    sheetTitle: string = 'Financial Report'
  ): string {
    if (!rows || rows.length === 0) {
      return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"></Workbook>`;
    }

    const keys = Object.keys(rows[0]);

    const headerCells = keys
      .map((k) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${this.escapeXml(k)}</Data></Cell>`)
      .join('');

    const dataRows = rows
      .map((row) => {
        const cells = keys
          .map((k) => {
            const val = row[k];
            const isNum = typeof val === 'number';
            const type = isNum ? 'Number' : 'String';
            const cleanVal = val === null || val === undefined ? '' : String(val);
            return `<Cell><Data ss:Type="${type}">${this.escapeXml(cleanVal)}</Data></Cell>`;
          })
          .join('');
        return `<Row>${cells}</Row>`;
      })
      .join('\n');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1B4D3E" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${this.escapeXml(sheetTitle)}">
  <Table>
   <Row ss:StyleID="Header">
    ${headerCells}
   </Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
  }

  /**
   * Generates Executive Printable HTML / PDF layout
   */
  public static exportToPrintableHtml(
    title: string,
    kpis: Array<{ label: string; value: string | number; change?: string }>,
    tableRows: Array<Record<string, unknown>>
  ): string {
    const kpiCards = kpis
      .map(
        (k) => `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; min-width: 160px; flex: 1;">
        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">${this.escapeXml(k.label)}</div>
        <div style="font-size: 24px; font-weight: bold; color: #0f172a; margin-top: 4px;">${this.escapeXml(String(k.value))}</div>
        ${k.change ? `<div style="font-size: 12px; color: #10b981; margin-top: 4px;">${this.escapeXml(k.change)}</div>` : ''}
      </div>`
      )
      .join('\n');

    let tableHtml = '';
    if (tableRows && tableRows.length > 0) {
      const keys = Object.keys(tableRows[0]);
      const thead = keys
        .map((k) => `<th style="padding: 10px 14px; text-align: left; background: #0f3d2e; color: #fff; font-size: 13px;">${this.escapeXml(k)}</th>`)
        .join('');

      const tbody = tableRows
        .map(
          (row, idx) => `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
          ${keys.map((k) => `<td style="padding: 10px 14px; font-size: 13px; color: #334155;">${this.escapeXml(String(row[k] ?? ''))}</td>`).join('')}
        </tr>`
        )
        .join('\n');

      tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escapeXml(title)}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .no-print { display: none; }
    }
  </style>
</head>
<body style="margin: 0; padding: 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff;">
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f3d2e; padding-bottom: 16px; margin-bottom: 24px;">
    <div>
      <h1 style="margin: 0; color: #0f3d2e; font-size: 26px; font-weight: 800;">XBET PLATFORM</h1>
      <h2 style="margin: 4px 0 0 0; color: #475569; font-size: 16px; font-weight: 500;">${this.escapeXml(title)}</h2>
    </div>
    <div style="text-align: right; color: #64748b; font-size: 12px;">
      <div>Generated: ${new Date().toUTCString()}</div>
      <div>Confidential Financial Record</div>
    </div>
  </div>

  <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
    ${kpiCards}
  </div>

  ${tableHtml}

  <div style="margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
    xBET Enterprise Financial & Regulatory Audit Trail • ISO/IEC 27001 Certified Double-Entry Ledger
  </div>
</body>
</html>`;
  }

  private static escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}
