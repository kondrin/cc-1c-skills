// web-test table/grid v1.16 — Form-grid operations: read table rows, fill rows, delete rows.
// Source: https://github.com/Nikolay-Shirokov/cc-1c-skills
//
// "Grid" в терминах 1С — таблица на форме (.gridLine/.gridBody/.grid в DOM):
// табличные части документов, формы списков, ТЧ настроек и т.п.
// Отдельно от SpreadsheetDocument (table/spreadsheet.mjs).

import { page, ensureConnected } from '../core/state.mjs';
import { detectFormScript, readTableScript, resolveGridScript } from '../dom.mjs';

/** Read structured table data with pagination. Returns columns, rows, total count. */
export async function readTable({ maxRows = 20, offset = 0, table } = {}) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) throw new Error('readTable: no form found');
  let gridSelector;
  if (table) {
    const resolved = await page.evaluate(resolveGridScript(formNum, table));
    if (resolved.error) throw new Error(`readTable: ${resolved.message || resolved.error}. Available: ${resolved.available?.map(a => a.name).join(', ') || 'none'}`);
    gridSelector = resolved.gridSelector;
  }
  return await page.evaluate(readTableScript(formNum, { maxRows, offset, gridSelector }));
}
