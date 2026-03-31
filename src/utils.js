/* ComponentViewer v3 — shared utilities, constants, and helpers.
 * Extracted from v2 monolith. All public API lives on CV.Utils. */
/* No I18N */
(function ($, window, document) {
  'use strict'; // No I18N

  /* --- bridge namespace --- */
  $.fn.componentViewer = $.fn.componentViewer || function () {};
  var CV = $.fn.componentViewer._cv = $.fn.componentViewer._cv || {};

  /* --- constants --- */

  var HTTP_PREFIX = ['http', '://'].join('');
  var HTTPS_PREFIX = ['https', '://'].join('');
  var JS_PROTO = ['javascript', ':'].join('');
  var VBS_PROTO = ['vbscript', ':'].join('');

  var PLUGIN_NAME = 'componentViewer'; // No I18N
  var jpCounter = 0;
  var SLIDESHOW_DEFAULT_INTERVAL = 4;

  function isNullish (x) {
    return x === null || x === undefined;
  }

  /* --- DEFAULT OPTIONS --- */

  /* No I18N */
  var DEFAULTS = {
    /** When set to a non-empty array of item objects, used as the items list instead of collecting from DOM (selector). Each item: { type, title, src, ... }. */
    items: null,
    selector: '.cv-item',
    loop: true,
    overlayClose: true,
    keyboardNav: true,
    showCounter: true,
    preloadAdjacentImages: true,
    /** When true, hide header/footer; only stage and prev/next. Close via Escape/backdrop. Object: { enabled, hideNavigation }. */
    stageOnly: { enabled: false, hideNavigation: false },
    /** Carousel: thumbnails below stage. { enabled, navThreshold } (default 4). */
    carousel: { enabled: false, navThreshold: 4 },
    /** Slideshow: auto-advance. { enabled, interval, autoStart, advanceMedia: 'interval'|'onEnd', showProgress, hideSlideshowButton }. */
    slideshow: null,
    theme: 'dark',
    themeToggle: true,
    onThemeChange: null,
    /** When true, show a header button to toggle overlay fullscreen (native Fullscreen API). Does not affect video/audio fullscreen. Default true. */
    fullscreen: true,

    /** When true, horizontal touch swipe on the stage (e.g. on mobile) goes to prev/next item. Does not affect keyboard or button nav; desktop uses prev/next buttons or arrows. Default true. */
    swipeNav: true,

    /** When true, downward touch swipe on the stage (e.g. on mobile) closes the overlay. Only applies when overlayClose is true. Desktop unchanged. Default true. */
    swipeToClose: true,

    /** When true, show custom tooltips on hover for header/footer/toolbar buttons. When false, no tooltips. Tooltip text comes from defaultStrings (I18N) or, for custom toolbar items, from label (if given). Default true. */
    canShowTooltip: true,
    /** When true, viewer UI is rendered in RTL mode (layout, nav keys/swipe, carousel direction). Default false. */
    isRTL: false,
    /** Minimize mode. When enabled, header button minimizes viewer into a floating restore icon. */
    minimize: { enabled: false },

    toolbar: {
      download: true,
      zoom: true,
      extractText: false,
      /** When true and resolveMarkdownToggleUrl is set, html items with a .md-like extension and iframe src get a toolbar toggle (View Source / View Markdown) that swaps iframe URL. */
      toggleSource: false
    },

    zoom: {
      min: 1,
      max: 5,
      step: 0.01,
      wheelStep: 0.15,
      showPercentage: false,
      onZoom: null,
      loadHighResUrlAt: false
    },

    pdf: {
      workerSrc: null,
      cMapUrl: null, // e.g. CDN URL for pdfjs cmaps (No I18N)
      cMapPacked: true,
      annotations: true,
      autoFit: true,
      autoFitMinScale: 0.75,
      autoFitMaxScale: 2.5,
      twoPageView: false,
      extractText: false
    },

    /** When true, markdown items get a toolbar button to toggle between rendered markdown and raw/source view. Default false. */
    markdown: { toggleRawView: false },

    /**
     * Inline (source code) view: optional syntax highlighting via Highlight.js.
     * - syntaxHighlight: when true, use window.hljs if present (host must include highlight.js script + a theme CSS). Built-in uses v9 API: highlight(lang, code, ignore_illegals).
     * - getLanguage: function(item) returning language string (e.g. 'javascript', 'java'). If null, inferred from item.fileExt / item.title.
     * - onInlineHtml: function(content, item, inst) returning HTML for .cv-inline-body. When set, overrides built-in (e.g. custom highlighter).
     */
    inline: { syntaxHighlight: false, getLanguage: null },
    onInlineHtml: null,

    /**
     * Video (built-in jPlayer path only; not used when jPlayer is missing and the native video fallback runs).
     * See documentation for canShowHDButton and beforeVideoPlay (gateContent matches beforeOpen).
     */
    video: { onGetHdUrl: null, canShowHDButton: null, beforeVideoPlay: null, autoplay: true },
    audio: { autoplay: true },
    /** Supported media formats (e.g. 'm4v', 'mp3'); per-item override via item.supplied. */
    supportedVideoFormats: null,
    supportedAudioFormats: null,

    toolbarItems: [],

    /** onDownload(item, viewer): called when the user clicks Download. viewer is the ComponentViewer instance. If null, default link download. */
    onDownload: null,
    itemData: null,

    /**
     * resolveUrl(item, viewer, urlType): called before loading a URL. urlType tells which URL is needed:
     *   'src' — main content URL (image, video, audio, pdf, inline, html, markdown). Fallback: item.src.
     *   'zoomUrl' — high-res image when user zooms. Fallback: item.zoomUrl || item.downloadUrl || item.src.
     *   'thumbnailUrl' — poster/thumbnail (e.g. video poster, carousel thumb). Fallback: item.thumbnailUrl.
     * Return the URL string to use; if null/empty, the fallback is used. So the user can resolve the correct URL per use.
     */
    resolveUrl: null,

    /**
     * resolveMarkdownToggleUrl(item, viewer, isSource): optional. Used with toolbar.toggleSource for type html + markdown file (see isHtmlMarkdownFileItem logic).
     * When the user toggles, the plugin sets iframe src to the returned URL. isSource is true when switching to raw/source view, false when switching back to rendered markdown.
     * Return a non-empty string URL; return null/empty to cancel the toggle (button state unchanged).
     */
    resolveMarkdownToggleUrl: null,

    /** Full override: onRender renders into $stage; return { toolbar, destroy }. */
    onRender: null,
    /** onToolbar(item, defaultToolbar, viewer): modify toolbar; not called when onRender provides toolbar. */
    onToolbar: null,

    onLoading: null,
    onOpen: null,
    /** Fires right after the current item's content is displayed (after transition if any). Similar to Colorbox onComplete. */
    onComplete: null,
    /** Fires at the start of the close process, before teardown. Similar to Colorbox onCleanup. */
    onCleanup: null,
    onClose: null,

    /** onError({ type, message, item, $stage }): return true to handle and skip default error card. */
    onError: null,

    /**
     * When true, enables WCAG-oriented behavior: focus trap (Tab loops inside overlay),
     * save/restore focus on open/close, initial focus on close button, and aria-hidden toggling.
     */
    wcag: true,

    /**
     * When true, the shortcuts popup can be opened with ? and shows context-aware keyboard shortcuts.
     * Set to false to disable the popup (and the ? key opening it).
     */
    shortcutsPopup: true,

    /**
     * Poll-option UI: when enabled, shows option label + checkbox/radio above the toolbar
     * for items that have pollOptionLabel. Title remains the image name.
     *   enabled: boolean
     *   mode: 'radio' | 'checkbox'
     *   onSelect: function(item, selected, viewer, element) — selected is true/false; element is the DOM node to which the item was bound (the .cv-item element from which itemData was built). To get the parent to which the viewer is bound: viewer.$container (jQuery) or viewer.$container[0] (DOM).
     */
    pollOption: null,

    /**
     * When true, enables attachment comment/description: item.comment (or data-comment) is shown
     * in a panel below the stage, with a header toggle button to show/hide it (LC-Lightbox style).
     * Default false.
     */
    showAttachmentComment: false,

    /**
     * Image extract-text (OCR overlay).
     * canShowExtractText(item, inst): return true to show the "Extract text" toolbar button for the current image.
     * extractText(item, inst, doneCallback, errorCallback): host performs OCR and calls doneCallback(resp) on success
     *   or errorCallback(message) on failure. resp shape: { data: { lines: [ [ { box, word }, ... ], ... ] } }
     *   While waiting, a circle loader is shown; on error the loader is removed and a strip message shows the given message.
     *   Overlay is removed when the user zooms; click "Extract text" again to re-fetch.
     */
    canShowExtractText: null,
    extractText: null,

    /**
     * beforeOpen(item, element, proceed): optional. If set, the overlay opens immediately with a circle loader (footer toolbar hidden) while your logic runs. Call proceed() or proceed({}) to load the item; call proceed({ gateContent: { html, onProceed? } }) to show gate HTML in the stage instead (toolbar stays hidden until the item loads). Same for open() / click / static $.componentViewer(...).componentViewer('open', 0). For items-only usage, element may be an empty jQuery set if item.$el is missing.
     *   proceed(openOptions): gateContent shows gated UI; otherwise openOptions become inst._openContext for resolveUrl etc.
     */
    beforeOpen: null,

    /**
     * beforeCollectItems(viewer[, proceed]): optional. Runs immediately before each rebuild of the items list (DOM scan or opts.items slice).
     * Synchronous: function (viewer) { ... } — collection runs right after the function returns.
     * Asynchronous: function (viewer, proceed) { ...; proceed(); } — you must call proceed() when ready (same pattern as beforeOpen).
     * Omit this option to keep the default behavior (collect with no prior hook).
     * While this hook runs, viewer._beforeCollectContext is set and cleared after collection:
     *   { trigger: 'init'|'click'|'open'|'next'|'prev'|'goTo'|'refresh', $element?, originalEvent?, openArg? }
     * For user clicks, trigger is 'click', $element is the matched attachment node (closest opts.selector to the click), originalEvent is the native click event (e.target may be a child).
     */
    beforeCollectItems: null
  };

  /* --- DEFAULT STRINGS (I18N) --- */
  /* No I18N */

  var DEFAULT_STRINGS = {
    close: 'Close',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    attachments: 'Attachments',
    showAttachments: 'Show attachments',
    scrollCarouselLeft: 'Scroll carousel left',
    scrollCarouselRight: 'Scroll carousel right',
    previousItem: 'Previous item',
    nextItem: 'Next item',
    zoomOut: 'Zoom out',
    zoomLevel: 'Zoom level',
    zoomIn: 'Zoom in',
    switchToLightMode: 'Switch to light mode',
    switchToDarkMode: 'Switch to dark mode',
    minimize: 'Minimize',
    restoreViewer: 'Restore viewer',
    playSlideshow: 'Play slideshow',
    pauseSlideshow: 'Pause slideshow',
    download: 'Download',
    downloadSource: 'Download source',
    invalidImageUrl: 'Invalid or unsafe image URL',
    imageLoadFailed: 'Image could not be loaded',
    play: 'Play',
    pause: 'Pause',
    playbackSpeed: 'Playback Speed',
    cyclePlaybackSpeed: 'Cycle playback speed',
    hd: 'HD',
    toggleHd: 'Toggle HD',
    mute: 'Mute',
    unmute: 'Unmute',
    thumbnails: 'Thumbnails',
    previousPage: 'Previous Page',
    nextPage: 'Next Page',
    rotate: 'Rotate',
    print: 'Print',
    extractText: 'Extract text',
    twoPageView: 'Two-page view',
    singlePageView: 'Single-page view',
    copy: 'Copy',
    copiedToClipboard: 'Copied to clipboard',
    viewSource: 'View source',
    viewMarkdown: 'View as Markdown',
    htmlMdToggleSource: 'View Source',
    htmlMdToggleMarkdown: 'View Markdown',
    pdf: 'PDF',
    previewNotAvailable: 'Preview is not available for this file',
    file: 'File',
    audio: 'Audio',
    couldNotLoadFileInline: 'Could not load file for inline view',
    noContentInline: 'No content or invalid URL for inline view',
    noHtmlProvided: 'No HTML provided for html view',
    typeVideo: 'Video',
    typeCode: 'Code',
    typeHtml: 'HTML',
    typeError: '—',
    carouselItemLabel: 'Item %1 of %2',
    playPause: 'Play / Pause',
    muteUnmute: 'Mute / Unmute',
    showShortcuts: 'Show shortcuts',
    keyboardShortcuts: 'Keyboard shortcuts',
    toggleTheme: 'Toggle theme',
    toggleSlideshow: 'Play / Pause slideshow',
    pollUpdated: 'Updated',
    toggleComment: 'Toggle comment',
    commentBy: 'by',
    commentPrev: 'Previous comment',
    commentNext: 'Next comment',
    commentCounter: 'Comment %1 of %2'
  };

  /**
   * Resolve a string by key from the registry (plugin defaultStrings or DEFAULT_STRINGS). Used for I18N.
   */
  function str (inst, key) {
    var reg = ($ && $.fn && $.fn[PLUGIN_NAME] && $.fn[PLUGIN_NAME].defaultStrings) || DEFAULT_STRINGS;
    var v = reg[key];
    return (!isNullish(v) && v !== '') ? String(v) : key;
  }

  /* --- ICONS --- */
  /* No I18N */

  var Icons = {
    close: '&times;',
    prev: '&#10094;',
    next: '&#10095;',
    zoomIn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    fileIcon: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    error: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>',
    rotateCw: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    prevPage: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
    nextPage: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
    thumbnails: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    extractText: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    twoPageView: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="9" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/></svg>',
    themeLight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    themeDark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    fullscreen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    fullscreenExit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>',
    minimize: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    restore: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="14" height="12" rx="2"/><path d="M10 5h9v9"/></svg>',
    play: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>',
    comment: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  };

  /* --- helper functions --- */

  function escHtml (s) {
    var str;
    if (isNullish(s) || s === '') {
      str = '';
    } else if (typeof s === 'string') {
      str = s;
    } else {
      str = String(s);
    }
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function safeDownloadFilename (s) {
    var str;
    if (isNullish(s) || s === '') {
      str = 'file';
    } else if (typeof s === 'string') {
      str = s;
    } else {
      str = String(s);
    }
    var controlAndBad = new RegExp('[<>:"/\\\\|?*]', 'g');
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 32 && code !== 127) {
        out += str.charAt(i);
      }
    }
    return out.replace(controlAndBad, '').trim() || 'file';
  }

  function isSafeResourceUrl (url) {
    if (isNullish(url) || typeof url !== 'string') {
      return false;
    }
    var u = url.trim();
    var lower = u.toLowerCase();
    if (lower.indexOf(JS_PROTO) === 0 || lower.indexOf(VBS_PROTO) === 0) {
      return false;
    }
    if (lower.indexOf(HTTP_PREFIX) === 0 || lower.indexOf(HTTPS_PREFIX) === 0 || lower.indexOf('blob:') === 0) {
      return true;
    }
    if (lower.indexOf('//') === 0) {
      return true;
    }
    if (lower.indexOf('data:') === 0) {
      var after = lower.slice(5).split(',')[0];
      var mime = after.split(';')[0].trim();
      if (mime.indexOf('image/') === 0 || mime.indexOf('video/') === 0 || mime.indexOf('audio/') === 0 || mime === 'application/pdf') {
        return true;
      }
      return false;
    }
    if (u.indexOf(':') < 0 || u.indexOf('/') === 0 || u.indexOf('./') === 0 || u.indexOf('../') === 0) {
      return true;
    }
    return false;
  }

  function isSafeDownloadUrl (url) {
    if (isNullish(url) || typeof url !== 'string') {
      return false;
    }
    var u = url.trim();
    var lower = u.toLowerCase();
    if (lower.indexOf(JS_PROTO) === 0 || lower.indexOf(VBS_PROTO) === 0 || lower.indexOf('data:') === 0) {
      return false;
    }
    if (lower.indexOf(HTTP_PREFIX) === 0 || lower.indexOf(HTTPS_PREFIX) === 0 || lower.indexOf('blob:') === 0) {
      return true;
    }
    if (lower.indexOf('//') === 0) {
      return true;
    }
    if (u.indexOf(':') < 0 || u.indexOf('/') === 0 || u.indexOf('./') === 0 || u.indexOf('../') === 0) {
      return true;
    }
    return false;
  }

  function getItemDownloadUrl (item, inst) {
    if (!item) {
      return null;
    }
    var url = item.downloadUrl || item.download;
    if (url && isSafeDownloadUrl(url)) {
      return url;
    }
    if (inst) {
      url = getResolvedUrl(item, inst, 'src');
      if (url && isSafeDownloadUrl(url)) {
        return url;
      }
    }
    url = item.src;
    return (url && isSafeDownloadUrl(url)) ? url : null;
  }

  function getResolvedUrl (item, inst, urlType) {
    if (!item) {
      return null;
    }
    if (inst && typeof inst.opts.resolveUrl === 'function') {
      var resolved = inst.opts.resolveUrl(item, inst, urlType);
      if (resolved != null && resolved !== '') {
        return resolved;
      }
    }
    if (urlType === 'zoomUrl') {
      return (item.zoomUrl && item.zoomUrl !== '') ? item.zoomUrl : (item.downloadUrl || item.src || null);
    }
    if (urlType === 'thumbnailUrl') {
      return item.thumbnailUrl || null;
    }
    return item.src || null;
  }

  function getResolvedSrcUrl (item, inst) {
    return getResolvedUrl(item, inst, 'src');
  }

  function performDownload (item, inst) {
    if (inst && typeof inst.opts.onDownload === 'function') {
      inst.opts.onDownload(item, inst);
      return;
    }
    var url = getItemDownloadUrl(item, inst);
    if (!url) {
      return;
    }
    var a = document.createElement('a');
    a.href = url;
    a.download = safeDownloadFilename(item.title);
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function copyTextToClipboard (text, inst) {
    function showCopied () {
      if (inst && CV.Overlay && CV.Overlay.$stripMessage && CV.Overlay.$stripMessage.length) {
        CV.Overlay._showStripMessage(str(inst, 'copiedToClipboard'));
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(showCopied).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          if (document.execCommand('copy')) {
            showCopied();
          }
        } catch (e) {}
        document.body.removeChild(ta);
      });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) {
        showCopied();
      }
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function getFullscreenElement () {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
  }

  var RESERVED_SHORTCUT_KEYS = { escape: 1, arrowleft: 1, arrowright: 1, ' ': 1, m: 1, r: 1, q: 1, d: 1, p: 1, '?': 1, '+': 1, '-': 1, '=': 1, f: 1, t: 1, c: 1, s: 1, n: 1 };

  function sanitizeIconHtml (html) {
    if (isNullish(html) || typeof html !== 'string') {
      return '';
    }
    var div = document.createElement('div');
    div.innerHTML = html;
    var scripts = div.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      scripts[i].remove();
    }
    var all = div.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var attrs = [];
      for (var k = 0; k < el.attributes.length; k++) {
        attrs.push(el.attributes[k].name);
      }
      (function (element, attrList) {
        attrList.forEach(function (name) {
          if (name.toLowerCase().indexOf('on') === 0) {
            element.removeAttribute(name);
          } else if ((name === 'href' || name === 'xlink:href') && element.getAttribute(name)) {
            var val = (element.getAttribute(name) || '').trim().toLowerCase();
            if (val.indexOf(JS_PROTO) === 0 || val.indexOf(VBS_PROTO) === 0) {
              element.setAttribute(name, '#');
            }
          }
        });
      }(el, attrs));
    }
    return div.innerHTML;
  }

  function getMediaSupplied (item, inst) {
    if (item.supplied) {
      return String(item.supplied).split(',')[0].trim();
    }
    var type = item.type || 'video';
    var ext = (item.fileExt || (item.src || '').split('.').pop() || '').toLowerCase();
    var map = {
      mp4: 'm4v', m4v: 'm4v', webm: 'webmv', ogv: 'ogv', flv: 'flv',
      mp3: 'mp3', m4a: 'm4a', ogg: 'oga', oga: 'oga', wav: 'wav', fla: 'fla'
    };
    var fromExt = map[ext] || (type === 'video' ? 'm4v' : 'mp3');
    if (inst) {
      var listStr = type === 'video' ? inst.opts.supportedVideoFormats : inst.opts.supportedAudioFormats;
      if (listStr) {
        var list = listStr.split(',').map(function (s) {
          return s.trim();
        }).filter(Boolean);
        if (list.length) {
          return list.indexOf(fromExt) >= 0 ? fromExt : list[0];
        }
      }
    }
    return fromExt;
  }

  function isImageLikeExtension (item) {
    var ext = (item.fileExt || (item.src || '').split('.').pop() || (item.title || '').split('.').pop() || '').toLowerCase();
    return (/^(png|jpe?g|gif|webp|bmp|ico|svg)$/).test(ext);
  }

  function isRtlEnabled (inst) {
    return Boolean(inst && inst.opts && inst.opts.isRTL === true);
  }

  function buildOverlayClassName (theme, visible, closing, inst) {
    var cls = 'cv-overlay cv-theme-' + theme;
    if (isRtlEnabled(inst)) {
      cls += ' cv-rtl';
    }
    if (visible) {
      cls += ' cv-visible';
    }
    if (closing) {
      cls += ' cv-closing';
    }
    return cls;
  }

  function setToolbarBtnPresentation ($btn, inst, opts) {
    if (!$btn || !$btn.length || !inst || !inst.opts || !opts) {
      return;
    }
    var labelText = (opts.label !== undefined && opts.label !== null) ? String(opts.label) : '';
    var tipText = (opts.tooltip !== undefined && opts.tooltip !== null) ? String(opts.tooltip) : labelText;
    var ariaText = tipText || labelText;
    if (!labelText && !tipText) {
      return;
    }
    var $lbl = $btn.find('.cv-tb-label');
    if ($lbl.length && labelText !== '') {
      $lbl.text(labelText);
    }
    if (inst.opts.canShowTooltip !== false && tipText !== '') {
      $btn.attr('data-cv-tooltip', tipText);
    }
    if (inst.opts.wcag && ariaText !== '') {
      $btn.attr('aria-label', ariaText);
    }
  }

  /* --- expose on CV.Utils --- */

  CV.Utils = {
    HTTP_PREFIX: HTTP_PREFIX,
    HTTPS_PREFIX: HTTPS_PREFIX,
    JS_PROTO: JS_PROTO,
    VBS_PROTO: VBS_PROTO,
    PLUGIN_NAME: PLUGIN_NAME,
    SLIDESHOW_DEFAULT_INTERVAL: SLIDESHOW_DEFAULT_INTERVAL,

    isNullish: isNullish,
    DEFAULTS: DEFAULTS,
    DEFAULT_STRINGS: DEFAULT_STRINGS,
    str: str,
    Icons: Icons,

    escHtml: escHtml,
    safeDownloadFilename: safeDownloadFilename,
    isSafeResourceUrl: isSafeResourceUrl,
    isSafeDownloadUrl: isSafeDownloadUrl,
    getItemDownloadUrl: getItemDownloadUrl,
    getResolvedUrl: getResolvedUrl,
    getResolvedSrcUrl: getResolvedSrcUrl,
    performDownload: performDownload,
    copyTextToClipboard: copyTextToClipboard,
    getFullscreenElement: getFullscreenElement,

    RESERVED_SHORTCUT_KEYS: RESERVED_SHORTCUT_KEYS,
    sanitizeIconHtml: sanitizeIconHtml,
    getMediaSupplied: getMediaSupplied,
    isImageLikeExtension: isImageLikeExtension,
    isRtlEnabled: isRtlEnabled,
    buildOverlayClassName: buildOverlayClassName,
    setToolbarBtnPresentation: setToolbarBtnPresentation,

    get jpCounter () { return jpCounter; },
    set jpCounter (v) { jpCounter = v; }
  };

  /* --- top-level shortcuts --- */

  CV.DEFAULTS = CV.Utils.DEFAULTS;
  CV.DEFAULT_STRINGS = CV.Utils.DEFAULT_STRINGS;
  CV.Icons = CV.Utils.Icons;

}(jQuery, window, document));
