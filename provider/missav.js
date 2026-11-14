const { load } = require('cheerio');
const logger = require('../logger');
const { meta } = require('../model');
const Provider = require('./provider');

const pathMappings = {
  'New release': '/dm635/en/release',
  'Uncensored leak': '/dm817/en/uncensored-leak',
  'Most viewed today': '/dm301/en/today-hot',
  'Weekly hot': '/dm170/en/weekly-hot',
  'Monthly hot': '/dm273/en/monthly-hot',
};

class MissavProvider extends Provider {

  constructor() {
    super('https://missav.ws', 'missav', 10);
    this.dataset = {};
    this.metas = {};
  }

  static create() {
    return new MissavProvider();
  }

  getInitialUrl(catalogId) {
    return this.baseUrl + '/dm539/en/new?sort=published_at';
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

  async fetchHtml(url) {
    try {
      const response = await fetch(url, {
        "headers": {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language": "en-US,en;q=0.9",
          "priority": "u=0, i",
          "sec-ch-ua": "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\", \"Not-A.Brand\";v=\"99\"",
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": "\"macOS\"",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1"
        }
      });
      const html = await response.text();
      const finalUrl = new URL(response.url || url);
      finalUrl.search = '';
      finalUrl.hash = '';
      const details = {
        url,
        finalUrl: finalUrl.toString(),
        redirected: response.redirected,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        htmlLength: html.length,
      };

      if (response.ok) {
        console.info('[MissAV] response received', details);
      } else {
        const $body = load(html)('body');
        $body.find('script, style, noscript').remove();
        const responseHeaders = {};

        for (const name of ['server', 'cf-ray', 'cf-mitigated', 'via', 'x-cache', 'retry-after']) {
          const value = response.headers.get(name);
          if (value) {
            responseHeaders[name] = value;
          }
        }

        console.warn('[MissAV] request returned a non-OK response', {
          ...details,
          responseHeaders,
          pageTitle: load(html)('title').first().text().trim().slice(0, 160) || null,
          bodyPreview: $body.text().replace(/\s+/g, ' ').trim().slice(0, 240) || null,
        });
        return '';
      }

      return html;
    } catch (error) {
      console.error('[MissAV] request failed', { url, error });
      return '';
    }
  }

  getCatalogMetas(html, url) {
    if (!html) {
      return [];
    }

    try {
      const metadatas = [];
      const $ = load(html);
      const $candidateCards = $('div.thumbnail.group');
      const $cards = $candidateCards.filter((_, element) => $(element).find('div').length > 0);

      $cards.each((index, element) => {
        const $card = $(element);
        const $children = $card.children();
        const $last = $children.last();
        const $videoLink = $card.find('a[href]').last();
        const $image = $card.find('img').first();
        const videoPageUrl = $videoLink.attr('href');

        if (videoPageUrl) {
          metadatas.push(new meta.MetaPreview(
            videoPageUrl,
            'movie',
            $videoLink.text().trim() || $last.text().trim(),
            $image.attr('data-src') || $image.attr('src'),
          ));
        }
      });

      const details = {
        url,
        htmlLength: html.length,
        candidateCardCount: $candidateCards.length,
        cardsWithNestedDivCount: $cards.length,
        imageCount: $('img').length,
        linkCount: $('a[href]').length,
        extractedCount: metadatas.length,
      };

      if (metadatas.length === 0) {
        console.warn('[MissAV] catalog extraction returned no results', details);
      } else {
        console.info('[MissAV] catalog extraction succeeded', details);
      }

      return metadatas;
    } catch (error) {
      console.error('[MissAV] catalog extraction failed', {
        url,
        htmlLength: typeof html === 'string' ? html.length : null,
        error,
      });
      throw error;
    }
  }

  async getMetadata(args) {
    logger.debug({ args }, 'getMetadata');
    const { id } = args;
    return this.fetchHtml(id)
      .then(html => this.parseVideoPage({ id, html }));
    //return super.getMetadata(args)
    //  .then(meta => meta.metaResponse);
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

module.exports = MissavProvider.create;