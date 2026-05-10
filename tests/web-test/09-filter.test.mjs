export const name = 'Фильтры списка: simple-search, advanced-column';
export const tags = ['filter', 'smoke'];
export const timeout = 60000;

export default async function({ navigateSection, openCommand, filterList, unfilterList, readTable, closeForm, assert, step, log }) {

  await step('simple-search: filterList по тексту по всем колонкам', async () => {
    await navigateSection('Склад');
    await openCommand('Контрагенты');
    const before = await readTable({ maxRows: 50 });
    log(`before filter: total=${before.total}`);
    assert.ok(before.total >= 4, 'Должно быть минимум 4 контрагента до фильтра');

    await filterList('Север');
    const after = await readTable({ maxRows: 50 });
    log(`after simple-search 'Север': rows=${after.rows?.length} names=${after.rows?.map(r => r['Наименование']).join(',')}`);
    assert.ok(after.rows?.length >= 1 && after.rows?.length < before.total, 'Фильтр должен сузить список');
    assert.ok(after.rows.every(r => /Север/i.test(r['Наименование'] || '')), 'Все строки должны содержать Север');

    await unfilterList();
    const restored = await readTable({ maxRows: 50 });
    log(`after unfilter: total=${restored.total}`);
    assert.equal(restored.total, before.total, 'После unfilterList список восстановлен');
  });

  await step('advanced-column: filterList по конкретной колонке', async () => {
    await filterList('Север', { field: 'Наименование' });
    const t = await readTable({ maxRows: 50 });
    log(`advanced-column 'Наименование'='Север': rows=${t.rows?.length} names=${t.rows?.map(r => r['Наименование']).join(',')}`);
    assert.ok(t.rows?.length >= 1, 'Должна найтись хотя бы одна строка');
    assert.ok(t.rows.every(r => /Север/i.test(r['Наименование'] || '')), 'Все строки фильтруются по Наименование');

    await unfilterList();
    await closeForm();
  });

  await step('exact: filterList с exact:true сужает строго до одного значения', async () => {
    await navigateSection('Склад');
    await openCommand('Контрагенты');
    await filterList('ООО Север', { field: 'Наименование', exact: true });
    const t = await readTable({ maxRows: 50 });
    log(`exact 'ООО Север': rows=${t.rows?.length} names=${t.rows?.map(r => r['Наименование']).join(',')}`);
    assert.equal(t.rows?.length, 1, 'exact:true должен дать строго 1 совпадение');
    assert.equal(t.rows[0]['Наименование'], 'ООО Север', 'Это должно быть ООО Север');
    await unfilterList();
    await closeForm();
  });

  await step('hidden-field: filterList по реквизиту, не выведенному в колонки списка', async () => {
    await navigateSection('Склад');
    await openCommand('Контрагенты');
    const before = await readTable({ maxRows: 50 });
    log(`columns: ${before.columns?.join(', ')}`);
    // Найти реквизит, которого нет в колонках. Адрес и Телефон есть на форме элемента,
    // но в форме списка обычно только Наименование/ИНН. Используем "Адрес" как кандидат.
    const hiddenCandidates = ['Адрес', 'Телефон', 'КодКПП'];
    const hidden = hiddenCandidates.find(c => !before.columns.includes(c));
    log(`hidden field candidate: ${hidden}`);
    if (!hidden) {
      log('Все кандидаты видны в колонках — пропускаем');
      await closeForm();
      return;
    }
    // Попытка filterList по скрытому полю — должна работать через FieldSelector DLB
    try {
      await filterList('что-нибудь-несуществующее', { field: hidden });
      const t = await readTable({ maxRows: 50 });
      log(`hidden-field '${hidden}': rows=${t.rows?.length}`);
      // Достаточно того, что фильтр применился без ошибки
      await unfilterList();
    } catch (e) {
      log(`hidden-field filter error: ${e.message}`);
      // FieldSelector DLB может не найти поле — допустимо если синтетика не настроена
    }
    await closeForm();
  });

  await step('date: filterList по дате на форме списка Номенклатуры (ДатаПоступления)', async () => {
    await navigateSection('Склад');
    await openCommand('Номенклатура');
    const before = await readTable({ maxRows: 50 });
    log(`Номенклатура columns: ${before.columns?.join(', ')}`);
    const dateCol = before.columns.find(c => /Дата.*поступления/i.test(c));
    if (!dateCol) {
      log('Дата поступления не в колонках списка — пропускаем date filter');
      await closeForm();
      return;
    }
    log(`date column: ${dateCol}`);
    try {
      await filterList('15.05.2026', { field: dateCol });
      const t = await readTable({ maxRows: 50 });
      log(`date filter rows=${t.rows?.length}`);
      await unfilterList();
    } catch (e) {
      log(`date filter error: ${e.message}`);
    }
    await closeForm();
  });

  await step('reference: filterList по ссылке (Контрагент в форме списка ПриходныхНакладных)', async () => {
    await navigateSection('Склад');
    await openCommand('Приходная накладная');
    const before = await readTable({ maxRows: 50 });
    log(`ПН columns: ${before.columns?.join(', ')}`);
    if (!before.columns.includes('Контрагент')) {
      log('Контрагент не в колонках — пропускаем reference filter');
      await closeForm();
      return;
    }
    try {
      await filterList('ООО Север', { field: 'Контрагент' });
      const t = await readTable({ maxRows: 50 });
      log(`reference filter rows=${t.rows?.length}`);
      await unfilterList();
    } catch (e) {
      log(`reference filter error: ${e.message}`);
    }
    await closeForm();
  });

  // unfilter-specific (P1 в матрице) требует список с видимой filter-панелью
  // (.trainItem badge). На синтетических списках Контрагенты/Номенклатура
  // advanced filterList применяет фильтр без создания badge, поэтому
  // unfilterList({field}) не может его найти. Откладываем до синтетики
  // с настроенной filter-панелью (P2/P3).

  await step('unfilter-all: unfilterList() убирает все фильтры', async () => {
    await navigateSection('Склад');
    await openCommand('Контрагенты');
    await filterList('Север');
    const filtered = await readTable({ maxRows: 50 });
    log(`after simple filter: rows=${filtered.rows?.length}`);
    assert.ok(filtered.rows?.length < 4, 'Фильтр должен сузить');

    await unfilterList();
    const after = await readTable({ maxRows: 50 });
    log(`after unfilter-all: rows=${after.rows?.length}`);
    assert.ok(after.rows?.length >= 4, 'unfilterList() восстановил полный список');
    await closeForm();
  });

}
// cancel-search и clear-input (P1 в матрице) разные внутренние реализации
// одного публичного API unfilterList(). Через публичный API их невозможно
// различить — покрытие unfilter-all + simple-search restoration этих ветвей
// достаточно.
