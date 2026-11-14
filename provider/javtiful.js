const { load } = require('cheerio');
const logger = require('../logger');
const { meta } = require('../model');
const Provider = require('./provider');

const pathMappings = {
  'New release': '/videos',
  'Most viewed today': '/videos?sort=popular_today',
  'Weekly hot': '/videos?sort=popular_week',
};

class JavtifulProvider extends Provider {

  constructor() {
    super('https://javtiful.com', 'javtiful', 10);
    this.dataset = {};
    this.metas = {};
  }

  static create() {
    return new JavtifulProvider();
  }

  getInitialUrl(catalogId) {
    return this.baseUrl + '/videos';
  }

  handleSearch({ extra: { search: keyword } }) {
    return `${this.baseUrl}/search/${keyword}/`;
  }

  handleGenre({ extra: { genre } }) {
    const path = pathMappings[genre];
    return this.baseUrl + path;
  }

  handlePagination(url, { extra: { skip } }) {
    const prefix = url.indexOf('?') !== -1 ? '&' : '?';
    return `${prefix}page=${this.page(skip)}`;
  }

  getCatalogMetas(html) {
    const metadatas = [];
    const $ = load(html);

    console.log("JAVTIFUL - TEST");
    console.log($.text());

    $('.video-grid article.video-card')
      .each((index, element) => {
        const $article = $(element);
        const $link = $article.find('a[href]').first();

        if (!$link.length) {
          return;
        }

        const videoPageUrl = this.baseUrl + $link.attr('href');
        const $image = $article.find('img[data-front-lazy-src]').first();
        const poster = this.baseUrl + $image.attr('data-front-lazy-src');
        const imageTitle = $image.attr('alt') || '';
        const title = imageTitle.replace(/^Thumbnail for\s*/i, '').trim()
        || $link.attr('title')
        || $article.find('.video-card__title').first().text().trim()
        || $link.text().trim();

        /*const $children = $(element).children();
        const $first = $children.first();
        const $last = $children.last();
        const $idPosterNode = $first.children().first();
        const poster = $idPosterNode.children('img').first().attr('data-src');
        const title = $last.text().trim();
        const videoPageUrl = $last.children('a').attr('href');*/

        if (videoPageUrl) {
          metadatas.push(new meta.MetaPreview(
            videoPageUrl,
            'movie',
            title,
            poster,
          ));

        }
      });
    return metadatas;
  }

  async getMetadata(args) {
    return super.getMetadata(args)
      .then(meta => meta.metaResponse);
  }

  parseVideoPage({ id, html }) {
    const $ = load(html);
    const $metas = $('meta');
    let metaMap = {};
    $metas.each((i, e) => {
      const attribs = e.attribs;
      metaMap[attribs.name || attribs.property] = attribs.content;
    });
    var regex = /urls:\s*\[(.*?)\]/g;
    var match = html.match(regex);
    let videoPageUrl = '';
    if (match && match[1]) {
      // Extract the contents inside the 'urls' array
      const text = match[1].split(',')[1];
      const leftPat = 'sixyik.com\\/';
      const left = text.indexOf(leftPat);
      const uuid = text.substring(left + leftPat.length).replace('\\/seek\\/_1.jpg"', '');
      videoPageUrl = `https://surrit.com/${uuid}/playlist.m3u8`;
    }
    const metaResponse = new meta.MetaResponse(
      id,
      Provider.TYPE,
      metaMap['og:title'],
      {
        background: metaMap['og:image'],
        description: metaMap['og:description'] || metaMap['og:title'],
        genres: metaMap['keywords'].split(','),
      },
    );
    return {
      metaResponse,
      videoPageUrl,
    };
  }

  transformStream(url, stream) {
    return { ...stream, url: url.replace('playlist.m3u8', '') + stream.url };
  }
}

module.exports = JavtifulProvider.create;