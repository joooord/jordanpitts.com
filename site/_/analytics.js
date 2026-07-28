/* jordanpitts.com — analytics loader
 *
 * Cookieless by design. This replaced a GA4 + consent-banner setup: because
 * Plausible sets no cookies and stores no personal data, no consent banner is
 * required, which removes the banner from every iteration and a whole class of
 * blocking config from the launch.
 *
 * Rules this file honours:
 *   - No cookies, no localStorage, no fingerprinting, no cross-site identifiers.
 *   - Do Not Track and Global Privacy Control are respected: no script is loaded.
 *   - Nothing loads from any domain outside the approved analytics stack.
 *
 * Reserved infrastructure: lives under site/_/ and is preserved across
 * iterations. The generator may not write here — see rules.md.
 */
(function () {
  'use strict';

  var DOMAIN = 'jordanpitts.com';
  var SRC = 'https://plausible.io/js/script.js';

  function optedOut() {
    try {
      var nav = window.navigator || {};
      if (nav.doNotTrack === '1' || nav.doNotTrack === 'yes') return true;
      if (window.doNotTrack === '1') return true;
      if (nav.msDoNotTrack === '1') return true;
      if (nav.globalPrivacyControl === true) return true;
    } catch (e) {
      // If we cannot tell, assume opted out. Erring toward not measuring is the
      // right default for a project with nothing to sell.
      return true;
    }
    return false;
  }

  // Never phone home from a local or preview context — it pollutes the numbers
  // the evaluation loop reads.
  function isProduction() {
    return window.location.hostname === DOMAIN || window.location.hostname === 'www.' + DOMAIN;
  }

  if (optedOut() || !isProduction()) return;

  var s = document.createElement('script');
  s.defer = true;
  s.setAttribute('data-domain', DOMAIN);
  s.src = SRC;
  document.head.appendChild(s);
})();
