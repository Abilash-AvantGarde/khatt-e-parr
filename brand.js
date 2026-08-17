// ─── Khatt-e-Parr — shared branding & copy ───────────────────────────────────
//
// THE one place to change the app's name and its user-facing wording.
//
// Loaded as a plain <script> before the app (no modules, no build step), so it
// works over file:// as well as http://. It attaches window.BRAND, and the app
// reads from it with safe fallbacks — if this file is ever missing, the app
// still runs on the defaults baked into the logic.
//
// NOTE ON THE COMPILED BUILD: index.html is a self-contained artifact and
// cannot load an external file. The same constants are inlined near the top of
// its logic script; if you change something here, mirror it there.
(function (root) {
  'use strict';

  // The app's name. Changing this updates the sender's header wordmark, the
  // browser tab, and the PRODID stamped into date.ics.
  //
  // Alternative dateish names, kept for easy swapping:
  //   'A Night Free'      — closest to the original, warm
  //   'One Good Night'    — more confident, romantic
  //   'Pick a Night'      — plainest, most functional
  //   'Something Arrived' — echoes the receiver's own copy
  var APP_NAME = 'Khatt-e-Parr';

  // Shown in the browser tab.
  //
  // Worth knowing: the receiver reads this tab BEFORE she opens anything — in
  // her tab bar, over her shoulder, in her history. Pointing it at a neutral
  // string such as 'A khat for you' keeps the wax-seal reveal intact. It
  // currently mirrors APP_NAME for consistent branding.
  var APP_TAB_TITLE = APP_NAME;

  // "khat" (خط) — a letter, in the old sense: something written, sealed, carried
  // and handed over. The receiver's copy leans on it so the envelope, the wax
  // seal and the wording all tell the same story.
  var COPY = {
    // Receiver — the sealed envelope, before she opens it.
    // `name` may be empty; each is a function so the no-name case stays natural.
    teaseHead: function (name) {
      return name ? name + ', a khat came for you.' : 'A khat came for you.';
    },
    teaseSub: function (count) {
      if (!count) return "sealed, and he's sweating.";
      return count + (count === 1 ? ' idea' : ' ideas') + " sealed inside. he's sweating.";
    },
    teaseCta: 'break the seal →',

    // Receiver — after she answers.
    sentHead: "It's a date.",
    sentSub: 'he’s going to reread this eleven times.',
    replyNudge: 'one last thing — send this khat back so he knows',

    // Footers.
    senderFoot: 'Live OpenStreetMap places. Nothing is stored anywhere — the khat and her reply both travel inside their links.',
    receiverFoot: 'Answer here, then send his khat back. Nothing is stored on any server.'
  };

  root.BRAND = { APP_NAME: APP_NAME, APP_TAB_TITLE: APP_TAB_TITLE, COPY: COPY };
})(typeof window !== 'undefined' ? window : globalThis);
