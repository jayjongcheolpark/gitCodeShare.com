import debounce from 'lodash.debounce';
import { highlightAuto } from 'highlight.js';
import {
  FONTS_HASH,
  DEFAULT_THEME,
  DEFAULT_CODE,
  DEFAULT_LANGUAGE,
  DEFAULT_FONT,
  LANGUAGES_NAME_HASH,
  THEMES_NAME_HASH,
  LANGUAGES_MODE_HASH,
  LANGUAGES_SHORT_HASH,
  LANGUAGES_MIME_HASH,
} from './../common/constants';
import { Instance, types, getEnv, getRoot, flow } from 'mobx-state-tree';
import { IAppStore, IStoreEnv } from './';
import { message } from 'antd';

const Language = types.model('Language', {
  mode: types.string,
  name: types.string,
  mime: types.maybe(types.string),
  short: types.maybe(types.string),
  ext: types.maybe(types.string),
});

const Theme = types.model('Theme', {
  id: types.string,
  name: types.string,
});

const Font = types.model('Font', {
  id: types.string,
  name: types.string,
});

export interface ILanguage extends Instance<typeof Language> {}

const detectedLanguage = code => {
  const _detectedLanguage = highlightAuto(code).language;
  const language = LANGUAGES_MODE_HASH[_detectedLanguage] || LANGUAGES_SHORT_HASH[_detectedLanguage];
  return language && (language.mime || language.mode);
};

const debounceDetectLanguage = debounce(detectedLanguage, 300, {
  leading: true,
  trailing: true,
});

export const Editor = types
  .model('Editor', {
    code: types.optional(types.string, DEFAULT_CODE),
    fontFamily: types.optional(Font, DEFAULT_FONT),
    fontSize: types.optional(types.integer, 14),
    optionDrawerVisible: types.optional(types.boolean, false),
    language: types.optional(Language, DEFAULT_LANGUAGE),
    theme: types.optional(Theme, DEFAULT_THEME),
    lineNumbers: types.optional(types.boolean, true),
    gistId: types.maybe(types.string),
  })
  .views(self => ({
    get app() {
      return getRoot<IAppStore>(self);
    },
    get provider() {
      return getEnv<IStoreEnv>(self).provider;
    },
    get mode() {
      return self.language.mode;
    },
  }))
  .actions(self => ({
    setCode: v => {
      self.code = v;
      if (self.language.name === 'Auto') {
        const mode = debounceDetectLanguage(v);
        self.language.mode = mode ? mode : self.language.mode;
      }
    },
    onUpdate: e => {
      window.parent.postMessage({ type: 'setHeight', value: document.querySelector('#__next').scrollHeight }, '*');
    },
    setFontFamily: e => (self.fontFamily = FONTS_HASH[e.key]),
    setFontSize: v => (self.fontSize = v),
    setLineNumbers: v => (self.lineNumbers = v),
    setOptionDrawerVisible: v => (self.optionDrawerVisible = v),
    setLanguage: e => {
      self.language = LANGUAGES_NAME_HASH[e.key];
      if (self.language.name === 'Auto') {
        const mode = detectedLanguage(self.code);
        self.language.mode = mode ? mode : self.language.mode;
      }
    },
    setLanguageByName: name => (self.language = LANGUAGES_NAME_HASH[name] || self.language),
    setLanguageByMime: mime => (self.language = LANGUAGES_MIME_HASH[mime] || self.language),
    setTheme: e => (self.theme = THEMES_NAME_HASH[e.key]),
    getImageUrl: async e => {
      const image = await self.provider.ImageRequest.getImageUrl(self.code);
      return image;
    },
    downloadImage: async () => {
      const link = document.createElement('a');

      const url = await getEnv(self).provider.ImageRequest.getImageUrl({
        code: self.code,
      });

      link.download = `girCodeShare_${new Date().getTime()}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    createGist: async e => {
      const hide = message.loading('Saving...', 0);
      const filename = `source${self.language.ext || ''}`;
      const data = await self.provider.GistRequest.createGist({
        public: true,
        files: {
          [filename]: {
            content: self.code,
          },
        },
      });
      window.parent.postMessage({ type: 'success', value: `http://gitcodeshare.com/?${data.id} ` }, '*');
      hide();
    },
    login: () => {
      self.provider.AuthRequest.login();
    },
  }))
  .actions(self => ({
    onBeforeCodeChange: (_, $, code) => {
      !self.gistId && self.setCode(code);
    },
    getGist: flow(function*(v: string) {
      self.code = '';
      self.gistId = v;
      const data = yield self.provider.GistRequest.getGist(v);
      const file = data.files[Object.keys(data.files)[0]];
      self.setCode(file.content);
      file.language && self.setLanguageByName(file.language);
      file.type && self.setLanguageByMime(file.type);
    }),
  }));

export interface IEditor extends Instance<typeof Editor> {}

const editor = Editor.create({});

export default editor;
