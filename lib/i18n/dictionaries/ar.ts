import type { DeepPartial } from '../types';
import type { Dictionary } from './he';

export const ar: DeepPartial<Dictionary> = {
  brand: { tagline: 'المحترف المناسب. في الوقت المناسب تمامًا.' },
  common: {
    continue: 'متابعة',
    back: 'رجوع',
    next: 'التالي',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    save: 'حفظ',
    send: 'إرسال',
    close: 'إغلاق',
    search: 'بحث',
    loading: 'جارٍ التحميل…',
    retry: 'حاول مرة أخرى',
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
  },
  errors: {
    generic: 'حدث خطأ ما. حاول مرة أخرى.',
    unauthorized: 'ليست لديك صلاحية لهذا الإجراء.',
    notFound: 'لم يتم العثور على العنصر المطلوب.',
  },
  empty: {
    noProviders: 'لا يوجد مهنيون متاحون في منطقتك بعد.',
    noOffers: 'لا توجد عروض أسعار.',
    noJobs: 'لا توجد أعمال هنا بعد.',
  },
  nav: {
    home: 'الرئيسية',
    jobs: 'الأعمال',
    messages: 'الرسائل',
    favorites: 'المفضلة',
    profile: 'الملف الشخصي',
  },
  landing: {
    heroTitle: 'المحترف المناسب.',
    heroTitleSecond: 'في الوقت المناسب تمامًا.',
    ctaCustomer: 'أحتاج إلى محترف',
    ctaProvider: 'أنا محترف',
  },
};
