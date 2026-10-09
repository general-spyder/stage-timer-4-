// Downloads the open-source (SIL OFL) fonts bundled with the app. Run once: npm run fonts
const https = require('https'), fs = require('fs'), path = require('path');
const B = 'https://github.com/google/fonts/raw/main/ofl/';
const FILES = {
  'Poppins-Regular.ttf': 'poppins/Poppins-Regular.ttf', 'Poppins-Medium.ttf': 'poppins/Poppins-Medium.ttf',
  'Poppins-SemiBold.ttf': 'poppins/Poppins-SemiBold.ttf', 'Poppins-ExtraBold.ttf': 'poppins/Poppins-ExtraBold.ttf',
  'Montserrat.ttf': 'montserrat/Montserrat%5Bwght%5D.ttf', 'BebasNeue-Regular.ttf': 'bebasneue/BebasNeue-Regular.ttf',
  'Outfit.ttf': 'outfit/Outfit%5Bwght%5D.ttf', 'Figtree.ttf': 'figtree/Figtree%5Bwght%5D.ttf'
};
const dir = path.join(__dirname, '..', 'assets', 'fonts'); fs.mkdirSync(dir, { recursive: true });
function get(url, out, n = 0) {
  return new Promise((ok, no) => https.get(url, r => {
    if ([301, 302, 307, 308].includes(r.statusCode) && n < 6) return ok(get(new URL(r.headers.location, url).href, out, n + 1));
    if (r.statusCode !== 200) return no(new Error(url + ' -> ' + r.statusCode));
    r.pipe(fs.createWriteStream(out)).on('finish', ok);
  }).on('error', no));
}
(async () => { for (const [f, u] of Object.entries(FILES)) { process.stdout.write('Downloading ' + f + ' ... '); await get(B + u, path.join(dir, f)); console.log('ok'); } })().catch(e => { console.error(e.message); process.exit(1); });
