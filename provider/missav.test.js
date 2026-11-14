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

test('MissAV logs safe diagnostics and skips parsing non-OK responses', async () => {
  const provider = createProvider();
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  let warning;
  global.fetch = async () => ({
    ok: false,
    status: 403,
    url: 'https://missav.ws/challenge?token=private',
    redirected: true,
    headers: new Headers({
      'content-type': 'text/html; charset=UTF-8',
      'cf-ray': 'test-ray-id',
      'set-cookie': 'private-cookie',
    }),
    text: async () => `
      <html><head><title>Access denied</title></head>
      <body><p>Automated requests are blocked</p>
      <script>private script data</script></body></html>
    `,
  });
  console.warn = (...args) => {
    warning = args;
  };

  try {
    const html = await provider.fetchHtml('https://missav.ws/catalog');
    const metas = provider.getCatalogMetas(html, 'https://missav.ws/catalog');
    const details = warning[1];

    assert.equal(html, '');
    assert.deepEqual(metas, []);
    assert.equal(warning[0], '[MissAV] request returned a non-OK response');
    assert.equal(details.status, 403);
    assert.equal(details.finalUrl, 'https://missav.ws/challenge');
    assert.equal(details.pageTitle, 'Access denied');
    assert.match(details.bodyPreview, /Automated requests are blocked/);
    assert.equal(details.responseHeaders['cf-ray'], 'test-ray-id');
    assert.equal(details.responseHeaders['set-cookie'], undefined);
    assert.equal(JSON.stringify(details).includes('private'), false);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
