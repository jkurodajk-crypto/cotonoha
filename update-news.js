// cotonoha.link の「新着」を、noteのRSSから作り直す。
//
// GitHub Actions（.github/workflows/update-news.yml）から毎日呼ばれます。
// index.html の <!--NEWS_START--> と <!--NEWS_END--> のあいだを、最新5件に差し替えます。
//
// ⚠ 2026-11-14 設置。理由：
//   サイトの新着が 2026.08.22 で止まっていた。同じページに「毎週木曜に更新」と
//   書いてあるのに、見た人には止まって見える状態だった。
//   手で足す形だと、また止まる。だから取りに行く形にした。
//
// ⚠ noteのRSSは CORS ヘッダを返さないので、ブラウザからは直接読めない。
//   だから GitHub の中で動かしている。

const fs = require('fs');
const https = require('https');

const RSS = 'https://note.com/cotonoha_usagi/rss';
const HTML = 'index.html';
const COUNT = 5;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'cotonoha-site-updater' } }, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let b = '';
      res.setEncoding('utf8');
      res.on('data', d => b += d);
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

function unescapeXml(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parse(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1];
    const pick = tag => {
      const x = body.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
      return x ? unescapeXml(x[1]) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pub = pick('pubDate');
    if (!title || !link) continue;
    const d = new Date(pub);
    if (isNaN(d)) continue;
    items.push({ title, link, d });
  }
  items.sort((a, b) => b.d - a.d);
  return items;
}

// 日本時間で日付を出す
function ymd(d) {
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return j.getUTCFullYear() + '.' + p(j.getUTCMonth() + 1) + '.' + p(j.getUTCDate());
}

(async () => {
  const items = parse(await get(RSS)).slice(0, COUNT);
  if (items.length === 0) { console.log('記事が0件でした。書き換えません。'); return; }

  const block = items.map(it =>
    '      <a href="' + escapeHtml(it.link) + '" target="_blank" rel="noopener">\n' +
    '        <span class="dt">' + ymd(it.d) + '</span>\n' +
    '        <span class="ti">' + escapeHtml(it.title) + '</span></a>'
  ).join('\n');

  let html = fs.readFileSync(HTML, 'utf8');
  const S = '<!--NEWS_START-->';
  const E = '<!--NEWS_END-->';
  const i = html.indexOf(S);
  const j = html.indexOf(E);
  if (i < 0 || j < 0) { console.log('目印が見つかりません。書き換えません。'); return; }

  const after = '\n' + block + '\n';
  if (html.slice(i + S.length, j) === after) { console.log('すでに最新です。'); return; }

  fs.writeFileSync(HTML, html.slice(0, i + S.length) + after + html.slice(j));
  console.log('更新しました（' + items.length + '件）');
  items.forEach(it => console.log('  ' + ymd(it.d) + '  ' + it.title.slice(0, 50)));
})().catch(e => { console.log('失敗しました: ' + e.message); process.exit(1); });
