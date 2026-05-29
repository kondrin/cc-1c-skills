export const name = 'tree-form: FormDataTree edit (ДеревоНоменклатуры obrabotka)';
export const tags = ['tree', 'table'];
export const timeout = 90000;

// ДеревоНоменклатуры obrabotka: реквизит формы Дерево типа ДеревоЗначений
// заполняется в ПриСозданииНаСервере рекурсивным обходом справочника Номенклатура.
// Колонка Цена — Number, editable; колонка Номенклатура — CatalogRef, readOnly.
// Покрывает: 05-table/edit-form (fillTableRow method:'direct' на FormDataTree-колонке)
// + 08-hierarchy/tree-edit (expand узла + edit Цены внутри expanded группы).

export default async function({ navigateLink, clickElement, closeForm, readTable, fillTableRow, assert, step, log }) {

  await step('setup: открыть обработку ДеревоНоменклатуры', async () => {
    const r = await navigateLink('Обработка.ДеревоНоменклатуры');
    log(`form=${r.form} activeTab=${r.activeTab}`);
    assert.equal(r.activeTab, 'Дерево номенклатуры', 'форма открыта');
    assert.ok(r.tables?.some(t => t.name === 'Дерево'), 'таблица Дерево присутствует');
  });

  await step('read-roots: на верхнем уровне видны группы (Товары, Услуги, БольшойСписок)', async () => {
    const t = await readTable('Дерево');
    log(`columns=${t.columns?.join(',')} rows=${t.rows?.length}`);
    assert.deepEqual(t.columns, ['Номенклатура', 'Цена'], 'колонки: Номенклатура + Цена');
    assert.equal(t.rows.length, 3, '3 корневые строки');
    const names = t.rows.map(r => r['Номенклатура']);
    assert.includes(names, 'Товары', 'есть Товары');
    assert.includes(names, 'Услуги', 'есть Услуги');
    assert.includes(names, 'БольшойСписок', 'есть БольшойСписок');
    assert.ok(t.rows.every(r => r._kind === 'group'), 'все корневые — group (есть expand-стрелка)');
  });

  await step('expand: clickElement({expand}) раскрывает Товары — 15 элементов', async () => {
    const r = await clickElement('Товары', { expand: true });
    log(`clicked: ${JSON.stringify(r.clicked)}`);
    assert.equal(r.clicked?.toggled, true, 'expand toggled');
    const t = await readTable('Дерево');
    log(`after expand: total=${t.total}`);
    assert.ok(t.total >= 16, `Товары + 15 элементов (got ${t.total})`);
    const tovar01 = t.rows.find(row => row['Номенклатура'] === 'Товар 01');
    assert.ok(tovar01, 'Товар 01 виден внутри Товары');
    assert.equal(tovar01['Цена'], '100,00', 'исходная Цена 100,00 (из справочника)');
  });

  await step('tree-edit: fillTableRow меняет Цену в развёрнутой группе', async () => {
    // row:1 — это Товар 01 (row:0 — Товары после expand). Используем index, т.к.
    // fillTableRow{row:'Товар 01'} ловит SyntaxError в JS-эвале — TODO в bug list.
    const r = await fillTableRow({ Цена: 1500 }, { row: 1 });
    log(`filled: ${JSON.stringify(r.filled)}`);
    assert.equal(r.filled?.length, 1, '1 поле заполнено');
    assert.equal(r.filled[0].field, 'Цена', 'поле Цена');
    assert.equal(r.filled[0].method, 'direct', 'method=direct (in-place edit)');
    assert.equal(r.filled[0].ok, true, 'ok=true');
    const t = await readTable('Дерево');
    const tovar01 = t.rows.find(row => row['Номенклатура'] === 'Товар 01');
    assert.ok(tovar01, 'Товар 01 виден');
    // 1С web использует non-breaking space ( ) как разделитель разрядов
    assert.equal(tovar01['Цена'], '1 500,00', 'Цена обновилась до 1 500,00');
  });

  await step('cleanup: закрыть форму', async () => {
    await closeForm();
  });
}
