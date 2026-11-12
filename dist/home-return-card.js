/**
 * Home Return Card — Home Assistant dashboard card.
 * Copyright (c) 2026 luigi-regolo. SPDX-License-Identifier: GPL-3.0-only.
 * No telemetry, remote scripts, external assets, or credentials. It only changes page: it never sends commands.
 */
const HR_TAG = 'home-return-card';
const HR_EDITOR_TAG = 'home-return-card-editor';
const HR_STYLES = Object.freeze(['row', 'centered', 'solid', 'split', 'slim']);
const HR_DENSITIES = Object.freeze({ standard: 'Standard', thin: 'Sottile' });
const HR_STYLE_LABEL = Object.freeze({
  row: 'Riga con freccia', centered: 'Centrata', solid: 'Smeraldo pieno', split: 'Pannello freccia', slim: 'Percorso sottile',
});
const HR_DEFAULTS = Object.freeze({
  style: 'row', density: 'standard', navigation_path: '', label: 'Torna alla dashboard', title: '',
  arrow: 'left', show_name: false, name: 'HOME RETURN CARD', icon: '', auto_page: true, theme_mode: 'auto',
});
const HR_FALLBACK_ICON = 'mdi:view-dashboard';
// Arrow shown on the button: the user chooses it in the editor. "left" is the default.
const HR_ARROWS = Object.freeze({
  left: { icon: 'mdi:arrow-left', label: 'Freccia a sinistra' },
  up: { icon: 'mdi:arrow-up', label: 'Freccia in alto' },
  return: { icon: 'mdi:keyboard-return', label: 'Ritorno' },
  check: { icon: 'mdi:check', label: 'Spunta' },
  exit: { icon: 'mdi:exit-to-app', label: 'Cambio vista' },
});
const HR_CACHE = new Map();

