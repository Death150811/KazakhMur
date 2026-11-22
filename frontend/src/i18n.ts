import { createContext, useContext } from 'react';

export type Lang = 'ru' | 'kk';

const dict = {
  ru: {
    tagline: 'Простота снаружи. Мощность внутри.',
    playground: 'Playground',
    docs: 'Документация',
    run: 'Запустить',
    running: 'Выполняется…',
    reset: 'Сбросить',
    examples: 'Примеры',
    output: 'Вывод',
    clear: 'Очистить',
    stdin: 'Ввод для енгіз()',
    stdinHint: 'Каждая строка — один вызов енгіз()',
    empty: 'Пока ничего нет. Нажмите «Запустить» (Ctrl+Enter).',
    ok: 'Успешно',
    error: 'Ошибка',
    limit: 'Лимит',
    time: 'время',
    ms: 'мс',
    line: 'строка',
    column: 'столбец',
    hint: 'Подсказка',
    noOutput: '(программа завершилась без вывода)',
    network: 'Сервер недоступен. Проверьте, что бэкенд запущен.',
    rate: 'Слишком много запусков. Подождите минуту.',
    server: 'Ошибка сервера. Попробуйте ещё раз.',
    editor: 'Редактор',
    theme: 'Тема',
    loadingExamples: 'Загрузка примеров…',
    keywords: 'Ключевые слова',
    builtins: 'Встроенные функции',
    keyword: 'Слово',
    meaning: 'Аналог',
    description: 'Описание',
    signature: 'Вызов',
    back: 'К редактору',
    calledFrom: 'вызвано из',
    trace: 'Цепочка вызовов',
  },
  kk: {
    tagline: 'Қарапайымдылық сыртында. Қуат ішінде.',
    playground: 'Playground',
    docs: 'Құжаттама',
    run: 'Іске қосу',
    running: 'Орындалуда…',
    reset: 'Қалпына келтіру',
    examples: 'Мысалдар',
    output: 'Нәтиже',
    clear: 'Тазалау',
    stdin: 'енгіз() үшін деректер',
    stdinHint: 'Әр жол — енгіз() бір шақыруы',
    empty: 'Әзірге нәтиже жоқ. «Іске қосу» түймесін басыңыз (Ctrl+Enter).',
    ok: 'Сәтті',
    error: 'Қате',
    limit: 'Шектеу',
    time: 'уақыт',
    ms: 'мс',
    line: 'жол',
    column: 'баған',
    hint: 'Кеңес',
    noOutput: '(бағдарлама ештеңе шығармады)',
    network: 'Сервер қолжетімсіз. Бэкенд қосулы екенін тексеріңіз.',
    rate: 'Іске қосу тым көп. Бір минут күтіңіз.',
    server: 'Сервер қатесі. Қайталап көріңіз.',
    editor: 'Редактор',
    theme: 'Тақырып',
    loadingExamples: 'Мысалдар жүктелуде…',
    keywords: 'Кілт сөздер',
    builtins: 'Ішкі функциялар',
    keyword: 'Сөз',
    meaning: 'Баламасы',
    description: 'Сипаттама',
    signature: 'Шақыру',
    back: 'Редакторға',
    calledFrom: 'шақырылған',
    trace: 'Шақырулар тізбегі',
  },
} as const;

export type Strings = (typeof dict)['ru'];
export type StringKey = keyof Strings;

export const LangContext = createContext<{ lang: Lang; t: (k: StringKey) => string }>({
  lang: 'ru',
  t: (k) => dict.ru[k],
});

export const useT = () => useContext(LangContext);

export function makeT(lang: Lang) {
  return (k: StringKey): string => dict[lang][k];
}
