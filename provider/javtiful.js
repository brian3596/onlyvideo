const { load } = require('cheerio');
const { meta } = require('../model');
const Provider = require('./provider');

const pathMappings = {
  'New release': '/en/videos',
  'Uncensored': '/en/uncensored',
  'Reducing': '/en/reducing-mosaic',
  'Most viewed today': '/en/videos?sort=popular_today',
  'Weekly hot': '/en/videos?sort=popular_week',
};

function resolveUrl(value, baseUrl) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

class JavtifulProvider extends Provider {

  constructor() {
    super('https://javtiful.com', 'javtiful', 10);
    this.dataset = {};
    this.metas = {};
  }

  static create() {
    return new JavtifulProvider();
  }

  getInitialUrl() {
    return this.baseUrl + '/en/videos';
  }

  handleSearch({ extra: { search: keyword } }) {
    return `${this.baseUrl}/search/${encodeURIComponent(keyword)}/`;
  }

  handleGenre({ extra: { genre } }) {
    const path = pathMappings[genre] || pathMappings['New release'];
    return this.baseUrl + path;
  }

  handlePagination(url, { extra: { skip } }) {
    const prefix = url.indexOf('?') !== -1 ? '&' : '?';
    return `${prefix}page=${this.page(skip)}`;
  }

  getCatalogMetas(html) {
    const metadatas = [];
    const $ = load(typeof html === 'string' ? html : '');
    const seenUrls = new Set();

    $('a[href]').has('img').each((index, element) => {
      const $link = $(element);
      const $image = $link.find('img').first();
      const videoPageUrl = resolveUrl($link.attr('href'), this.baseUrl);

      if (!videoPageUrl || seenUrls.has(videoPageUrl)) {
        return;
      }

      const parsedVideoUrl = new URL(videoPageUrl);
      const pathname = parsedVideoUrl.pathname.replace(/\/+$/, '') || '/';
      if (parsedVideoUrl.origin !== this.baseUrl || [
        '/',
        '/en/videos',
        '/en/uncensored',
        '/en/reducing-mosaic',
      ].includes(pathname)) {
        return;
      }

      const posterSource = $image.attr('data-src')
        || $image.attr('data-lazy-src')
        || $image.attr('data-original')
        || $image.attr('src')
        || $image.attr('srcset')?.split(',')[0].trim().split(/\s+/)[0];
      const poster = resolveUrl(posterSource, this.baseUrl) || posterSource;
      const title = $link.attr('title')
        || $image.attr('alt')
        || $image.attr('title')
        || $link.text().trim();

      if (!title) {
        return;
      }

      seenUrls.add(videoPageUrl);
      metadatas.push(new meta.MetaPreview(
        videoPageUrl,
        'movie',
        title,
        poster,
        { videoPageUrl },
      ));
    });

    return metadatas;
  }

  async getMetadata(args) {
    return super.getMetadata(args)
      .then(meta => meta.metaResponse);
  }

  parseVideoPage({ id, html }) {
    const $ = load(typeof html === 'string' ? html : '');
    const metaMap = {};
    $('meta').each((index, element) => {
      const attribs = element.attribs;
      const key = (attribs.name || attribs.property || '').toLowerCase();
      if (key && attribs.content) {
        metaMap[key] = attribs.content;
      }
    });

    const title = metaMap['og:title'] || $('title').first().text().trim();
    const description = metaMap['og:description'] || metaMap.description || title;
    const poster = resolveUrl(metaMap['og:image'], this.baseUrl);
    const keywords = (metaMap.keywords || '')
      .split(',')
      .map(keyword => keyword.trim())
      .filter(Boolean);
    const metaResponse = new meta.MetaResponse(
      id,
      Provider.TYPE,
      title,
      {
        poster,
        background: poster,
        description,
        genres: keywords,
      },
    );
    return {
      metaResponse,
      videoPageUrl: '',
    };
  }

  transformStream(url, stream) {
    return { ...stream, url: url.replace('playlist.m3u8', '') + stream.url };
  }
}

module.exports = JavtifulProvider.create;