function hrText(value, max = 100) { return String(value ?? '').trim().slice(0, max); }
function hrEsc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Only internal paths are accepted: they must start with a single "/" and use a restricted character set,
// so no external URL, protocol or script can ever be a destination.
function hrPath(value) {
  const p = hrText(value, 200);
  if (!p.startsWith('/') || p.startsWith('//')) return '';
  if (!/^\/[A-Za-z0-9\-._~%/?=&#]*$/.test(p)) return '';
  if (p.split(/[?#]/)[0].split('/').some(s => s === '..')) return '';
  return p;
}
function hrIconName(value) {
  const v = hrText(value, 80).toLowerCase();
  return /^[a-z0-9-]+:[a-z0-9-]+$/.test(v) ? v : '';
}
// Icon of a dashboard as registered in the sidebar (hass.panels[url_path].icon). Optional: returns '' when unavailable.
function hrDashIcon(hass, dash) {
  const panels = hass && typeof hass.panels === 'object' ? hass.panels : null;
  const panel = panels && dash ? panels[dash] : null;
  return panel && typeof panel === 'object' ? hrIconName(panel.icon) : '';
}
function hrConfig(raw = {}) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    type: 'custom:home-return-card',
    style: HR_STYLES.includes(r.style) ? r.style : HR_DEFAULTS.style,
    density: Object.prototype.hasOwnProperty.call(HR_DENSITIES, r.density) ? r.density : HR_DEFAULTS.density,
    navigation_path: hrPath(r.navigation_path),
    arrow: Object.prototype.hasOwnProperty.call(HR_ARROWS, r.arrow) ? r.arrow : HR_DEFAULTS.arrow,
    label: hrText(r.label ?? HR_DEFAULTS.label, 60),
    title: hrText(r.title, 60),
    show_name: r.show_name === true,
    name: hrText(r.name ?? HR_DEFAULTS.name, 60).replace(/\.+$/, '') || HR_DEFAULTS.name,
    icon: hrIconName(r.icon),
    auto_page: r.auto_page !== false,
    theme_mode: ['auto', 'light', 'dark'].includes(r.theme_mode) ? r.theme_mode : 'auto',
  };
}
function hrSplitLocation(pathname) {
  const parts = String(pathname ?? '').split(/[?#]/)[0].split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  return { dash: parts[0] || '', view: parts[1] || '' };
}
function hrHumanize(segment) {
  const s = String(segment ?? '').replace(/[-_]+/g, ' ').trim();
  if (!s || /^\d+$/.test(s)) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function hrFindView(config, viewSeg) {
  const views = Array.isArray(config?.views) ? config.views : [];
  if (!views.length) return null;
  if (!viewSeg) return views[0] || null;
  const byPath = views.find(v => v && typeof v === 'object' && v.path === viewSeg);
  if (byPath) return byPath;
  if (/^\d+$/.test(viewSeg)) return views[Number(viewSeg)] || null;
  return null;
}
// Page name and icon of the view that is on screen. Nothing is invented: when the dashboard
// configuration is not readable, the name is derived from the URL and the icon stays empty.
function hrPageInfo(config, loc) {
  const view = hrFindView(config, loc.view);
  return {
    title: hrText(view?.title, 60) || hrHumanize(loc.view) || hrHumanize(loc.dash),
    icon: hrIconName(view?.icon),
  };
}
function hrLoadDashboard(hass, dash) {
  const now = Date.now();
  const hit = HR_CACHE.get(dash);
  if (hit && (hit.promise || now - hit.at < (hit.config ? 300000 : 60000))) return hit.promise || Promise.resolve(hit.config);
  const msg = { type: 'lovelace/config' };
  if (dash && dash !== 'lovelace') msg.url_path = dash;
  const entry = { at: now, config: null, promise: null };
  entry.promise = Promise.resolve()
    .then(() => hass.callWS(msg))
    .then(cfg => { entry.config = cfg && typeof cfg === 'object' ? cfg : null; })
    .catch(() => { entry.config = null; })
    .then(() => { entry.at = Date.now(); entry.promise = null; return entry.config; });
  HR_CACHE.set(dash, entry);
  return entry.promise;
}
function hrNavigate(path) {
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false }, bubbles: true, composed: true }));
}

const HR_STYLE = `
:host{display:block;box-sizing:border-box;width:100%;min-width:0;color:var(--primary-text-color,#18221c);font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,Roboto,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif));font-size:14px}
*,*:before,*:after{box-sizing:border-box}
ha-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;--mdc-icon-size:20px;width:20px;height:20px}
.hr-theme{--hr-accent:#0a7156;--hr-muted:#56675c;--hr-surface:#f0f2ef;--hr-circle:#fff;--hr-border:#e0e5df;--hr-bg:#fafbf9;--hr-fg:#18221c;--hr-btn-fg:var(--hr-accent)}
.hr-theme.hr-dark{--hr-accent:#0e795d;--hr-muted:#bbc5bd;--hr-surface:#191c1a;--hr-circle:#282b29;--hr-border:#2b302c;--hr-bg:#101211;--hr-fg:#f5f7f4;--hr-btn-fg:var(--hr-fg)}
.hr-host{container:hr-card/inline-size;min-width:0;width:100%}
.hr-btn{appearance:none;display:flex;width:100%;margin:0;font:inherit;text-align:left;color:var(--hr-fg);background:var(--hr-bg);border:1px solid var(--hr-border);cursor:pointer;-webkit-tap-highlight-color:transparent;min-width:0}
.hr-btn:focus-visible{outline:2px solid var(--hr-accent);outline-offset:2px}
.hr-btn.hr-off{cursor:default}
.hr-orb{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:50%;background:var(--hr-circle);color:var(--hr-fg)}
.hr-orb ha-icon{--mdc-icon-size:26px;width:26px;height:26px}
.hr-go{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:var(--hr-surface);border:1px solid var(--hr-border);color:var(--hr-btn-fg)}
.hr-go ha-icon{--mdc-icon-size:20px;width:20px;height:20px}
.hr-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.hr-eyebrow{display:block;font-size:10px;letter-spacing:1.7px;font-weight:750;color:var(--hr-muted);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hr-name{display:block;height:14px;margin:0 4px 10px;font-size:10px;line-height:14px;letter-spacing:1.7px;font-weight:750;color:var(--hr-muted);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hr-title{display:flex;min-width:0;font-size:22px;line-height:1.14;font-weight:780;letter-spacing:-.7px}
.hr-title .hr-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hr-title b{flex:none;color:var(--hr-accent);font-weight:800}
/* A — riga con freccia */
.hr-row{align-items:center;gap:14px;padding:14px 16px;border-radius:26px;min-height:80px}
.hr-row.hr-notext{justify-content:center;gap:16px}
/* B — centrata */
.hr-centered{flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 18px 18px;border-radius:26px;text-align:center;min-height:80px}
.hr-centered .hr-orb{width:52px;height:52px}.hr-centered .hr-orb ha-icon{--mdc-icon-size:28px;width:28px;height:28px}
.hr-centered .hr-title{font-size:24px;max-width:100%;justify-content:center}
.hr-pill{display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%;min-height:36px;padding:8px 18px;border-radius:999px;font-size:11px;font-weight:650;letter-spacing:1.2px;text-transform:uppercase;color:var(--hr-btn-fg);border:1px solid color-mix(in srgb,var(--hr-accent) 45%,transparent);background:color-mix(in srgb,var(--hr-accent) 12%,transparent)}
.hr-pill ha-icon{--mdc-icon-size:18px;width:18px;height:18px}
.hr-pill span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* C — smeraldo pieno (il punto del titolo usa una tinta chiara per restare visibile sul fondo verde) */
.hr-solid{position:relative;overflow:hidden;align-items:center;gap:14px;padding:18px 20px;border-radius:26px;min-height:80px;color:#fff;border-color:rgba(255,255,255,.14);background:linear-gradient(135deg,var(--hr-accent),color-mix(in srgb,var(--hr-accent) 58%,#000))}
.hr-solid.hr-notext{justify-content:center}
.hr-solid .hr-eyebrow{color:rgba(255,255,255,.82)}
.hr-solid .hr-title{font-size:24px}.hr-solid .hr-title b{color:#8ff0c8}
.hr-solid .hr-go{position:relative;width:46px;height:46px;color:#fff;background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.32)}
.hr-solid .hr-text{position:relative}
.hr-mark{position:absolute;right:-14px;top:-12px;display:flex;color:rgba(255,255,255,.1);pointer-events:none}
.hr-mark ha-icon{--mdc-icon-size:120px;width:120px;height:120px}
/* D — pannello freccia */
.hr-split{align-items:stretch;padding:0;overflow:hidden;border-radius:22px;min-height:80px}
.hr-pan{flex:none;width:64px;display:grid;place-items:center;color:#fff;background:linear-gradient(160deg,var(--hr-accent),color-mix(in srgb,var(--hr-accent) 62%,#000))}
.hr-pan ha-icon{--mdc-icon-size:24px;width:24px;height:24px}
.hr-body{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:14px 16px 14px 18px}
.hr-body.hr-notext{justify-content:center}
.hr-split .hr-title{font-size:20px}.hr-split .hr-orb{width:42px;height:42px;background:var(--hr-surface);border:1px solid var(--hr-border)}.hr-split .hr-orb ha-icon{--mdc-icon-size:22px;width:22px;height:22px}
/* E — percorso sottile */
.hr-slim{align-items:center;gap:12px;padding:8px 18px 8px 8px;border-radius:999px;min-height:54px}
.hr-slim.hr-notext{justify-content:center;padding-right:8px}
.hr-slim .hr-go{width:38px;height:38px}
.hr-slim .hr-eyebrow{flex:none;max-width:45%}
.hr-sep{flex:none;color:var(--hr-muted);font-size:15px}
.hr-slim .hr-title{flex:1;font-size:16px;letter-spacing:-.3px}
/* Altezza sottile: stessi elementi, spazi e cerchi più piccoli (l'area di tocco resta di almeno 46 px) */
.hr-thin.hr-row{padding:8px 14px;gap:12px;border-radius:22px;min-height:56px}
.hr-thin.hr-row .hr-orb{width:38px;height:38px}.hr-thin.hr-row .hr-orb ha-icon{--mdc-icon-size:21px;width:21px;height:21px}
.hr-thin .hr-text{gap:2px}.hr-thin.hr-row .hr-title{font-size:18px}.hr-thin.hr-row .hr-go{width:34px;height:34px}
.hr-thin.hr-centered{padding:12px 14px;gap:6px;border-radius:22px;min-height:56px}
.hr-thin.hr-centered .hr-orb{width:40px;height:40px}.hr-thin.hr-centered .hr-orb ha-icon{--mdc-icon-size:22px;width:22px;height:22px}
.hr-thin.hr-centered .hr-title{font-size:20px}.hr-thin .hr-pill{min-height:30px;padding:5px 14px}
.hr-thin.hr-solid{padding:9px 16px;gap:12px;border-radius:22px;min-height:56px}
.hr-thin.hr-solid .hr-title{font-size:19px}.hr-thin.hr-solid .hr-go{width:38px;height:38px}
.hr-thin .hr-mark{right:-10px;top:-8px}.hr-thin .hr-mark ha-icon{--mdc-icon-size:84px;width:84px;height:84px}
.hr-thin.hr-split{min-height:56px;border-radius:20px}.hr-thin .hr-pan{width:52px}
.hr-thin .hr-body{padding:8px 14px 8px 16px}.hr-thin.hr-split .hr-title{font-size:17px}
.hr-thin.hr-split .hr-orb{width:34px;height:34px}.hr-thin.hr-split .hr-orb ha-icon{--mdc-icon-size:19px;width:19px;height:19px}
.hr-thin.hr-slim{min-height:46px;padding:5px 16px 5px 6px}.hr-thin.hr-slim .hr-go{width:32px;height:32px}.hr-thin.hr-slim .hr-title{font-size:15px}
@container hr-card (max-width:340px){
  .hr-row{padding:12px 13px;gap:11px;border-radius:23px}.hr-row .hr-orb{width:42px;height:42px}.hr-row .hr-orb ha-icon{--mdc-icon-size:23px;width:23px;height:23px}
  .hr-row .hr-title{font-size:20px}.hr-go{width:36px;height:36px}
  .hr-centered{padding:16px 13px 14px;border-radius:23px}.hr-centered .hr-title{font-size:22px}
  .hr-solid{padding:14px 15px;border-radius:23px}.hr-solid .hr-title{font-size:22px}.hr-mark{display:none}
  .hr-pan{width:52px}.hr-body{padding:12px 12px 12px 14px}.hr-split .hr-title{font-size:18px}
  .hr-slim{padding-right:14px}.hr-slim .hr-eyebrow{display:none}.hr-slim .hr-sep{display:none}
}
@container hr-card (max-width:270px){.hr-eyebrow{font-size:9px;letter-spacing:1.3px}.hr-split .hr-body>.hr-orb{display:none}}
@media(prefers-reduced-motion:no-preference){.hr-btn{transition:background .15s,border-color .15s}.hr-go ha-icon,.hr-pan ha-icon{transition:transform .15s}.hr-btn:not(.hr-off):hover .hr-go ha-icon,.hr-btn:not(.hr-off):hover .hr-pan ha-icon,.hr-btn:not(.hr-off):hover .hr-pill ha-icon{transform:translateX(-2px)}}
.hr-btn:not(.hr-off):not(.hr-solid):not(.hr-split):hover{border-color:color-mix(in srgb,var(--hr-accent) 55%,var(--hr-border))}
`;

class HomeReturnCard extends HTMLElement {
  static getStubConfig() { return hrConfig(); }
  static getConfigElement() { return document.createElement(HR_EDITOR_TAG); }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = hrConfig(); this._hass = null; this._last = ''; this._asked = ''; this._navAt = 0;
    this.shadowRoot.addEventListener('click', event => this._click(event));
    this._onAppearance = () => this._paint();
    this._onLocation = () => { this._asked = ''; this._last = ''; this._paint(); this._ensurePage(); };
    this._media = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme:dark)') : null;
  }
  connectedCallback() {
    this._media?.addEventListener?.('change', this._onAppearance);
    window.addEventListener('location-changed', this._onLocation);
    window.addEventListener('popstate', this._onLocation);
    this._last = ''; this._paint(); this._ensurePage();
  }
  disconnectedCallback() {
    this._media?.removeEventListener?.('change', this._onAppearance);
    window.removeEventListener('location-changed', this._onLocation);
    window.removeEventListener('popstate', this._onLocation);
  }
  setConfig(raw) { this._config = hrConfig(raw); this._asked = ''; this._last = ''; this._paint(); this._ensurePage(); }
  set hass(hass) { this._hass = hass; this._paint(); this._ensurePage(); }
  getCardSize() { return 2; }
  // Sections view: full width (also in wide sections). Rows are left undefined so the card keeps its own height.
  getGridOptions() { return { columns: 'full' }; }
  _isDark() {
    const mode = this._config.theme_mode;
    return mode === 'dark' || (mode === 'auto' && (this._hass?.themes?.darkMode === true || (!this._hass?.themes && this._media?.matches === true)));
  }
  _loc() { return hrSplitLocation(typeof window !== 'undefined' ? window.location?.pathname : ''); }
  // Everything is drawn from what is already known (URL + cached dashboard), so the card never changes size
  // after it appears: when the real page name arrives it only replaces the text inside a fixed-height line.
  _page() {
    const loc = this._loc();
    const cached = HR_CACHE.get(loc.dash)?.config;
    const info = cached ? hrPageInfo(cached, loc) : { title: hrHumanize(loc.view) || hrHumanize(loc.dash), icon: '' };
    const dash = this._config.navigation_path ? hrSplitLocation(this._config.navigation_path).dash : loc.dash;
    const icon = this._config.icon || hrDashIcon(this._hass, dash) || info.icon || HR_FALLBACK_ICON;
    return { title: this._config.title || info.title, icon };
  }
  _ensurePage() {
    const c = this._config, hass = this._hass;
    if (!c.auto_page || !hass || typeof hass.callWS !== 'function') return;
    if (!(!c.title || !c.icon)) return;
    const dash = this._loc().dash;
    if (this._asked === dash) return;
    this._asked = dash;
    hrLoadDashboard(hass, dash).then(() => { this._last = ''; this._paint(); });
  }
  _paint() {
    if (!this.shadowRoot || !this.isConnected) return;
    const c = this._config, dark = this._isDark(), page = this._page();
    const sig = JSON.stringify([c, dark, page]);
    if (sig === this._last) return;
    this._last = sig;
    this.shadowRoot.innerHTML = `<style>${HR_STYLE}</style><div class="hr-theme ${dark ? 'hr-dark' : 'hr-light'}"><div class="hr-host">${c.show_name ? `<div class="hr-name">${hrEsc(c.name)}</div>` : ''}${this._button(c, page)}</div></div>`;
  }
  _button(c, page) {
    const arrow = `<ha-icon icon="${HR_ARROWS[c.arrow].icon}"></ha-icon>`;
    const room = `<ha-icon icon="${hrEsc(page.icon)}"></ha-icon>`;
    const label = c.label ? `<span class="hr-eyebrow">${hrEsc(c.label)}</span>` : '';
    const title = page.title ? `<span class="hr-title"><span class="hr-t">${hrEsc(page.title)}</span><b>.</b></span>` : '';
    const text = label + title;
    const notext = text ? '' : ' hr-notext';
    const off = c.navigation_path ? '' : ' hr-off';
    const name = `${c.label || HR_DEFAULTS.label}${page.title ? `, da ${page.title}` : ''}`;
    const open = `<button type="button" class="hr-btn hr-${c.style}${c.density === 'thin' ? ' hr-thin' : ''}${notext}${off}" aria-label="${hrEsc(name)}"${c.navigation_path ? '' : ' aria-disabled="true" title="Scegli la destinazione nell’editor"'}>`;
    const block = text ? `<span class="hr-text">${text}</span>` : '';
    switch (c.style) {
      case 'centered':
        return `${open}<span class="hr-orb">${room}</span>${title}<span class="hr-pill">${arrow}${c.label ? `<span>${hrEsc(c.label)}</span>` : ''}</span></button>`;
      case 'solid':
        return `${open}<span class="hr-mark">${room}</span><span class="hr-go">${arrow}</span>${block}</button>`;
      case 'split':
        return `${open}<span class="hr-pan">${arrow}</span><span class="hr-body${notext}">${block}<span class="hr-orb">${room}</span></span></button>`;
      case 'slim':
        return `${open}<span class="hr-go">${arrow}</span>${label}${label && title ? '<span class="hr-sep">/</span>' : ''}${title}</button>`;
      default:
        return `${open}<span class="hr-orb">${room}</span>${block}<span class="hr-go">${arrow}</span></button>`;
    }
  }
  _click(event) {
    const t = event.target;
    if (!t || !t.closest || !t.closest('.hr-btn')) return;
    const path = this._config.navigation_path;
    const now = Date.now();
    if (!path || now - this._navAt < 500) return;
    this._navAt = now;
    hrNavigate(path);
  }
}

