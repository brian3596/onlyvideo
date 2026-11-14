const { test } = require('node:test');
const assert = require('node:assert').strict;
const createProvider = require('./javtiful');

test('Javtiful catalog extracts poster links and resolves relative URLs', () => {
  const provider = createProvider();
  const html = `
    <article class="video-card">
      <a href="/en/video/example" title="Example title">
        <img data-src="/posters/example.jpg" alt="Poster">
      </a>
    </article>
    <article class="video-card">
      <a href="/en/video/example">
        <img src="/posters/duplicate.jpg" alt="Duplicate">
      </a>
    </article>
  `;

  const metas = provider.getCatalogMetas(html);

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, 'https://javtiful.com/en/video/example');
  assert.equal(metas[0].name, 'Example title');
  assert.equal(metas[0].poster, 'https://javtiful.com/posters/example.jpg');
  assert.equal(metas[0].videoPageUrl, metas[0].id);
});

test('Javtiful catalog ignores site navigation and links without poster images', () => {
  const provider = createProvider();
  const html = `
    <a href="/en/videos"><img src="/logo.jpg" alt="Videos"></a>
    <a href="/en/video-without-poster">A video link</a>
    <a href="https://example.com/video">
      <img src="/poster.jpg" alt="External link">
    </a>
  `;

  assert.deepEqual(provider.getCatalogMetas(html), []);
});

test('Javtiful metadata parses Open Graph data without requiring keywords', () => {
  const provider = createProvider();
  const result = provider.parseVideoPage({
    id: 'https://javtiful.com/en/video/example',
    html: `
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="Example video">
          <meta property="og:description" content="Example description">
          <meta property="og:image" content="/posters/example.jpg">
        </head>
      </html>
    `,
  });

  assert.equal(result.metaResponse.name, 'Example video');
  assert.equal(result.metaResponse.description, 'Example description');
  assert.equal(result.metaResponse.poster, 'https://javtiful.com/posters/example.jpg');
  assert.deepEqual(result.metaResponse.genres, []);
  assert.equal(result.videoPageUrl, '');
});
