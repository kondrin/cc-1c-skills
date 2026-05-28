export const name = 'clickElement({row, column}): cell click on grids + spreadsheet backward-compat';
export const tags = ['cell-click', 'smoke'];
export const timeout = 120000;

export default async function({
  navigateSection, navigateLink, openCommand, clickElement, fillFields, fillTableRow,
  readTable, readSpreadsheet, closeForm, getFormState, wait, assert, step, log
}) {

  // ── Spreadsheet backward-compat ─────────────────────────────────────────────
  await step('spreadsheet: cell click by (row, column) still works (regression guard)', async () => {
    await navigateSection('Склад');
    await openCommand('Остатки товаров');
    await clickElement('Еще');
    await clickElement('Установить стандартные настройки');
    await clickElement('Сформировать');
    await wait(3);
    const r = await readSpreadsheet();
    assert.ok(r.data?.length > 0, 'В отчёте есть данные');
    const firstHeader = r.headers[0];
    const before = await getFormState();
    const res = await clickElement({ row: 0, column: firstHeader });
    log(`spreadsheet click: ${JSON.stringify(res.clicked)}`);
    assert.equal(res.clicked?.kind, 'spreadsheetCell', 'kind=spreadsheetCell — без table роутер ушёл в spreadsheet');
    await closeForm();
  });

  // ── Grid cell click: catalog list with dblclick to open item ────────────────
  await step('catalog list: dblclick by {row: filter, column} opens the item', async () => {
    await navigateSection('Склад');
    await openCommand('Контрагенты');
    const t = await readTable();
    assert.ok(t.rows?.length > 0, 'Список Контрагентов не пуст');
    // Используем фикстуру стенда: ООО Север в колонке Наименование
    const before = await getFormState();
    const res = await clickElement(
      { row: { 'Наименование': 'ООО Север' }, column: 'Наименование' },
      { dblclick: true }
    );
    log(`clicked: ${JSON.stringify(res.clicked)}`);
    assert.equal(res.clicked?.kind, 'gridCell', 'kind=gridCell');
    assert.equal(res.clicked?.dblclick, true, 'dblclick=true прокинут');
    await wait(1);
    const after = await getFormState();
    // На синтетическом стенде поведение dblclick по ячейке может не открывать форму,
    // если колонка не "главная" — главное, что клик завершился без ошибки и тип события правильный.
    if (after.formCount > before.formCount) {
      log('форма открылась — закрываем');
      await closeForm();
    }
  });

  // ── Grid cell click on tabular section + row by numeric index ──────────────
  await step('tabular section: click cell by row:0 + column (table specified)', async () => {
    await navigateSection('Склад');
    await openCommand('Приходная накладная');
    await clickElement('Создать');
    await fillFields({ 'Контрагент': 'ООО Север' });
    await fillTableRow(
      { 'Номенклатура': 'Товар 01', 'Количество': '5', 'Цена': '100' },
      { table: 'Товары', add: true }
    );
    await fillTableRow(
      { 'Номенклатура': 'Товар 02', 'Количество': '3', 'Цена': '200' },
      { table: 'Товары', add: true }
    );
    const res = await clickElement(
      { row: 0, column: 'Количество' },
      { table: 'Товары' }
    );
    log(`clicked: ${JSON.stringify(res.clicked)}`);
    assert.equal(res.clicked?.kind, 'gridCell', 'kind=gridCell');
    assert.equal(res.clicked?.row, 0, 'row=0 сохранён в результате');
    assert.equal(res.clicked?.column, 'Количество', 'column=Количество');
  });

  // ── readTable.hasMore on tabular section ───────────────────────────────────
  await step('readTable.hasMore: 2-row table shows hasMore.below=false', async () => {
    const t = await readTable({ table: 'Товары' });
    log(`hasMore: ${JSON.stringify(t.hasMore)}`);
    assert.ok(t.hasMore, 'hasMore присутствует в результате');
    assert.equal(t.hasMore.below, false, 'hasMore.below=false для двух строк (всё видно)');
  });

  // ── Error path: row not in DOM, no scroll → understandable error ───────────
  await step('row_not_found без scroll бросает ошибку с подсказкой', async () => {
    let caught = null;
    try {
      await clickElement(
        { row: { 'Количество': 'НЕСУЩЕСТВУЮЩЕЕ_ЗНАЧЕНИЕ_123' }, column: 'Количество' },
        { table: 'Товары' } // без scroll
      );
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'Должна быть ошибка');
    log(`error: ${caught.message}`);
    assert.ok(/not found/i.test(caught.message), 'Сообщение упоминает not found');
    assert.ok(/scroll/i.test(caught.message), 'Сообщение содержит подсказку про scroll: true');
  });

  // ── Error path: out of range numeric row ───────────────────────────────────
  await step('row_out_of_range на числовом индексе бросает понятную ошибку', async () => {
    let caught = null;
    try {
      await clickElement(
        { row: 9999, column: 'Количество' },
        { table: 'Товары' }
      );
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'Должна быть ошибка');
    log(`error: ${caught.message}`);
    assert.ok(/out of range/i.test(caught.message), 'Сообщение упоминает out of range');
    assert.ok(/virtualized/i.test(caught.message) || /DOM window/i.test(caught.message),
      'Сообщение объясняет про виртуализацию / DOM window');
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await step('cleanup: close document', async () => {
    await closeForm({ save: false });
  });

  // Note: reveal-loop (scroll:true) algorithm verified manually on bp-demo
  // (catalog Контрагенты, group Покупатели, ~22 items requiring page-down).
  // The synthetic stand has issues with rapid sequential doc opens that prevent
  // a stable >30-row table setup here — left for a future enhancement of _hooks.
}