const HR_EDITOR_CSS = `
:host{display:block;color:var(--primary-text-color,#18221c);font-family:var(--ha-font-family-body,Roboto,Arial,sans-serif);font-size:var(--ha-font-size-m,14px)}
*,*:before,*:after{box-sizing:border-box}
.hr-tabs{display:flex;gap:5px;overflow-x:auto;padding-bottom:14px;border-bottom:1px solid var(--divider-color,#dfe5df)}
.hr-tab{border:0;background:none;color:var(--secondary-text-color,#536359);border-radius:13px;padding:10px 13px;white-space:nowrap;font:inherit;cursor:pointer}
.hr-tab.active{color:var(--primary-text-color,#17231c);background:var(--secondary-background-color,#f0f2ef);font-weight:650}
.hr-heading{font-size:21px;font-weight:500;margin:25px 0 9px}.hr-desc{color:var(--secondary-text-color,#55665a);font-size:13px;line-height:1.5;margin-bottom:22px}
.hr-sub{font-size:11px;letter-spacing:1.2px;font-weight:700;text-transform:uppercase;color:var(--secondary-text-color,#55665a);margin:24px 0 4px}
.hr-field{display:block;margin:20px 0}.hr-label{font-size:14px;margin-bottom:10px}
.hr-input{display:block;width:100%;background:var(--secondary-background-color,#f0f2ef);color:var(--primary-text-color,#18221c);border:0;border-bottom:1px solid var(--divider-color,#a5afa5);padding:14px 13px;min-height:50px;border-radius:11px 11px 0 0;font:inherit}
.hr-erow{border-bottom:1px solid var(--divider-color,#e3e7e3);padding:13px 0;display:flex;align-items:center;justify-content:space-between;gap:15px}
.hr-erow label{flex:1}.hr-erow input[type=checkbox]{width:18px;height:18px;accent-color:var(--primary-color,#0c7157)}
.hr-muted{font-size:12px;line-height:1.5;color:var(--secondary-text-color,#5e6c62)}
.hr-editor ha-selector{display:block;width:100%}.hr-fallback{display:none}.hr-no-native .hr-fallback{display:block}.hr-no-native ha-selector{display:none}
.hr-input:focus-visible,.hr-tab:focus-visible{outline:2px solid var(--primary-color,#0b7457);outline-offset:2px}
`;
class HomeReturnCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = hrConfig(); this._hass = null; this._tab = 'destinazione'; this._nativeTried = false;
    this.shadowRoot.addEventListener('click', e => this._click(e));
    this.shadowRoot.addEventListener('change', e => this._change(e));
  }
  set hass(hass) { this._hass = hass; this.shadowRoot.querySelectorAll('ha-selector').forEach(el => { el.hass = hass; }); }
  setConfig(raw) {
    const config = hrConfig(raw);
    if (JSON.stringify(config) === JSON.stringify(this._config) && this.shadowRoot.querySelector('.hr-editor')) return;
    this._config = config; this._render();
  }
  connectedCallback() { this._render(); this._ensureNative(); }
  async _ensureNative() {
    if (this._nativeTried) return;
    this._nativeTried = true;
    if (!customElements.get('ha-selector')) {
      try { const helper = await window.loadCardHelpers?.(); await helper?.importSelector?.(); }
      catch { /* The native selector is optional: a text field is used instead. */ }
    }
    this._render();
  }
  _emit() { this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true })); }
  _update(patch) { this._config = hrConfig({ ...this._config, ...patch }); this._emit(); this._render(); }
  _field(label, inner, help = '') { return `<div class="hr-field"><div class="hr-label">${hrEsc(label)}</div>${inner}${help ? `<div class="hr-muted" style="margin-top:8px">${hrEsc(help)}</div>` : ''}</div>`; }
  _input(key, label, value, help = '', placeholder = '') { return this._field(label, `<input class="hr-input" type="text" maxlength="200" data-key="${key}" value="${hrEsc(value)}" placeholder="${hrEsc(placeholder)}"/>`, help); }
  _select(key, label, options, value) { return this._field(label, `<select class="hr-input" data-key="${key}">${options.map(([v, l]) => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${hrEsc(l)}</option>`).join('')}</select>`); }
  _check(key, id, label, checked, help = '') { return `<div class="hr-erow"><label for="hr-${id}">${label}${help ? `<div class="hr-muted">${hrEsc(help)}</div>` : ''}</label><input id="hr-${id}" type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}/></div>`; }
  _render() {
    if (!this.isConnected) return;
    const c = this._config;
    const tabs = [['destinazione', 'Destinazione'], ['aspetto', 'Aspetto'], ['avanzate', 'Avanzate']];
    let body = '';
    if (this._tab === 'destinazione') {
      body = '<div class="hr-heading">Dove tornare</div><div class="hr-desc">Scegli la dashboard o la vista a cui riporta la card. Sono accettati solo percorsi interni di Home Assistant.</div>' +
        this._field('Destinazione', `<div data-host="navigation_path"></div><div class="hr-fallback"><input class="hr-input" type="text" maxlength="200" placeholder="/dashboard-demo" data-key="navigation_path" value="${hrEsc(c.navigation_path)}"/></div>`);
    }
    if (this._tab === 'aspetto') {
      body = '<div class="hr-heading">Aspetto Edera</div><div class="hr-desc">Stile, testi e tema della card. Etichetta e nome della pagina sono sempre visibili; il nome della card è facoltativo.</div>' +
        this._select('style', 'Stile', HR_STYLES.map(s => [s, HR_STYLE_LABEL[s]]), c.style) +
        this._select('density', 'Altezza', Object.entries(HR_DENSITIES), c.density) +
        this._select('arrow', 'Freccia', Object.entries(HR_ARROWS).map(([k, v]) => [k, v.label]), c.arrow) +
        this._input('label', 'Etichetta', c.label, 'Il testo piccolo in maiuscolo sopra il nome della pagina.') +
        this._input('title', 'Titolo personalizzato', c.title, 'Lascia vuoto per usare il nome della pagina corrente, con il punto verde finale.') +
        this._check('show_name', 'name', 'Mostra nome della card', c.show_name, 'Piccola intestazione in maiuscolo sopra la card, come nelle altre card. Disattivata di default.') +
        (c.show_name ? this._input('name', 'Nome della card', c.name) : '') +
        this._field('Icona', `<div data-host="icon"></div><div class="hr-fallback"><input class="hr-input" type="text" maxlength="80" placeholder="mdi:floor-plan" data-key="icon" value="${hrEsc(c.icon)}"/></div>`, 'Lascia vuoto per usare l’icona della dashboard.') +
        this._select('theme_mode', 'Tema', [['auto', 'Auto (Home Assistant)'], ['light', 'Light Edera'], ['dark', 'Dark Edera']], c.theme_mode);
    }
    if (this._tab === 'avanzate') {
      body = '<div class="hr-heading">Avanzate</div><div class="hr-desc">La card cambia soltanto pagina: non invia comandi a Home Assistant.</div>' +
        this._check('auto_page', 'auto', 'Leggi nome e icona della pagina', c.auto_page, 'Chiede a Home Assistant la configurazione della dashboard. Se non è leggibile, il nome deriva dall’indirizzo della pagina.') +
        this._input('navigation_path', 'Percorso manuale', c.navigation_path, 'Alternativa alla selezione guidata: deve iniziare con /.', '/dashboard-demo');
    }
    this.shadowRoot.innerHTML = `<style>${HR_EDITOR_CSS}</style><div class="hr-editor"><div class="hr-tabs">${tabs.map(([id, label]) => `<button type="button" class="hr-tab ${this._tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>${body}</div>`;
    this.shadowRoot.querySelector('.hr-editor').classList.toggle('hr-no-native', !customElements.get('ha-selector'));
    this._mountSelectors();
  }
  _mountSelectors() {
    if (!customElements.get('ha-selector')) return;
    const defs = { navigation_path: { navigation: {} }, icon: { icon: {} } };
    this.shadowRoot.querySelectorAll('[data-host]').forEach(slot => {
      const key = slot.dataset.host;
      const selector = document.createElement('ha-selector');
      selector.hass = this._hass; selector.selector = defs[key]; selector.value = this._config[key] || '';
      selector.addEventListener('value-changed', e => {
        e.stopPropagation();
        if (!selector.isConnected || !e.detail || !Object.prototype.hasOwnProperty.call(e.detail, 'value')) return;
        this._update({ [key]: e.detail.value });
      });
      slot.appendChild(selector);
    });
  }
  _click(event) {
    const t = event.target;
    const tab = t && t.closest ? t.closest('[data-tab]') : null;
    if (tab) { this._tab = tab.dataset.tab; this._render(); }
  }
  _change(event) {
    const el = event.target;
    const key = el && el.dataset ? el.dataset.key : '';
    if (!key || !(key in HR_DEFAULTS)) return;
    this._update({ [key]: el.type === 'checkbox' ? el.checked : el.value });
  }
}
if (typeof customElements !== 'undefined') {
  if (!customElements.get(HR_TAG)) customElements.define(HR_TAG, HomeReturnCard);
  if (!customElements.get(HR_EDITOR_TAG)) customElements.define(HR_EDITOR_TAG, HomeReturnCardEditor);
}
if (typeof window !== 'undefined') {
  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === HR_TAG)) window.customCards.push({ type: HR_TAG, name: 'Home Return Card', description: 'Riporta alla dashboard principale da ogni pagina, in stile Edera.', preview: true });
}
export { HomeReturnCard, HR_DENSITIES, HR_ARROWS, hrDashIcon, hrConfig, hrPath, hrIconName, hrSplitLocation, hrHumanize, hrFindView, hrPageInfo, hrLoadDashboard, hrEsc, HR_CACHE, HR_STYLES };
