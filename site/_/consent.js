// site/_/consent.js
// Cookie consent banner + conditional analytics loader.
// Preserved across iterations. Edit by hand (not via the Tuesday job).

(function () {
  'use strict';

  var STORAGE_KEY = 'jp_consent_v1';
  var GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';   // TODO: replace before going live
  var PLAUSIBLE_DOMAIN = 'jordanpitts.com';

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch (e) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function loadAnalytics() {
    // Plausible (privacy-friendly)
    var p = document.createElement('script');
    p.defer = true;
    p.setAttribute('data-domain', PLAUSIBLE_DOMAIN);
    p.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(p);

    // GA4
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_MEASUREMENT_ID;
    document.head.appendChild(g);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_MEASUREMENT_ID, { anonymize_ip: true });
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#jp-consent{position:fixed;left:1rem;right:1rem;bottom:1rem;max-width:480px;margin-left:auto;',
      'background:#111;color:#fafafa;padding:1rem 1.25rem;border-radius:12px;font-family:system-ui,sans-serif;',
      'font-size:14px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:2147483647}',
      '#jp-consent p{margin:0 0 .75rem 0}',
      '#jp-consent a{color:#9bd1ff;text-decoration:underline}',
      '#jp-consent .row{display:flex;gap:.5rem;flex-wrap:wrap}',
      '#jp-consent button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:.5rem .9rem}',
      '#jp-consent button.accept{background:#fafafa;color:#111}',
      '#jp-consent button.reject{background:transparent;color:#fafafa;border:1px solid #555}',
      '#jp-consent button:focus-visible{outline:2px solid #9bd1ff;outline-offset:2px}',
      '#jp-consent-manage{position:fixed;left:1rem;bottom:1rem;background:transparent;color:inherit;',
      'border:1px solid currentColor;border-radius:8px;padding:.25rem .5rem;font:12px system-ui,sans-serif;',
      'cursor:pointer;opacity:.5;z-index:2147483646}',
      '#jp-consent-manage:hover{opacity:1}',
    ].join('');
    document.head.appendChild(s);
  }

  function showBanner() {
    if (document.getElementById('jp-consent')) return;
    var el = document.createElement('div');
    el.id = 'jp-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML =
      '<p>This site uses analytics cookies (Google Analytics, Plausible) to understand which iterations resonate. No third-party advertising. Reject and the site works the same — we just see less.</p>' +
      '<div class="row">' +
      '  <button class="accept" type="button">Accept</button>' +
      '  <button class="reject" type="button">Reject</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('.accept').addEventListener('click', function () {
      setConsent('granted');
      el.remove();
      loadAnalytics();
      showManageButton();
    });
    el.querySelector('.reject').addEventListener('click', function () {
      setConsent('rejected');
      el.remove();
      showManageButton();
    });
  }

  function showManageButton() {
    if (document.getElementById('jp-consent-manage')) return;
    var b = document.createElement('button');
    b.id = 'jp-consent-manage';
    b.type = 'button';
    b.textContent = 'Cookies';
    b.addEventListener('click', function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      b.remove();
      showBanner();
    });
    document.body.appendChild(b);
  }

  function isDnt() {
    var dnt = navigator.doNotTrack || window.doNotTrack || (navigator).msDoNotTrack;
    return dnt === '1' || dnt === 'yes';
  }

  function init() {
    injectStyles();
    // Honour Do Not Track: never load analytics, never show a banner asking.
    if (isDnt()) {
      return;
    }
    var c = getConsent();
    if (c === 'granted') {
      loadAnalytics();
      showManageButton();
    } else if (c === 'rejected') {
      showManageButton();
    } else {
      showBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
