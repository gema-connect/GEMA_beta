// Node-Test der Regenkarte-Helpers (sb_niederschlag.html /*RK-ENGINE-START*/-Block)
// Aufruf: node scripts/regenkarte_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../sb_niederschlag.html', import.meta.url), 'utf8');
const m = src.match(/\/\*RK-ENGINE-START\*\/([\s\S]*?)\/\*RK-ENGINE-END\*\//);
if (!m) { console.error('RK-ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {rkLV95,rkToWGS84,rkWGS84toLV95,rkFmtDist,rkFmtNum,rkTileX,rkTileY,rkPrintZoom};
`)();

let n = 0, fail = 0;
function t(name, cond, extra) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ ' + name + (extra != null ? ' — ' + extra : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('— LV95 → WGS84 (Testvektor Bern, §5) —');
const bern = E.rkLV95(2600000, 1200000);
t('Bern lat 46.95109 ±0.001', near(bern.lat, 46.95109, 0.001), bern.lat);
t('Bern lng 7.43864 ±0.001', near(bern.lng, 7.43864, 0.001), bern.lng);

console.log('— Auto-Erkennung rkToWGS84 (Reihenfolge egal) —');
const a1 = E.rkToWGS84(2600000, 1200000);   // LV95 E/N
const a2 = E.rkToWGS84(1200000, 2600000);   // LV95 N/E (vertauscht)
t('LV95 E/N', near(a1.lat, 46.95109, 0.001) && near(a1.lng, 7.43864, 0.001));
t('LV95 N/E vertauscht', near(a2.lat, 46.95109, 0.001) && near(a2.lng, 7.43864, 0.001));
const a3 = E.rkToWGS84(600000, 200000);     // LV03 y/x (Bern)
t('LV03 y/x', near(a3.lat, 46.95109, 0.001) && near(a3.lng, 7.43864, 0.001));
const a4 = E.rkToWGS84(200000, 600000);     // LV03 x/y vertauscht
t('LV03 x/y vertauscht', near(a4.lat, 46.95109, 0.001) && near(a4.lng, 7.43864, 0.001));
const a5 = E.rkToWGS84(46.95109, 7.43864);  // WGS84 lat/lng
t('WGS84 lat/lng', a5.lat === 46.95109 && a5.lng === 7.43864);
const a6 = E.rkToWGS84(7.43864, 46.95109);  // WGS84 lng/lat
t('WGS84 lng/lat', a6.lat === 46.95109 && a6.lng === 7.43864);

console.log('— WGS84 → LV95 (Anzeige, Roundtrip) —');
const lv = E.rkWGS84toLV95(46.95109, 7.43864);
t('Bern E ±2 m', near(lv.E, 2600000, 2), lv.E);
t('Bern N ±2 m', near(lv.N, 1200000, 2), lv.N);
const basel = E.rkLV95(2611000, 1268000);
const lvB = E.rkWGS84toLV95(basel.lat, basel.lng);
t('Roundtrip Basel E ±2 m', near(lvB.E, 2611000, 2), lvB.E);
t('Roundtrip Basel N ±2 m', near(lvB.N, 1268000, 2), lvB.N);

console.log('— Distanz-Format (m/km-Logik) —');
t('420 m', E.rkFmtDist(420) === '420 m', E.rkFmtDist(420));
t('999.4 → 999 m', E.rkFmtDist(999.4) === '999 m');
t('1000 → 1.0 km', E.rkFmtDist(1000) === '1.0 km');
t('2400 → 2.4 km', E.rkFmtDist(2400) === '2.4 km');
t('ungültig → –', E.rkFmtDist('x') === '–');

console.log('— Schweizer Zahlenformat —');
t("2'611'234", E.rkFmtNum(2611234) === "2'611'234", E.rkFmtNum(2611234));
t("1'268'567", E.rkFmtNum(1268567.4) === "1'268'567");
t('999 ohne Apostroph', E.rkFmtNum(999) === '999');

console.log('— Web-Mercator + Druck-Zoom —');
t('TileX(0°) = Mitte', near(E.rkTileX(0, 10), 512, 0.001));
t('TileY(0°) = Mitte', near(E.rkTileY(0, 10), 512, 0.001));
// 1-km-Raster um Basel → BBox winzig → maximale Stufe 15
const zSmall = E.rkPrintZoom({ north: 47.575, south: 47.565, east: 7.60, west: 7.585 }, 1200, 800);
t('Nahe Punkte → z=15', zSmall === 15, zSmall);
// Ganze Schweiz → kleine Stufe, Bild passt in 1200×800 (mit 20 % Rand)
const chBB = { north: 47.8, south: 45.8, east: 10.5, west: 5.9 };
const zCH = E.rkPrintZoom(chBB, 1200, 800);
const wCH = (E.rkTileX(chBB.east, zCH) - E.rkTileX(chBB.west, zCH)) * 256;
const hCH = (E.rkTileY(chBB.south, zCH) - E.rkTileY(chBB.north, zCH)) * 256;
t('Schweiz-BBox passt in 80 % der Fläche', wCH <= 1200 * 0.8 && hCH <= 800 * 0.8, 'z=' + zCH + ' w=' + Math.round(wCH) + ' h=' + Math.round(hCH));
t('Schweiz-Zoom plausibel (8–10)', zCH >= 8 && zCH <= 10, zCH);

console.log('');
console.log(fail ? '✗ ' + fail + ' von ' + n + ' Tests FEHLGESCHLAGEN' : '✓ Alle ' + n + ' Tests grün');
process.exit(fail ? 1 : 0);
