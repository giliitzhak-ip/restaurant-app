import type { DeepPartial } from '../types';
import type { Dictionary } from './he';

export const ru: DeepPartial<Dictionary> = {
  brand: { tagline: 'Нужный мастер. Именно тогда, когда нужно.' },
  common: {
    continue: 'Продолжить',
    back: 'Назад',
    next: 'Далее',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    save: 'Сохранить',
    send: 'Отправить',
    close: 'Закрыть',
    search: 'Поиск',
    loading: 'Загрузка…',
    retry: 'Повторить',
    login: 'Вход',
    signup: 'Регистрация',
    logout: 'Выйти',
  },
  errors: {
    generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    unauthorized: 'У вас нет прав на это действие.',
    notFound: 'Запрошенный объект не найден.',
  },
  empty: {
    noProviders: 'Пока нет доступных мастеров в вашем районе.',
    noOffers: 'Предложений пока нет.',
    noJobs: 'Здесь пока нет заказов.',
  },
  nav: {
    home: 'Главная',
    jobs: 'Заказы',
    messages: 'Сообщения',
    favorites: 'Избранное',
    profile: 'Профиль',
  },
  landing: {
    heroTitle: 'Нужный мастер.',
    heroTitleSecond: 'Именно тогда, когда нужно.',
    ctaCustomer: 'Мне нужен мастер',
    ctaProvider: 'Я мастер',
  },
};
