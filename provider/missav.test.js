const { test } = require('node:test');
const assert = require('node:assert').strict;
const createProvider = require('./missav');

test('MissAV catalog extracts cards with nested divs', () => {
  const provider = createProvider();
  const html = `
    <div class="thumbnail group">
      <div>
        <div><a href="/en/video-1"><img data-src="/poster-1.jpg" alt="Poster title"></a></div>
      </div>
      <div><a href="/en/video-1">Video title</a></div>
    </div>
    <div class="thumbnail group">
      <a href="/en/video-without-child-div">Not a catalog card</a>
    </div>
  `;

  const metas = provider.getCatalogMetas(html);

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, '/en/video-1');
  assert.equal(metas[0].name, 'Video title');
  assert.equal(metas[0].poster, '/poster-1.jpg');
});

test('MissAV catalog falls back to the image src for the poster', () => {
  const provider = createProvider();
  const html = `
    <div class="thumbnail group">
      <div><a href="/en/video-2"><img src="/poster-2.jpg"></a></div>
      <div><a href="/en/video-2">Another video</a></div>
    </div>
  `;

  const metas = provider.getCatalogMetas(html);

  assert.equal(metas.length, 1);
  assert.equal(metas[0].poster, '/poster-2.jpg');
});
