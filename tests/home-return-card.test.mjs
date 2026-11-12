import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Minimal browser stubs so the module can be imported in Node.
globalThis.HTMLElement = class {};
globalThis.customElements = { get() { return undefined; }, define() {} };
globalThis.CustomEvent = class { constructor(type, o = {}) { this.type = type; this.detail = o.detail ?? null; } };

const url = new URL('../src/home-return-card.js', import.meta.url);
const src = fs.readFileSync(url, 'utf8');
const dist = fs.readFileSync(new URL('../dist/home-return-card.js', import.meta.url), 'utf8');
const m = await import(url.href);

test('dist bundle matches source', () => assert.equal(dist, src));

test('safe defaults: label and page title always on, card name off, no destination', () => {
  const c = m.hrConfig();
  assert.equal('show_label' in c, false);
  assert.equal('show_title' in c, false);
  assert.equal(c.show_name, false);
  assert.equal(c.name, 'HOME RETURN CARD');
  assert.equal(c.arrow, 'left');
  assert.equal(c.title, '');
  assert.equal(c.navigation_path, '');
  assert.equal(c.style, 'row');
  assert.equal(c.theme_mode, 'auto');
  assert.equal(c.auto_page, true);
  assert.equal(c.label, 'Torna alla dashboard');
});

test('config normalization rejects invalid input', () => {
  const c = m.hrConfig({ style: 'neon', theme_mode: 'x', icon: 'bad icon', show_name: 'yes', title: ' Stanza demo uno ' });
  assert.equal(c.style, 'row');
  assert.equal(c.theme_mode, 'auto');
  assert.equal(c.icon, '');
  assert.equal(c.show_name, false);
  assert.equal(c.title, 'Stanza demo uno');
  assert.equal(m.hrConfig('nope').style, 'row');
  assert.deepEqual([...m.HR_STYLES], ['row', 'centered', 'solid', 'split', 'slim']);
});

test('only internal paths are accepted as destination', () => {
  assert.equal(m.hrPath('/dashboard-demo'), '/dashboard-demo');
  assert.equal(m.hrPath('/dashboard-demo/stanza-demo-uno?x=1'), '/dashboard-demo/stanza-demo-uno?x=1');
  for (const bad of ['dashboard-demo', '//evil.example', 'https://evil.example', 'javascript:alert(1)', '/a/../b', '/a b', '/<x>', '', null, 42]) {
    assert.equal(m.hrPath(bad), '', String(bad));
  }
});

test('icon names are validated', () => {
  assert.equal(m.hrIconName('MDI:Floor-Plan'), 'mdi:floor-plan');
  assert.equal(m.hrIconName('floor-plan'), '');
  assert.equal(m.hrIconName('mdi:x"onload="1'), '');
});

test('location parsing and page name fallback', () => {
  assert.deepEqual(m.hrSplitLocation('/dashboard-demo/stanza-demo-uno'), { dash: 'dashboard-demo', view: 'stanza-demo-uno' });
  assert.deepEqual(m.hrSplitLocation('/lovelace/0'), { dash: 'lovelace', view: '0' });
  assert.deepEqual(m.hrSplitLocation('/dashboard-demo/stanza%20demo%20due?x=1'), { dash: 'dashboard-demo', view: 'stanza demo due' });
  assert.equal(m.hrHumanize('stanza-demo_due'), 'Stanza demo due');
  assert.equal(m.hrHumanize('0'), '');
});

test('page info comes from the real view, never invented', () => {
  const cfg = { views: [{ path: 'home', title: 'Casa' }, { path: 'stanza-demo-uno', title: 'Stanza demo uno', icon: 'mdi:door' }, { title: 'Senza percorso', icon: 'mdi:sofa' }] };
  assert.deepEqual(m.hrPageInfo(cfg, { dash: 'd', view: 'stanza-demo-uno' }), { title: 'Stanza demo uno', icon: 'mdi:door' });
  assert.deepEqual(m.hrPageInfo(cfg, { dash: 'd', view: '2' }), { title: 'Senza percorso', icon: 'mdi:sofa' });
  assert.deepEqual(m.hrPageInfo(cfg, { dash: 'd', view: '' }), { title: 'Casa', icon: '' });
  assert.deepEqual(m.hrPageInfo(null, { dash: 'd', view: 'stanza-demo-due' }), { title: 'Stanza demo due', icon: '' });
  assert.deepEqual(m.hrPageInfo({ views: [{ path: 'x', icon: '<b>' }] }, { dash: 'd', view: 'x' }), { title: 'X', icon: '' });
});

test('dashboard config is requested once and failures are not retried in a loop', async () => {
  m.HR_CACHE.clear();
  let calls = 0;
  const hass = { callWS: async msg => { calls++; assert.equal(msg.type, 'lovelace/config'); assert.equal(msg.url_path, 'dash-a'); return { views: [] }; } };
  await Promise.all([m.hrLoadDashboard(hass, 'dash-a'), m.hrLoadDashboard(hass, 'dash-a')]);
  await m.hrLoadDashboard(hass, 'dash-a');
  assert.equal(calls, 1);
  const bad = { callWS: async () => { calls++; throw new Error('denied'); } };
  assert.equal(await m.hrLoadDashboard(bad, 'dash-b'), null);
  await m.hrLoadDashboard(bad, 'dash-b');
  assert.equal(calls, 2);
  const def = { callWS: async msg => { assert.equal('url_path' in msg, false); return { views: [] }; } };
  await m.hrLoadDashboard(def, 'lovelace');
});

test('escaping', () => assert.equal(m.hrEsc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;'));

test('arrow choice is limited to known presets', () => {
  assert.deepEqual(Object.keys(m.HR_ARROWS), ['left', 'up', 'return', 'check', 'exit']);
  assert.equal(m.hrConfig({ arrow: 'up' }).arrow, 'up');
  assert.equal(m.hrConfig({ arrow: 'x"y' }).arrow, 'left');
  assert.equal(m.hrConfig({ arrow: '__proto__' }).arrow, 'left');
  for (const a of Object.values(m.HR_ARROWS)) assert.match(a.icon, /^mdi:[a-z-]+$/);
});

test('density is standard by default and limited to known values', () => {
  assert.equal(m.hrConfig().density, 'standard');
  assert.equal(m.hrConfig({ density: 'thin' }).density, 'thin');
  assert.equal(m.hrConfig({ density: 'huge' }).density, 'standard');
  assert.equal(m.hrConfig({ density: '__proto__' }).density, 'standard');
  assert.deepEqual(Object.keys(m.HR_DENSITIES), ['standard', 'thin']);
});

test('dashboard icon comes from the sidebar panel and is validated', () => {
  const hass = { panels: { 'dashboard-demo': { icon: 'mdi:home' }, bad: { icon: 'x"y' }, none: { icon: null } } };
  assert.equal(m.hrDashIcon(hass, 'dashboard-demo'), 'mdi:home');
  assert.equal(m.hrDashIcon(hass, 'bad'), '');
  assert.equal(m.hrDashIcon(hass, 'none'), '');
  assert.equal(m.hrDashIcon(hass, 'missing'), '');
  assert.equal(m.hrDashIcon(null, 'dashboard-demo'), '');
  assert.equal(m.hrDashIcon({}, 'dashboard-demo'), '');
});

test('sections view: full width, rows left undefined', () => {
  const o = m.HomeReturnCard.prototype.getGridOptions.call({});
  assert.deepEqual(o, { columns: 'full' });
  assert.equal('rows' in o, false);
});
