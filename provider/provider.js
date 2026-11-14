const axios = require('axios');
const m3u8 = require('m3u8-parser');
const logger = require('../logger');
const { event, track } = require('../analytics');

const { chromium } = require("playwright");
let browser = null;

class Provider {
  static LIMIT = 50;
  static TYPE = 'movie';
  static TRANSPORT_URL = 'https://7aa0680f21e4-onlyavideo.baby-beamup.club/manifest.json';

  constructor(baseUrl, name, limit) {
    this.baseUrl = baseUrl;
    this.name = name;
    this.limit = limit || Provider.LIMIT;
  }

  getName() {
    return this.name;
  }

  activate(catalogId) {
    return catalogId.indexOf(this.getName()) !== -1;
  }

  getInitialUrl(catalogId) {
    return this.baseUrl;
  }

  static create() {
    return new Provider('', 'default');
  }

  async getBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: true
        });
    }

    return browser;
  }

  async closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
  }

  async fetchHtml(url) {
    console.info('fetching url', url);
    const browser = await this.getBrowser();
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36",

        locale: "en-US",

        extraHTTPHeaders: {
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9," +
                "image/avif,image/webp,*/*;q=0.8",

            "Accept-Language":
                "en-US,en;q=0.9"
              }
      });
      
      const page = await context.newPage();

    try {
      /*const response = await fetch(url);

      console.log("STATUS:", response.status);
      console.log("CF:", response.headers.get("cf-mitigated"));
      console.log("TYPE:", response.headers.get("content-type"));

      return response.text();*/

      await page.goto("https://missav.ai/", {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

      await page.waitForTimeout(5000);

        const result = await page.evaluate(async (targetUrl) => {

            try {
                const response = await fetch(targetUrl, {
                    method: "GET",
                    credentials: "include",
                    redirect: "follow",
                    headers: {
                        "Accept":
                            "text/html,application/xhtml+xml," +
                            "application/xml;q=0.9," +
                            "image/avif,image/webp,*/*;q=0.8",

                        "Accept-Language":
                            "en-US,en;q=0.9"
                    }
                });

                const html = await response.text();

                return {
                    ok: response.ok,
                    status: response.status,
                    url: response.url,
                    contentType:
                        response.headers.get("content-type"),
                    cfMitigated:
                        response.headers.get("cf-mitigated"),
                    html
                };

            } catch (error) {

                return {
                    ok: false,
                    status: 0,
                    url: targetUrl,
                    contentType: null,
                    cfMitigated: null,
                    html: "",
                    error: error.message
                };
            }

        }, url);

        console.log("STATUS:", result.status);
        console.log("FINAL URL:", result.url);
        console.log("TYPE:", result.contentType);
        console.log("CF:", result.cfMitigated);
        console.log("HTML LENGTH:", result.html.length);

        /*
         * Cloudflare Challenge
         */
        if (
            result.status === 403 &&
            result.cfMitigated === "challenge"
        ) {
            throw new Error(
                `Cloudflare Challenge: ${result.url}`
            );
        }

        /*
         * HTTP error khác
         */
        if (!result.ok) {
            throw new Error(
                `HTTP ${result.status}: ${result.url}`
            );
        }

        /*
         * Kiểm tra response có thực sự là HTML hay không.
         */
        if (
            !result.contentType ||
            !result.contentType.includes("text/html")
        ) {
            throw new Error(
                `Response không phải HTML: ${result.contentType}`
            );
        }

        return result.html;

    } catch (error) {
      console.error(error);
      return '';
    } finally {
      await page.close();
      await context.close();
    }
  }

  page(skip) {
    if (skip) {
      const page = Math.ceil((skip || 0) / this.limit);
      if (page === 0) {
        return '';
      }
      return `${page}`;
    }
    return '';
  }

  handleSearch({ extra: { search: keyword } }) {
    return `/search/${keyword}/`;
  }

  handleGenre({ extra: { genre } }) {
    return '?genre=' + genre;
  }

  handlePagination(url, { extra: { skip } }) {
    return `?skip=${skip}`;
  }

  getCatalogMetas(html) {
    return [];
  }

  getAnalyticEvent(event, id) {
    if (id) {
      return `${event}-${id}`;
    }
    return `${event}-${this.getName()}`;
  }

  async handleCatalog(args) {
    if (args.type === Provider.TYPE && this.activate(args.id)) {
      this.track(this.getAnalyticEvent(event.CATALOG, args.id), args);
      logger.info({ args }, 'handleCatalog');
      let url = this.getInitialUrl(args.id);
      if (args.extra) {
        if (args.extra.search) {
          url = this.handleSearch(args);
        }
        if (args.extra.genre) {
          url = this.handleGenre(args);
        }
      }

      if (args.extra.skip) {
        url += this.handlePagination(url, args);
      }

      const html = await this.fetchHtml(url).catch(e => '');
      const metas = this.getCatalogMetas(html, url);
      logger.debug({ metasSize: metas.length }, 'catalog');
      return Promise.resolve({ metas });
    } else {
      return Promise.resolve({ metas: [] });
    }
  }

  async handleMeta(args) {
    if (args.type === Provider.TYPE && this.activate(args.id)) {
      this.track(this.getAnalyticEvent(event.METADATA), args);
      return this.getMetadata(args)
        .then(meta => {
          return { meta };
        });
    }

    return Promise.resolve({ meta: {} });
  }

  async getMetadata(args) {
    logger.info({ args }, 'getMetadata');
    const { id } = args;
    return this.fetchHtml(id)
      .then(html => this.parseVideoPage({ id, html }));
  }

  async handleStream(args) {
    const { id } = args;
    if (args.type === Provider.TYPE && this.activate(id)) {
      this.track(this.getAnalyticEvent(event.STREAM), args);
      logger.info({ args }, 'handleStream');
      return this.processStreams(args);
    }
    return Promise.resolve({ streams: [] });
  }

  async processStreams({ id }) {
    return this.fetchHtml(id)
      .then(html => this.parseVideoPage({ id, html }))
      .then(meta => this.getStreams(meta));
  }

  getStreams(meta) {
    return this.fetchHtml(meta.videoPageUrl)
      .then(content => this.parseM3u8(content))
      .then(streams => streams.map(stream => this.transformStream(meta.videoPageUrl, stream)))
      .then(streams => {
        return { streams };
      });
  }

  transformStream(url, stream) {
    return stream;
  }

  parseM3u8(content) {
    const streams = [];
    const parser = new m3u8.Parser();
    parser.push(content);
    parser.end();
    try {
      parser.manifest.playlists.forEach(playlist => {
        streams.push({
          resolution: playlist.attributes.RESOLUTION.height + 'p',
          uri: playlist.uri,
        });
      });
      streams.sort((a, b) => parseInt(b.resolution.split('p')[0]) - parseInt(a.resolution.split('p')[0]));
      logger.debug({ streams }, 'streams', streams.length);
      return streams.map((stream) => {
        return {
          type: 'movie',
          url: stream.uri,
          name: stream.resolution,
        };
      });
    } catch (e) {
      console.error('parseM3u8 error', e);
      return streams;
    }
  }

  parseVideoPage(args) {
    return {};
  }

  track(a1, a2) {
    // track(a1, a2)
  }
}

module.exports = Provider;