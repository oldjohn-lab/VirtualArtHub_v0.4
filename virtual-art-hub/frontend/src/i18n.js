import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 导入翻译文件
import translationEN from './locales/en/translation.json';
import translationZH from './locales/zh/translation.json';

const resources = {
  en: {
    translation: translationEN
  },
  zh: {
    translation: translationZH
  }
};

i18n
  .use(LanguageDetector) // 语言检测器
  .use(initReactI18next) // 将 i18n 实例传递给 react-i18next
  .init({
    resources,
    fallbackLng: 'zh', // 默认语言
    debug: true, // 开启调试模式

    interpolation: {
      escapeValue: false // react 已经对内容进行了转义，因此不需要 i18next 再次转义
    }
  });

export default i18n;