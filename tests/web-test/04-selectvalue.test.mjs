export const name = 'selectValue: dropdown быстрый выбор для ссылочного поля';
export const tags = ['selectvalue', 'smoke'];
export const timeout = 60000;

const findField = (state, name) => state.fields?.find(f => f.name === name || f.label === name);

export default async function({ navigateSection, openCommand, clickElement, selectValue, closeForm, getFormState, assert, step, log }) {

  await step('dropdown: Контрагент → CatalogRef.Контрагенты, малый список', async () => {
    await navigateSection('Склад');
    await openCommand('Приходная накладная');
    await clickElement('Создать');

    const result = await selectValue('Контрагент', 'ООО Север');
    log(`method=${result.selected?.method}, search=${result.selected?.search}`);
    assert.equal(result.selected?.method, 'dropdown', 'Должен быть метод dropdown (быстрый выбор)');

    const field = findField(result, 'Контрагент');
    log(`Контрагент value='${field?.value}'`);
    assert.includes(field?.value || '', 'Север', 'Контрагент должен показать выбранное значение');

    await closeForm({ save: false });
  });
}
