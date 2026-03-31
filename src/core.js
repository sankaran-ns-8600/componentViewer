/* ComponentViewer v3 — core module.
 * Overlay singleton (shared DOM, lifecycle, events, toolbar, keyboard, theme, fullscreen, navigation),
 * ComponentViewer class, and jQuery plugin bridge.
 * Renderers and optional features are loaded separately and registered via CV.registerRenderer / CV.registerFeature. */
/* No I18N */
(function ($, window, document) {
  'use strict'; // No I18N

  var CV = $.fn.componentViewer._cv;
  var U = CV.Utils;

  /* --- local aliases for brevity (mirrors v2 function names) --- */

  var isNullish = U.isNullish;
  var str = U.str;
  var Icons = U.Icons;
  var DEFAULTS = U.DEFAULTS;
  var DEFAULT_STRINGS = U.DEFAULT_STRINGS;
  var PLUGIN_NAME = U.PLUGIN_NAME;
  var SLIDESHOW_DEFAULT_INTERVAL = U.SLIDESHOW_DEFAULT_INTERVAL;
  var escHtml = U.escHtml;
  var safeDownloadFilename = U.safeDownloadFilename;
  var isSafeResourceUrl = U.isSafeResourceUrl;
  var isSafeDownloadUrl = U.isSafeDownloadUrl;
  var getItemDownloadUrl = U.getItemDownloadUrl;
  var getResolvedUrl = U.getResolvedUrl;
  var getResolvedSrcUrl = U.getResolvedSrcUrl;
  var performDownload = U.performDownload;
  var copyTextToClipboard = U.copyTextToClipboard;
  var getFullscreenElement = U.getFullscreenElement;
  var sanitizeIconHtml = U.sanitizeIconHtml;
  var isImageLikeExtension = U.isImageLikeExtension;
  var isRtlEnabled = U.isRtlEnabled;
  var buildOverlayClassName = U.buildOverlayClassName;
  var setToolbarBtnPresentation = U.setToolbarBtnPresentation;
  var RESERVED_SHORTCUT_KEYS = U.RESERVED_SHORTCUT_KEYS;

  /* --- local core helpers --- */

  function removeExtractOverlay ($stage) {
    $stage.find('.cv-extract-overlay').remove();
  }

  function syncCvImgTransformDimensions (imgEl) {
    if (!imgEl) {
      return;
    }
    var $img = $(imgEl);
    var $t = $img.closest('.cv-img-transform');
    if (!$t.length) {
      return;
    }
    var wrap = $t.parent()[0];
    var nw = imgEl.naturalWidth;
    var nh = imgEl.naturalHeight;
    var sw = wrap ? wrap.clientWidth : 0;
    var sh = wrap ? wrap.clientHeight : 0;
    if (!wrap || !nw || !nh || !sw || !sh) {
      return;
    }
    var fitScale = Math.min(sw / nw, sh / nh);
    var cw = Math.round(nw * fitScale);
    var ch = Math.round(nh * fitScale);
    if (cw < 1 || ch < 1) {
      return;
    }
    $t.css({ width: cw + 'px', height: ch + 'px' });
  }

  function _checkIsGifItem () {
    return typeof Overlay._isGifItem === 'function' ? Overlay._isGifItem() : false;
  }

  /* --- error / unsupported helpers --- */

  function getErrorMessage (item) {
    var m;
    if (!isNullish(item.message) && item.message !== '') {
      m = item.message;
    } else if (!isNullish(item.errorMessage) && item.errorMessage !== '') {
      m = item.errorMessage;
    } else {
      m = null;
    }
    return (m !== null && m !== undefined) ? String(m) : 'Preview is not available for this file';
  }

  function buildUnsupportedCard (item, message, $stage) {
    var ext = (item.fileExt || (item.title || '').split('.').pop() || '').toUpperCase();
    var size = item.fileSize || '';
    var showDl = Boolean(getItemDownloadUrl(item, Overlay.activeInstance));
    var $card = $(
      '<div class="cv-unsupported">' +
        '<div class="cv-unsupported-icon">' + Icons.fileIcon + '</div>' +
        (ext ? '<div class="cv-unsupported-ext">' + escHtml(ext) + '</div>' : '') +
        '<div class="cv-unsupported-name">' + escHtml(item.title || 'File') + '</div>' +
        (size ? '<div class="cv-unsupported-size">' + escHtml(size) + '</div>' : '') +
        '<p class="cv-unsupported-msg">' + escHtml(message) + '</p>' +
        (showDl ? '<button class="cv-unsupported-dl" type="button">' + Icons.download + ' Download</button>' : '') +
      '</div>'
    );
    if (showDl) {
      $card.find('.cv-unsupported-dl').on('click', function () {
        performDownload(item, Overlay.activeInstance);
      });
    }
    $stage.append($card);
  }

  function builtInUnsupportedRenderer (item, $stage) {
    buildUnsupportedCard(item, 'Preview is not available for this file', $stage);
  }

  function builtInErrorRenderer (item, $stage) {
    buildUnsupportedCard(item, getErrorMessage(item), $stage);
    return {};
  }

  function showError ($stage, type, message, item, options) {
    options = options || {};
    var inst = Overlay.activeInstance;
    if (inst && typeof inst.opts.onError === 'function') {
      var handled = inst.opts.onError({ type: type, message: message, item: item, $stage: $stage });
      if (handled === true) {
        return;
      }
    }
    builtInErrorCard($stage, message, item, options);
  }

  function builtInErrorCard ($stage, message, item, options) {
    options = options || {};
    var showDl = !options.noDownload && getItemDownloadUrl(item, Overlay.activeInstance);
    var $card = $(
      '<div class="cv-error-card">' + Icons.error +
        '<p class="cv-error-text">' + escHtml(message) + '</p>' +
        (showDl ? '<button class="cv-error-dl" type="button">' + Icons.download + ' Download source</button>' : '') +
      '</div>'
    );
    if (showDl) {
      $card.find('.cv-error-dl').on('click', function () {
        performDownload(item, Overlay.activeInstance);
      });
    }
    $stage.append($card);
  }

  /* --- expose error helpers on CV.Utils for renderers --- */
  U.showError = showError;
  U.builtInErrorCard = builtInErrorCard;
  U.getErrorMessage = getErrorMessage;
  U.buildUnsupportedCard = buildUnsupportedCard;
  U.syncCvImgTransformDimensions = syncCvImgTransformDimensions;
  U.removeExtractOverlay = removeExtractOverlay;

  /* --- SHARED OVERLAY --- */

  var Overlay = {
    built: false, visible: false, activeInstance: null,
    _bodyOverflow: null,
    _keydownCaptureBound: false,
    _keydownCaptureHandler: null,
    $el: null, $shell: null, $title: null, $counter: null,
    $stageWrap: null, $stage: null, $loader: null,
    $prev: null, $next: null, $footer: null,
    $pollOption: null, $footerRow: null,
    $toolbar: null, $zoomWidget: null, $zoomSlider: null, $zoomPct: null,

    _zoom: 1, _panX: 0, _panY: 0,
    _isPanning: false, _panOriginX: 0, _panOriginY: 0, _panStartX: 0, _panStartY: 0,
    _pinchStartDist: 0, _pinchStartZoom: 1,
    _pinchMidX: 0, _pinchMidY: 0, _pinchPanStartX: 0, _pinchPanStartY: 0,
    _pinchMidStartX: 0, _pinchMidStartY: 0,
    _justEndedPinch: false,
    _highResLoaded: false, _highResLoading: false, _highResSliderDebounceTimer: null,
    _isImageItem: false, _isPdfItem: false, _isCustomRendered: false,
    _swipeStartX: 0, _swipeStartY: 0, _swipeEndX: 0, _swipeEndY: 0, _swipeTracking: false,
    _minimized: false, _minimizedSnapshot: null,

    ensure: function () {
      if (this.built) {
        return;
      }
      var toolbarIconStyle = '<style id="cv-toolbar-icon-style">' +
        '.cv-overlay .cv-toolbar .cv-tb-btn .cv-tb-icon,.cv-overlay .cv-toolbar .cv-tb-btn .cv-tb-icon::before,' +
        '.cv-overlay .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil,.cv-overlay .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil::before' +
        '{color:rgba(255,255,255,.95)!important;opacity:1!important}' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn .cv-tb-icon,.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn .cv-tb-icon::before,' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil,.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil::before' +
        '{color:#444!important;opacity:1!important}' +
        '.cv-overlay .cv-toolbar .cv-tb-btn{background:rgba(255,255,255,.08)!important;border:none!important;border-radius:6px!important;padding:6px 10px!important;min-width:32px!important;min-height:32px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}' +
        '.cv-overlay .cv-toolbar .cv-tb-btn:hover{background:rgba(255,255,255,.2)!important}' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn{background:rgba(0,0,0,.06)!important;color:#444!important}' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn:hover{background:rgba(0,0,0,.12)!important}' +
        '</style>';
      var html =
        '<div class="cv-overlay">' +
          toolbarIconStyle +
          '<div class="cv-backdrop" aria-hidden="true"></div>' +
          '<div class="cv-shell" id="cv-dialog">' +
            '<div class="cv-header">' +
              '<div class="cv-header-left"><span class="cv-counter" id="cv-dialog-desc"></span></div>' +
              '<div class="cv-header-center"><span class="cv-title" id="cv-dialog-title"></span></div>' +
              '<div class="cv-header-right">' +
              '<button class="cv-comment-toggle" type="button" style="display:none">' + Icons.comment + '</button>' +
              '<button class="cv-carousel-toggle" type="button" style="display:none">' + Icons.thumbnails + '</button>' +
              '<button class="cv-fullscreen-toggle" type="button" style="display:none">' + Icons.fullscreen + '</button>' +
              '<button class="cv-minimize-toggle" type="button" style="display:none">' + Icons.minimize + '</button>' +
              '<button class="cv-theme-toggle" type="button">' + Icons.themeLight + '</button>' +
              '<button class="cv-close" type="button">' + Icons.close + '</button></div>' +
            '</div>' +
            '<div class="cv-body">' +
              '<button class="cv-nav cv-nav-prev" type="button"><span class="cv-nav-icon">' + Icons.prev + '</span></button>' +
              '<div class="cv-stage-wrap">' +
                '<div class="cv-loader"><div class="cv-spinner"></div></div>' +
                '<div class="cv-stage"></div>' +
                '<div class="cv-comment-wrap" aria-hidden="true" role="region" aria-label="Attachment comment">' +
                  '<div class="cv-comment-nav" style="display:none">' +
                    '<button class="cv-comment-prev" type="button" aria-label="Previous comment">' + Icons.prev + '</button>' +
                    '<span class="cv-comment-counter" aria-live="polite"></span>' +
                    '<button class="cv-comment-next" type="button" aria-label="Next comment">' + Icons.next + '</button>' +
              '</div>' +
                  '<div class="cv-comment-title"></div>' +
                  '<div class="cv-comment-author"></div>' +
                  '<div class="cv-comment-sep"></div>' +
                  '<div class="cv-comment-inner"></div>' +
                '</div>' +
              '</div>' +
              '<button class="cv-nav cv-nav-next" type="button"><span class="cv-nav-icon">' + Icons.next + '</span></button>' +
            '</div>' +
            '<div class="cv-carousel-wrap">' +
              '<button class="cv-carousel-nav cv-carousel-prev" type="button">' + Icons.prev + '</button>' +
              '<div class="cv-carousel-inner">' +
                '<div class="cv-carousel"></div>' +
              '</div>' +
              '<button class="cv-carousel-nav cv-carousel-next" type="button">' + Icons.next + '</button>' +
            '</div>' +
            '<div class="cv-footer">' +
              '<div class="cv-slideshow-progress-wrap"><div class="cv-slideshow-progress-bar"></div></div>' +
              '<div class="cv-poll-option"></div>' +
              '<div class="cv-footer-row">' +
              '<div class="cv-toolbar"></div>' +
              '<div class="cv-zoom-widget">' +
                '<button class="cv-tb-btn cv-zoom-out-btn" type="button">' + Icons.zoomOut + '</button>' +
                '<input type="range" class="cv-zoom-slider" min="1" max="5" step="0.01" value="1" />' +
                '<button class="cv-tb-btn cv-zoom-in-btn" type="button">' + Icons.zoomIn + '</button>' +
                '<span class="cv-zoom-pct">100%</span>' +
              '</div>' +
              '</div>' +
            '</div>' +
            '<div class="cv-shortcuts-popup" role="dialog" aria-label="Keyboard shortcuts" aria-hidden="true"></div>' +
            '<div class="cv-strip-message" id="cv-strip-message" aria-live="polite" role="status"></div>' +
          '</div>' +
          '<button class="cv-restore-fab" type="button" style="display:none">' + Icons.restore + '</button>' +
        '</div>';

      $('body').append(html);
      this.$el = $('.cv-overlay').last();
      var sel = { $backdrop: '.cv-backdrop', $shell: '.cv-shell', $title: '.cv-title', $counter: '.cv-counter', $themeToggle: '.cv-theme-toggle', $fullscreenToggle: '.cv-fullscreen-toggle', $minimizeToggle: '.cv-minimize-toggle', $restoreFab: '.cv-restore-fab', $stageWrap: '.cv-stage-wrap', $stage: '.cv-stage', $commentWrap: '.cv-comment-wrap', $commentNav: '.cv-comment-nav', $commentPrev: '.cv-comment-prev', $commentNext: '.cv-comment-next', $commentCounter: '.cv-comment-counter', $commentTitle: '.cv-comment-title', $commentAuthor: '.cv-comment-author', $commentSep: '.cv-comment-sep', $commentInner: '.cv-comment-inner', $commentToggle: '.cv-comment-toggle', $loader: '.cv-loader', $prev: '.cv-nav-prev', $next: '.cv-nav-next', $carouselWrap: '.cv-carousel-wrap', $carousel: '.cv-carousel', $carouselToggle: '.cv-carousel-toggle', $carouselPrev: '.cv-carousel-prev', $carouselNext: '.cv-carousel-next', $footer: '.cv-footer', $pollOption: '.cv-poll-option', $footerRow: '.cv-footer-row', $toolbar: '.cv-toolbar', $stripMessage: '.cv-strip-message', $zoomWidget: '.cv-zoom-widget', $zoomSlider: '.cv-zoom-slider', $zoomPct: '.cv-zoom-pct', $slideshowProgressWrap: '.cv-slideshow-progress-wrap', $slideshowProgressBar: '.cv-slideshow-progress-bar', $shortcutsPopup: '.cv-shortcuts-popup' };
      for (var p in sel) {
        this[p] = sel[p].charAt(0) === '#' ? $(sel[p]) : this.$el.find(sel[p]);
      }
      this.$tooltip = $();
      this.$zoomPct.hide();
      this._bindEvents();
      this._bindTooltip();
      this.built = true;

      /* v3: initialize all registered features */
      var featureNames = Object.keys(CV.features);
      for (var f = 0; f < featureNames.length; f++) {
        CV.features[featureNames[f]](Overlay, U);
      }
    },

    _isRtl: function (inst) {
      var ctx = inst || this.activeInstance;
      return isRtlEnabled(ctx);
    },

    _canMinimize: function (inst) {
      var cfg = inst && inst.opts && inst.opts.minimize;
      return Boolean(cfg && cfg.enabled !== false);
    },
    _captureMinimizedSnapshot: function (inst) {
      if (!inst || !inst.items || inst.idx < 0 || inst.idx >= inst.items.length) {
        this._minimizedSnapshot = null;
        return;
      }
      var listSnapshot = [];
      for (var i = 0; i < inst.items.length; i++) {
        var cloned = $.extend(true, {}, inst.items[i]);
        if (cloned.$el) {
          delete cloned.$el;
        }
        listSnapshot.push(cloned);
      }
      var current = inst.items[inst.idx];
      var snapItem = $.extend(true, {}, current);
      if (snapItem.$el) {
        delete snapItem.$el;
      }
      this._minimizedSnapshot = {
        items: listSnapshot,
        item: snapItem,
        $el: current && current.$el ? current.$el : null,
        idx: inst.idx
      };
    },
    _applyMinimizedUi: function (inst, minimized) {
      this._minimized = Boolean(minimized);
      this.$el.toggleClass('cv-minimized', this._minimized);
      this.$restoreFab.toggle(this._minimized);
      if (this.visible) {
        if (this._minimized) {
          document.body.style.overflow = !isNullish(this._bodyOverflow) ? this._bodyOverflow : '';
        } else {
          document.body.style.overflow = 'hidden';
        }
      }
      if (!inst) {
        return;
      }
      if (inst.opts.canShowTooltip !== false) {
        this.$minimizeToggle.attr('data-cv-tooltip', str(inst, 'minimize'));
        this.$restoreFab.attr('data-cv-tooltip', str(inst, 'restoreViewer'));
      } else {
        this.$minimizeToggle.removeAttr('data-cv-tooltip');
        this.$restoreFab.removeAttr('data-cv-tooltip');
      }
      if (inst.opts.wcag) {
        this.$minimizeToggle.attr('aria-label', str(inst, 'minimize'));
        this.$restoreFab.attr('aria-label', str(inst, 'restoreViewer'));
      } else {
        this.$minimizeToggle.removeAttr('aria-label');
        this.$restoreFab.removeAttr('aria-label');
      }
    },
    _restoreFromMinimized: function () {
      var self = this;
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      this._applyMinimizedUi(inst, false);
      var snap = this._minimizedSnapshot;
      inst._beforeCollectContext = { trigger: 'restore' };
      inst._collectItems(function () {
        if (!inst.items.length && snap && snap.items && snap.items.length) {
          inst.items = $.extend(true, [], snap.items);
          inst.idx = Math.max(0, Math.min((!isNullish(snap.idx) ? snap.idx : 0), inst.items.length - 1));
          self.loadItem();
          return;
        }
        if (!inst.items.length) {
          return;
        }
        var restoreIdx = Math.max(0, Math.min(inst.idx, inst.items.length - 1));
        if (snap && snap.$el && snap.$el.length) {
          for (var i = 0; i < inst.items.length; i++) {
            if (inst.items[i].$el && inst.items[i].$el[0] === snap.$el[0]) {
              restoreIdx = i;
              break;
            }
          }
          if (snap.$el[0] && (!$.contains(document, snap.$el[0]) || !snap.$el.is(':visible')) && snap.items && snap.items.length) {
            inst.items = $.extend(true, [], snap.items);
            inst.idx = Math.max(0, Math.min((!isNullish(snap.idx) ? snap.idx : 0), inst.items.length - 1));
            self.loadItem();
            return;
          }
        }
        inst.idx = restoreIdx;
        self.loadItem();
      });
    },

    _bindKeydownCaptureOnce: function () {
      if (this._keydownCaptureBound) {
        return;
      }
      this._keydownCaptureBound = true;
      var self = this;
      var handler = function (e) {
        if (self._handleKeydown(e)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      };
      this._keydownCaptureHandler = handler;
      document.addEventListener('keydown', handler, true);
    },

    _seekFocusedMediaBy: function (deltaSeconds, eventTarget) {
      var activeEl = document.activeElement;
      var target = null;
      if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
        target = activeEl;
      } else {
        target = eventTarget || activeEl;
      }
      if (!target) {
        return false;
      }
      var $wrap = $(target).closest('.cv-video-wrap, .cv-audio-wrap');
      if (!$wrap.length) {
        return false;
      }
      var mediaEl = $wrap.find('video, audio')[0];
      if (mediaEl && typeof mediaEl.currentTime === 'number') {
        var duration = (typeof mediaEl.duration === 'number' && isFinite(mediaEl.duration)) ? mediaEl.duration : null;
        var nextTime = mediaEl.currentTime + deltaSeconds;
        if (duration !== null) {
          nextTime = Math.min(duration, Math.max(0, nextTime));
        } else {
          nextTime = Math.max(0, nextTime);
        }
        mediaEl.currentTime = nextTime;
        return true;
      }
      var $jp = $wrap.find('.cv-jp-player').first();
      if ($jp.length && typeof $jp.jPlayer === 'function') {
        var jpData = $jp.data('jPlayer');
        var status = (jpData && jpData.status) ? jpData.status : {};
        var current = (typeof status.currentTime === 'number') ? status.currentTime : 0;
        var maxDuration = (typeof status.duration === 'number' && isFinite(status.duration)) ? status.duration : null;
        var targetTime = current + deltaSeconds;
        if (maxDuration !== null) {
          targetTime = Math.min(maxDuration, Math.max(0, targetTime));
        } else {
          targetTime = Math.max(0, targetTime);
        }
        var isPaused = (status.paused !== undefined) ? status.paused : true;
        if (isPaused) {
          $jp.jPlayer('pause', targetTime);
        } else {
          $jp.jPlayer('play', targetTime);
        }
        return true;
      }
      return false;
    },

    _handleKeydown: function (e) {
      if (!this.visible || !this.activeInstance) {
        return false;
      }
      if (!this.activeInstance.opts.keyboardNav) {
        return false;
      }
      return this._handleShortcutKey(e) ||
        this._handleEscapeKey(e) ||
        this._handleArrowKeys(e) ||
        this._handleZoomKeys(e) ||
        this._handleFocusTrap(e) ||
        this._handleMediaKeys(e) ||
        this._handleToolbarShortcuts(e);
    },

    _handleShortcutKey: function (e) {
      var $popup = this.$shortcutsPopup;
      var popupOpen = $popup && $popup.length && $popup.hasClass('cv-open');
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        if (this.activeInstance.opts.shortcutsPopup !== false) {
          if (popupOpen) { this._hideShortcutsPopup(); } else { this._showShortcutsPopup(); }
        }
        return true;
      }
      return false;
    },

    _handleEscapeKey: function (e) {
      if (e.key !== 'Escape') {
        return false;
      }
      var $popup = this.$shortcutsPopup;
      if ($popup && $popup.length && $popup.hasClass('cv-open')) {
        this._hideShortcutsPopup();
        return true;
      }
      var fsEl = getFullscreenElement();
      if (fsEl) {
        if (document.exitFullscreen) { document.exitFullscreen(); }
        else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
        else if (document.mozCancelFullScreen) { document.mozCancelFullScreen(); }
        else if (document.msExitFullscreen) { document.msExitFullscreen(); }
        var self = this;
        setTimeout(function () { self._syncFullscreenToggle(); }, 0);
        return true;
      }
      this.close();
      return true;
    },

    _handleArrowKeys: function (e) {
      if (e.key === 'ArrowLeft') {
        if (this._seekFocusedMediaBy(-5, e.target)) { return true; }
        this._nav(this._isRtl() ? 'next' : 'prev');
        return true;
      }
      if (e.key === 'ArrowRight') {
        if (this._seekFocusedMediaBy(5, e.target)) { return true; }
        this._nav(this._isRtl() ? 'prev' : 'next');
        return true;
      }
      return false;
    },

    _handleZoomKeys: function (e) {
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if ((/(input|textarea|select)/).test(tag)) { return false; }
      if (e.key !== '+' && e.key !== '=' && e.key !== '-') { return false; }
      if (this._isImageItem) {
        var zo = this._zoomOpts();
        var step = (!isNullish(zo.wheelStep) ? zo.wheelStep : 0.25);
        this._setZoom(e.key === '-' ? Math.max(zo.min, this._zoom - step) : Math.min(zo.max, this._zoom + step));
        return true;
      }
      if (this._isPdfItem) {
        var $out = this.$toolbar.find('.cv-tb-pdf-zoom-out:visible');
        var $in = this.$toolbar.find('.cv-tb-pdf-zoom-in:visible');
        if (e.key === '-' && $out.length) { $out.first().trigger('click'); }
        else if ($in.length) { $in.first().trigger('click'); }
        return true;
      }
      return false;
    },

    _handleFocusTrap: function (e) {
      if (e.key !== 'Tab' || !this.activeInstance.opts.wcag) {
        return false;
      }
      var isPopupOpen = this.$shortcutsPopup.hasClass('cv-open');
      var container = isPopupOpen ? this.$shortcutsPopup[0] : this.$shell[0];
      if (!container) { return false; }
      var focusable = container.querySelectorAll('button, [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
      var list = [].slice.call(focusable).filter(function (el) {
        var style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && (el.offsetParent !== null || el.getBoundingClientRect().width > 0);
      });
      if (list.length === 0) { return false; }
      var inside = container.contains(e.target);
      var idx = list.indexOf(e.target);
      if (!inside || idx === -1) {
        e.preventDefault(); list[0].focus(); return true;
      }
      if (e.shiftKey && idx === 0) {
        e.preventDefault(); list[list.length - 1].focus(); return true;
      }
      if (!e.shiftKey && idx === list.length - 1) {
        e.preventDefault(); list[0].focus(); return true;
      }
      return true;
    },

    _handleMediaKeys: function (e) {
      var evTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if ((/(input|textarea|select)/).test(evTag)) { return false; }
      var hasBuiltInMedia = !this._isCustomRendered && this.$stage.find('.jp-play, .jp-pause, .jp-mute, .jp-unmute, .cv-native-video, .cv-native-audio').length > 0;
      if (!hasBuiltInMedia) { return false; }
      if (e.key === ' ') { return this._toggleMediaPlayPause(); }
      if (e.key === 'm') { return this._toggleMediaMute(); }
      if (e.key === 'r') { return this._cycleMediaPlaybackRate(); }
      return false;
    },

    _toggleMediaPlayPause: function () {
      var $pause = this.$stage.find('.jp-pause:visible');
      if ($pause.length) { $pause.first().trigger('click'); this._showMediaStateFeedback('pause'); return true; }
      var $play = this.$stage.find('.jp-play:visible, .cv-jp-big-play:visible');
      if ($play.length) { $play.first().trigger('click'); this._showMediaStateFeedback('play'); return true; }
      var el = this.$stage.find('.cv-native-video')[0];
      if (el) {
        if (el.paused) { el.play(); this._showMediaStateFeedback('play'); }
        else { el.pause(); this._showMediaStateFeedback('pause'); }
        return true;
      }
      return false;
    },

    _toggleMediaMute: function () {
      var $unmute = this.$stage.find('.jp-unmute:visible');
      if ($unmute.length) { $unmute.first().trigger('click'); this._showMediaStateFeedback('unmute'); return true; }
      var $mute = this.$stage.find('.jp-mute:visible');
      if ($mute.length) { $mute.first().trigger('click'); this._showMediaStateFeedback('mute'); return true; }
      var el = this.$stage.find('.cv-native-video')[0];
      if (el) { el.muted = !el.muted; this._showMediaStateFeedback(el.muted ? 'mute' : 'unmute'); return true; }
      return false;
    },

    _cycleMediaPlaybackRate: function () {
      var RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
      var $speed = this.$stage.find('.cv-jp-speed');
      if ($speed.length) {
        var cur = parseFloat($speed.val()) || 1;
        var ri = RATES.indexOf(cur);
        if (ri < 0) { ri = RATES.indexOf(1); }
        if (ri < 0) { ri = 2; }
        $speed.val(String(RATES[(ri + 1) % RATES.length])).trigger('change');
        return true;
      }
      var el = this.$stage.find('.cv-native-video')[0] || this.$stage.find('.cv-audio-wrap audio')[0];
      if (el) {
        var r = el.playbackRate || 1;
        var ri2 = RATES.indexOf(r);
        if (ri2 < 0) { ri2 = 0; while (ri2 < RATES.length && RATES[ri2] < r) { ri2++; } ri2 = Math.min(ri2, RATES.length - 1); }
        el.playbackRate = RATES[(ri2 + 1) % RATES.length];
        return true;
      }
      return false;
    },

    _handleToolbarShortcuts: function (e) {
      var evTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if ((/(input|textarea|select)/).test(evTag)) { return false; }
      var self = this;
      var keyShortcuts = { q: function () { return self.$stage.find('.cv-jp-hd:visible'); },
        d: function () { return self.$toolbar.find('.cv-tb-download:visible'); },
        p: function () { return self.$toolbar.find('.cv-tb-pdf-print:visible'); },
        f: function () { return self.$fullscreenToggle.filter(':visible'); },
        t: function () { return self.$themeToggle.filter(':visible'); },
        c: function () { return self.$carouselToggle.filter(':visible'); },
        s: function () { return self.$toolbar.find('.cv-slideshow-btn:visible'); },
        n: function () { return self.$minimizeToggle.filter(':visible'); } };
      if (keyShortcuts[e.key]) {
        var $btn = keyShortcuts[e.key]();
        if ($btn.length) { $btn.first().trigger('click'); return true; }
      }
      var customKey = (e.key || '').toLowerCase();
      if (!RESERVED_SHORTCUT_KEYS[customKey]) {
        var selKey = customKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var $customBtn = self.$toolbar.find('.cv-tb-btn[data-cv-shortcut="' + selKey + '"]:visible');
        if ($customBtn.length) { $customBtn.first().trigger('click'); return true; }
      }
      return false;
    },

    _bindEvents: function () {
      var self = this;
      this.$el.find('.cv-close').on('click', function () {
        self.close();
      });
      this.$themeToggle.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!self.activeInstance) {
          return;
        }
        var inst = self.activeInstance;
        var current = inst.opts.theme || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        inst.opts.theme = next;
        self.$el[0].className = buildOverlayClassName(next, true, false, inst);
        self._syncThemeToggle();
        if (typeof inst.opts.onThemeChange === 'function') {
          inst.opts.onThemeChange(next, inst);
        }
        return false;
      });
      this.$carouselToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        self._carouselOpen = !self._carouselOpen;
        if (self._carouselOpen) {
          self.$carouselWrap.addClass('cv-open');
        } else {
          self.$carouselWrap.removeClass('cv-open');
        }
        self.$carouselToggle.attr('aria-expanded', self._carouselOpen).toggleClass('cv-active', self._carouselOpen);
        if (typeof self._updateCarouselNavVisibility === 'function') {
          self._updateCarouselNavVisibility(self.activeInstance);
        }
      });
      this.$fullscreenToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        self._toggleOverlayFullscreen();
      });
      this.$minimizeToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance || !self._canMinimize(self.activeInstance)) {
          return;
        }
        self._captureMinimizedSnapshot(self.activeInstance);
        self._applyMinimizedUi(self.activeInstance, true);
      });
      this.$restoreFab.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        self._restoreFromMinimized();
      });
      this.$commentToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        if (self._commentPanelVisible === undefined) {
          self._commentPanelVisible = true;
        }
        self._commentPanelVisible = !self._commentPanelVisible;
        self.$commentWrap.toggle(self._commentPanelVisible).attr('aria-hidden', !self._commentPanelVisible);
        self.$commentToggle.attr('aria-expanded', self._commentPanelVisible).toggleClass('cv-active', self._commentPanelVisible);
        if (self.activeInstance.opts.canShowTooltip !== false) {
          self.$commentToggle.attr('data-cv-tooltip', str(self.activeInstance, 'toggleComment'));
        }
      });
      this.$commentPrev.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance || !self._commentList || self._commentList.length <= 1) {
          return;
        }
        self._commentIndex = self._commentIndex <= 0 ? self._commentList.length - 1 : self._commentIndex - 1;
        self._renderCommentAt(self.activeInstance, self._commentList, self._commentIndex);
      });
      this.$commentNext.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance || !self._commentList || self._commentList.length <= 1) {
          return;
        }
        self._commentIndex = self._commentIndex >= self._commentList.length - 1 ? 0 : self._commentIndex + 1;
        self._renderCommentAt(self.activeInstance, self._commentList, self._commentIndex);
      });
      this.$carouselPrev.on('click', function (e) {
        e.preventDefault();
        if (typeof self._scrollCarouselBy === 'function') {
          self._scrollCarouselBy(-(104 + 10) * 5);
        }
      });
      this.$carouselNext.on('click', function (e) {
        e.preventDefault();
        if (typeof self._scrollCarouselBy === 'function') {
          self._scrollCarouselBy((104 + 10) * 5);
        }
      });
      this.$prev.on('click', function () {
        self._nav('prev');
      });
      this.$next.on('click', function () {
        self._nav('next');
      });
      this.$backdrop[0].addEventListener('click', function backdropClick (e) {
        if (e.target !== self.$backdrop[0]) {
          return;
        }
        if (!self.activeInstance || !self.activeInstance.opts.overlayClose) {
          return;
        }
        self.close();
      });
      $(document).off('.cv-overlay-fullscreen').on('fullscreenchange.cv-overlay-fullscreen webkitfullscreenchange.cv-overlay-fullscreen mozfullscreenchange.cv-overlay-fullscreen msfullscreenchange.cv-overlay-fullscreen', function () {
        setTimeout(function () {
          if (self.$fullscreenToggle.length && self.$fullscreenToggle.is(':visible')) {
            self._syncFullscreenToggle();
          }
        }, 0);
      });

      /* zoom slider */
      this.$zoomSlider.on('input', function () {
        if (!self._isImageItem) {
          return;
        }
        var nz = parseFloat(this.value);
        if (self._zoom !== 0) {
          var r = nz / self._zoom; self._panX *= r; self._panY *= r;
        }
        self._zoom = nz;
        removeExtractOverlay(self.$stage);
        self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
        self._clampPan(); self._applyTransform(); self._fireZoom();
        if (self._highResSliderDebounceTimer != null) {
          clearTimeout(self._highResSliderDebounceTimer);
        }
        self._highResSliderDebounceTimer = setTimeout(function () {
          self._highResSliderDebounceTimer = null;
          self._loadHighResImageIfNeeded();
        }, 350);
      });
      this.$el.find('.cv-zoom-out-btn').on('click', function () {
        if (!self._isImageItem) {
          return;
        }
        self._setZoom(Math.max(self._zoomOpts().min, self._zoom - 0.25));
      });
      this.$el.find('.cv-zoom-in-btn').on('click', function () {
        if (!self._isImageItem) {
          return;
        }
        self._setZoom(Math.min(self._zoomOpts().max, self._zoom + 0.25));
      });
      this.$zoomPct.on('click', function () {
        if (self._isImageItem) {
          self._setZoom(1);
        }
      });

      this.$stageWrap.on('dblclick', function (e) {
        if (!self._isImageItem) {
          return;
        }
        e.preventDefault();
        self._setZoom(1);
      });

      /* wheel zoom */
      this.$stageWrap[0].addEventListener('wheel', function (e) {
        if (!self.visible || !self._isImageItem) {
          return;
        }
        e.preventDefault();
        var zo = self._zoomOpts();
        var delta = e.deltaY < 0 ? zo.wheelStep : -zo.wheelStep;
        var nz = Math.max(zo.min, Math.min(zo.max, self._zoom + delta));
        if (nz === self._zoom) {
          return;
        }
        if (_checkIsGifItem()) {
          self._panX = 0; self._panY = 0;
        } else {
          var rect = self.$stageWrap[0].getBoundingClientRect();
          var cx = e.clientX - rect.left - rect.width / 2;
          var cy = e.clientY - rect.top - rect.height / 2;
          var ratio = nz / self._zoom;
          self._panX = cx - ratio * (cx - self._panX);
          self._panY = cy - ratio * (cy - self._panY);
        }
        self._zoom = nz;
        removeExtractOverlay(self.$stage);
        self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
        self._clampPan(); self._syncSlider(); self._applyTransform();
        self._loadHighResImageIfNeeded();
      }, { passive: false });

      /* mouse drag pan — .cv-extract-word check allows text selection while zoomed */
      this.$stageWrap.on('mousedown', function (e) {
        if (!self._isImageItem || self._zoom <= 1 || e.button !== 0) {
          return;
        }
        if (_checkIsGifItem()) {
          return;
        }
        if ($(e.target).closest('.cv-extract-word').length) {
          return;
        }
        e.preventDefault();
        self._isPanning = true;
        self._panOriginX = e.clientX; self._panOriginY = e.clientY;
        self._panStartX = self._panX; self._panStartY = self._panY;
      });
      $(document).off('.cv-pan').on('mousemove.cv-pan', function (e) {
        if (!self._isPanning) {
          return;
        }
        self._panX = self._panStartX + (e.clientX - self._panOriginX);
        self._panY = self._panStartY + (e.clientY - self._panOriginY);
        self._clampPan(); self._applyTransform();
      });
      $(document).on('mouseup.cv-pan', function () {
        self._isPanning = false;
      });

      /* touch pinch + pan */
      this.$stageWrap.on('touchstart', function (e) {
        if (!self._isImageItem) {
          return;
        }
        var t = e.originalEvent.touches;
        if (t.length === 2) {
          e.preventDefault();
          self._isPanning = false;
          self._pinchStartDist = self._touchDist(t); self._pinchStartZoom = self._zoom;
          self._pinchPanStartX = self._panX; self._pinchPanStartY = self._panY;
          var rect = self.$stageWrap[0].getBoundingClientRect();
          var midX = (t[0].clientX + t[1].clientX) / 2;
          var midY = (t[0].clientY + t[1].clientY) / 2;
          self._pinchMidStartX = midX - rect.left - rect.width / 2;
          self._pinchMidStartY = midY - rect.top - rect.height / 2;
        } else if (t.length === 1 && self._zoom > 1 && !_checkIsGifItem()) {
          if (!$(e.target).closest('.cv-extract-word').length) {
            self._isPanning = true;
            self._panOriginX = t[0].clientX; self._panOriginY = t[0].clientY;
            self._panStartX = self._panX; self._panStartY = self._panY;
          }
        }
      });
      this.$stageWrap.on('touchmove', function (e) {
        if (!self._isImageItem) {
          return;
        }
        var t = e.originalEvent.touches;
        if (t.length === 2 && self._pinchStartDist) {
          e.preventDefault();
          self._justEndedPinch = false;
          var zo = self._zoomOpts();
          var dist = self._touchDist(t);
          var nz = Math.max(zo.min, Math.min(zo.max, self._pinchStartZoom * (dist / self._pinchStartDist)));
          if (_checkIsGifItem()) {
            self._panX = 0; self._panY = 0;
          } else {
            var midX = (t[0].clientX + t[1].clientX) / 2;
            var midY = (t[0].clientY + t[1].clientY) / 2;
            var rect = self.$stageWrap[0].getBoundingClientRect();
            var cx = midX - rect.left - rect.width / 2;
            var cy = midY - rect.top - rect.height / 2;
            var ratio = nz / self._zoom;
            self._panX = self._pinchMidStartX - ratio * (self._pinchMidStartX - self._pinchPanStartX) + (cx - self._pinchMidStartX);
            self._panY = self._pinchMidStartY - ratio * (self._pinchMidStartY - self._pinchPanStartY) + (cy - self._pinchMidStartY);
          }
          self._zoom = nz;
          removeExtractOverlay(self.$stage);
          self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
          self._clampPan(); self._syncSlider(); self._applyTransform();
          self._loadHighResImageIfNeeded();
        } else if (t.length === 1 && self._isPanning) {
          if (self._justEndedPinch) {
            self._panOriginX = t[0].clientX;
            self._panOriginY = t[0].clientY;
            self._panStartX = self._panX;
            self._panStartY = self._panY;
            self._justEndedPinch = false;
          }
          self._panX = self._panStartX + (t[0].clientX - self._panOriginX);
          self._panY = self._panStartY + (t[0].clientY - self._panOriginY);
          self._clampPan(); self._applyTransform();
        }
      });
      this.$stageWrap.on('touchend touchcancel', function (e) {
        var rem = e.originalEvent.touches;
        if (rem.length === 1 && self._isImageItem && self._zoom > 1 && !_checkIsGifItem()) {
          self._isPanning = true;
          self._justEndedPinch = self._pinchStartDist > 0;
          self._panOriginX = rem[0].clientX;
          self._panOriginY = rem[0].clientY;
          self._panStartX = self._panX;
          self._panStartY = self._panY;
        } else if (rem.length === 0) {
          self._isPanning = false;
          self._justEndedPinch = false;
        }
        self._pinchStartDist = 0;

        if (self._swipeTracking && rem.length === 0) {
          var dx = self._swipeEndX - self._swipeStartX,
            dy = self._swipeEndY - self._swipeStartY;
          var inst = self.activeInstance;
          if (inst && inst.opts.overlayClose && inst.opts.swipeToClose !== false && dy >= 60 && dy > Math.abs(dx)) {
            e.preventDefault();
            self.close();
          } else if (inst && inst.items.length > 1 && inst.opts.swipeNav !== false && !(self._isImageItem && self._zoom > 1) && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
            e.preventDefault();
            self._nav(self._isRtl(inst) ? (dx > 0 ? 'next' : 'prev') : (dx > 0 ? 'prev' : 'next'), true);
          }
          self._swipeTracking = false;
        }
      });

      /* touch swipe tracking */
      this.$stageWrap.on('touchstart', function (e) {
        var t = e.originalEvent.touches;
        if (t.length !== 1 || !self.activeInstance) {
          return;
        }
        var inst = self.activeInstance;
        var canSwipeNav = inst.items.length > 1 && inst.opts.swipeNav !== false && !(self._isImageItem && self._zoom > 1);
        var canSwipeClose = inst.opts.overlayClose && inst.opts.swipeToClose !== false;
        if (!canSwipeNav && !canSwipeClose) {
          return;
        }
        self._swipeStartX = t[0].clientX;
        self._swipeStartY = t[0].clientY;
        self._swipeEndX = self._swipeStartX;
        self._swipeEndY = self._swipeStartY;
        self._swipeTracking = true;
      });
      this.$stageWrap.on('touchmove', function (e) {
        if (!self._swipeTracking || e.originalEvent.touches.length !== 1) {
          return;
        }
        self._swipeEndX = e.originalEvent.touches[0].clientX;
        self._swipeEndY = e.originalEvent.touches[0].clientY;
      });
    },

    _normalizeComments: function (item) {
      if (!item.comments || !Array.isArray(item.comments) || item.comments.length === 0) {
        return [];
      }
      return item.comments.map(function (c) {
        var t = (c && (c.text !== null && c.text !== undefined)) ? String(c.text).trim() : '';
        var ti = (c && (c.title !== null && c.title !== undefined)) ? String(c.title).trim() : '';
        var a = (c && (c.author !== null && c.author !== undefined)) ? String(c.author).trim() : '';
        return { title: ti, author: a, text: t };
      }).filter(function (c) {
        return c.title !== '' || c.author !== '' || c.text !== '';
      });
    },

    _renderCommentAt: function (inst, list, index) {
      if (!list || !list.length || index < 0 || index >= list.length) {
        return;
      }
      var c = list[index];
      var titleText = (!isNullish(c.title)) ? String(c.title).trim() : '';
      var authorText = (!isNullish(c.author)) ? String(c.author).trim() : '';
      var text = (!isNullish(c.text)) ? String(c.text).trim() : '';
      this.$commentTitle.text(titleText).toggle(titleText !== '');
      this.$commentAuthor.text(authorText ? (str(inst, 'commentBy') + ' ' + authorText) : '').toggle(authorText !== '');
      this.$commentSep.toggle(titleText !== '' || authorText !== '');
      this.$commentInner.text(text).toggle(text !== '');
      this.$commentCounter.text(str(inst, 'commentCounter').replace('%1', String(index + 1)).replace('%2', String(list.length)));
      if (inst.opts.wcag) {
        this.$commentPrev.attr('aria-label', str(inst, 'commentPrev'));
        this.$commentNext.attr('aria-label', str(inst, 'commentNext'));
      }
    },

    _bindTooltip: function () {
      var self = this;
      var hideTimer;
      function showTip ($target) {
        var text = $target.attr('data-cv-tooltip');
        if (!text) {
          return;
        }
        clearTimeout(hideTimer);
        if (!self.$tooltip || !self.$tooltip.length) {
          var $tip = $('<div class="cv-tooltip" id="cv-tooltip" aria-hidden="true"></div>');
          var parent = getFullscreenElement() === self.$el[0] ? self.$el : $('body');
          parent.append($tip);
          $tip.on('mouseenter.cv-tooltip', function () {
            clearTimeout(hideTimer);
          });
          $tip.on('mouseleave.cv-tooltip', hideTip);
          self.$tooltip = $tip;
        }
        self.$tooltip.text(text).attr('aria-hidden', 'false').addClass('cv-tooltip-visible');
        var rect = $target[0].getBoundingClientRect();
        var tipRect = self.$tooltip[0].getBoundingClientRect();
        var left = rect.left + (rect.width / 2) - (tipRect.width / 2);
        var top = rect.top - tipRect.height - 6;
        if (top < 8) {
          top = rect.bottom + 6;
        }
        var maxLeft = Math.max(8, window.innerWidth - tipRect.width - 8);
        left = Math.max(8, Math.min(maxLeft, left));
        self.$tooltip.css({ left: left + 'px', top: top + 'px' });
      }
      function hideTip () {
        hideTimer = setTimeout(function () {
          if (self.$tooltip && self.$tooltip.length) {
            self.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true').remove();
            self.$tooltip = $();
          }
        }, 50);
      }
      this.$el.on('mouseenter.cv-tooltip', '[data-cv-tooltip]', function (e) {
        showTip($(e.currentTarget));
      });
      this.$el.on('mouseleave.cv-tooltip', '[data-cv-tooltip]', function () {
        hideTip();
      });
    },

    _applyTooltips: function (inst) {
      if (!inst || !this.$el.length) {
        return;
      }
      var show = inst.opts.canShowTooltip !== false;
      var set = function ($el, key) {
        if (show) {
          $el.attr('data-cv-tooltip', str(inst, key));
        } else {
          $el.removeAttr('data-cv-tooltip');
        }
      };
      var fsEl = getFullscreenElement();
      var carouselPrevTip = this._isRtl(inst) ? 'scrollCarouselRight' : 'scrollCarouselLeft';
      var carouselNextTip = this._isRtl(inst) ? 'scrollCarouselLeft' : 'scrollCarouselRight';
      var tips = [[this.$el.find('.cv-close'), 'close'], [this.$carouselToggle, 'attachments'], [this.$fullscreenToggle, fsEl === this.$el[0] ? 'exitFullscreen' : 'fullscreen'], [this.$themeToggle, (inst.opts.theme || 'dark') === 'dark' ? 'switchToLightMode' : 'switchToDarkMode'], [this.$prev, 'previousItem'], [this.$next, 'nextItem'], [this.$carouselPrev, carouselPrevTip], [this.$carouselNext, carouselNextTip], [this.$el.find('.cv-zoom-out-btn'), 'zoomOut'], [this.$zoomSlider, 'zoomLevel'], [this.$el.find('.cv-zoom-in-btn'), 'zoomIn']];
      for (var i = 0; i < tips.length; i++) {
        set(tips[i][0], tips[i][1]);
      }
    },

    _nav: function (dir, useTransition) {
      if (!this.activeInstance) {
        return;
      }
      var opts = useTransition ? { transition: true } : undefined;
      if (dir === 'prev') {
        this.activeInstance.prev(opts);
      } else {
        this.activeInstance.next(opts);
      }
    },

    _scrollCarouselBy: function (stepPx, inst) {
      var el = this.$carousel && this.$carousel[0];
      if (!el) {
        return;
      }
      var directionStep = this._isRtl(inst) ? -stepPx : stepPx;
      if (typeof el.scrollBy === 'function') {
        el.scrollBy({ left: directionStep, behavior: 'smooth' });
      } else {
        el.scrollLeft += directionStep;
      }
    },

    /* zoom helpers */
    _zoomOpts: function () {
      return (this.activeInstance && this.activeInstance.opts.zoom) || DEFAULTS.zoom;
    },
    _setZoom: function (val) {
      var zo = this._zoomOpts();
      var nz = Math.max(zo.min, Math.min(zo.max, val));
      if (nz !== this._zoom) {
        var r = nz / this._zoom; this._panX *= r; this._panY *= r;
        removeExtractOverlay(this.$stage);
        this.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
      }
      this._zoom = nz; this._clampPan(); this._syncSlider(); this._applyTransform();
      this._loadHighResImageIfNeeded();
    },
    _syncSlider: function () {
      var z = Number(this._zoom);
      this.$zoomSlider.val(z);
      var pct = Math.round(z * 100);
      this.$zoomPct.text(pct + '%');
      this._fireZoom();
    },
    _fireZoom: function () {
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      var cb = inst.opts.zoom && inst.opts.zoom.onZoom;
      if (typeof cb === 'function') {
        cb(this._zoom, inst.items[inst.idx], inst);
      }
    },
    _applyTransform: function () {
      var $img = this.$stage.find('.cv-image');
      if (!$img.length) {
        return;
      }
      var tr = 'translate(-50%, -50%) translate(' + this._panX + 'px,' + this._panY + 'px) scale(' + this._zoom + ')';
      var $stack = this.$stage.find('.cv-img-transform');
      if ($stack.length) {
        syncCvImgTransformDimensions($img[0]);
        $stack.css({ transformOrigin: '50% 50%', transform: tr });
      } else {
        $img.css('transform', tr);
      }
      $img.css('cursor', (this._zoom > 1 && !_checkIsGifItem()) ? 'grab' : '');
      /* Sync extract overlay layer dimensions when feature-extract is loaded */
      if (typeof CV.Utils.getCvImageContentMetrics === 'function') {
        var $extractLayer = this.$stage.find('.cv-extract-layer');
        if ($extractLayer.length && $img.length) {
          var metrics = CV.Utils.getCvImageContentMetrics($img[0]);
          if (metrics) {
            $extractLayer.css({ width: metrics.cw, height: metrics.ch });
          }
        }
      }
    },
    _clampPan: function () {
      if (_checkIsGifItem()) {
        this._panX = 0; this._panY = 0; return;
      }
      if (this._zoom <= 1) {
        this._panX = 0; this._panY = 0; return;
      }
      var stage = this.$stageWrap[0];
      var img = this.$stage.find('.cv-image')[0];
      if (!stage) {
        return;
      }
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      var maxX, maxY;
      if (img && (img.naturalWidth || img.offsetWidth) && (img.naturalHeight || img.offsetHeight)) {
        var nw = img.naturalWidth || img.offsetWidth;
        var nh = img.naturalHeight || img.offsetHeight;
        var scale = Math.min(sw / nw, sh / nh);
        var displayW = nw * scale;
        var displayH = nh * scale;
        maxX = Math.max(0, (displayW * this._zoom - sw) / 2);
        maxY = Math.max(0, (displayH * this._zoom - sh) / 2);
      } else {
        maxX = Math.max(0, (this._zoom - 1) * sw / 2);
        maxY = Math.max(0, (this._zoom - 1) * sh / 2);
      }
      this._panX = Math.max(-maxX, Math.min(maxX, this._panX));
      this._panY = Math.max(-maxY, Math.min(maxY, this._panY));
    },
    _resetZoomPan: function () {
      this._zoom = 1; this._panX = 0; this._panY = 0;
      this._isPanning = false; this._pinchStartDist = 0; this._justEndedPinch = false;
      this._highResLoaded = false; this._highResLoading = false;
      if (this._highResSliderDebounceTimer != null) {
        clearTimeout(this._highResSliderDebounceTimer);
        this._highResSliderDebounceTimer = null;
      }
      this._syncSlider();
    },
    _touchDist: function (t) {
      var dx = t[0].clientX - t[1].clientX,
        dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },
    _loadHighResImageIfNeeded: function () {
      var inst = this.activeInstance;
      if (!inst || !inst.items || inst.idx < 0) {
        return;
      }
      if (!this._isImageItem || _checkIsGifItem() || this._highResLoading) {
        return;
      }
      var zo = this._zoomOpts();
      var threshold = zo.loadHighResUrlAt;
      if (threshold === false || threshold == null || this._zoom <= threshold || this._highResLoaded) {
        return;
      }
      var item = inst.items[inst.idx];
      var resolvedZoom = getResolvedUrl(item, inst, 'zoomUrl');
      var highResUrl = (resolvedZoom && isSafeResourceUrl(resolvedZoom)) ? resolvedZoom : ((item.zoomUrl && isSafeResourceUrl(item.zoomUrl)) ? item.zoomUrl : null) || getItemDownloadUrl(item, inst);
      if (!highResUrl) {
        return;
      }
      var $img = this.$stage.find('.cv-image');
      if (!$img.length) {
        return;
      }
      var currentSrc = $img.attr('src') || '';
      if (currentSrc === highResUrl) {
        this._highResLoaded = true;
        return;
      }
      this._highResLoading = true;
      this.$loader.addClass('cv-active');
      var self = this;
      var imgEl = $img[0];
      var onDone = function () {
        if (!self.activeInstance || self.activeInstance !== inst) {
          self._highResLoading = false;
          self.$loader.removeClass('cv-active');
          return;
        }
        self._highResLoading = false;
        self._highResLoaded = true;
        self.$loader.removeClass('cv-active');
        syncCvImgTransformDimensions(imgEl);
        self._clampPan();
        self._applyTransform();
      };
      $img.one('load', onDone).one('error', function () {
        self._highResLoading = false;
        self.$loader.removeClass('cv-active');
      });
      imgEl.src = highResUrl;
      setTimeout(function () {
        if (!self._highResLoading) {
          return;
        }
        if (imgEl.complete && imgEl.naturalWidth) {
          $img.off('load error');
          onDone();
        }
      }, 0);
    },

    /* open / close */
    open: function (instance) {
      this.ensure();
      this.activeInstance = instance;
      this._swipeTracking = false;
      this._minimizedSnapshot = null;
      if (instance.opts.wcag) {
        this._focusBeforeOpen = document.activeElement;
        this.$el[0].setAttribute('aria-hidden', 'false');
        this.$shell[0].setAttribute('role', 'dialog');
        this.$shell[0].setAttribute('aria-modal', 'true');
        this.$shell[0].setAttribute('aria-labelledby', 'cv-dialog-title');
        this.$shell[0].setAttribute('aria-describedby', 'cv-dialog-desc');
        this.$title[0].setAttribute('aria-live', 'polite');
        this.$counter[0].setAttribute('aria-live', 'polite');
        this.$el.find('.cv-close').attr('aria-label', str(instance, 'close'));
        this.$el.find('.cv-carousel-toggle').attr('aria-label', str(instance, 'attachments'));
        this.$el.find('.cv-nav-prev').attr('aria-label', str(instance, 'previousItem'));
        this.$el.find('.cv-nav-next').attr('aria-label', str(instance, 'nextItem'));
        this.$el.find('.cv-zoom-out-btn').attr('aria-label', str(instance, 'zoomOut'));
        this.$el.find('.cv-zoom-slider').attr('aria-label', str(instance, 'zoomLevel'));
        this.$el.find('.cv-zoom-in-btn').attr('aria-label', str(instance, 'zoomIn'));
        this.$carouselPrev.attr('aria-label', str(instance, this._isRtl(instance) ? 'scrollCarouselRight' : 'scrollCarouselLeft'));
        this.$carouselNext.attr('aria-label', str(instance, this._isRtl(instance) ? 'scrollCarouselLeft' : 'scrollCarouselRight'));
      } else {
        this.$el[0].removeAttribute('aria-hidden');
        this.$shell[0].removeAttribute('role');
        this.$shell[0].removeAttribute('aria-modal');
        this.$shell[0].removeAttribute('aria-labelledby');
        this.$shell[0].removeAttribute('aria-describedby');
        this.$title[0].removeAttribute('aria-live');
        this.$counter[0].removeAttribute('aria-live');
        this.$el.find('.cv-close, .cv-carousel-toggle, .cv-nav-prev, .cv-nav-next, .cv-zoom-out-btn, .cv-zoom-slider, .cv-zoom-in-btn').removeAttr('aria-label');
        this.$carouselPrev.add(this.$carouselNext).removeAttr('aria-label');
        this.$themeToggle.removeAttr('aria-label');
        this.$fullscreenToggle.removeAttr('aria-label');
        this.$commentToggle.removeAttr('aria-label');
      }
      var theme = instance.opts.theme || 'dark';
      this.$el[0].className = buildOverlayClassName(theme, false, false, instance);
      this.$el.attr('dir', this._isRtl(instance) ? 'rtl' : 'ltr');
      this.$shell.attr('dir', this._isRtl(instance) ? 'rtl' : 'ltr');
      this.$themeToggle.toggle(instance.opts.themeToggle !== false);
      this._syncThemeToggle();
      var zo = instance.opts.zoom || DEFAULTS.zoom;
      this.$zoomSlider.attr({ min: zo.min, max: zo.max, step: zo.step });
      this._updateNavButtons(instance);
      this._carouselOpen = false;
      if (typeof this._carouselEnabled === 'function' && this._carouselEnabled(instance) && instance.items.length > 0) {
        this.$carouselToggle.show();
        if (typeof this._buildCarousel === 'function') {
          this._buildCarousel(instance);
        }
        this.$carouselWrap.removeClass('cv-open');
        this.$carouselToggle.attr('aria-expanded', 'false').removeClass('cv-active');
        if (typeof this._updateCarouselNavVisibility === 'function') {
          this._updateCarouselNavVisibility(instance);
        }
      } else {
        this.$carouselToggle.hide().removeClass('cv-active');
        this.$carouselWrap.removeClass('cv-open');
      }
      this.$fullscreenToggle.toggle(instance.opts.fullscreen !== false);
      this.$minimizeToggle.toggle(this._canMinimize(instance));
      this._syncFullscreenToggle();
      this._applyTooltips(instance);
      this._applyMinimizedUi(instance, false);
      if (this._stageOnlyEnabled(instance)) {
        this.$shell.addClass('cv-stage-only');
      } else {
        this.$shell.removeClass('cv-stage-only');
      }
      if (this._stageOnlyEnabled(instance) && instance.opts.slideshow && instance.opts.slideshow.enabled && instance.items.length > 1) {
        this.$shell.addClass('cv-slideshow-visible');
      } else {
        this.$shell.removeClass('cv-slideshow-visible');
      }
      this.$el.addClass('cv-visible');
      this.visible = true;
      if (isNullish(this._bodyOverflow)) {
        this._bodyOverflow = document.body.style.overflow;
      }
      document.body.style.overflow = 'hidden';
      var self = this;
      $(window).off('resize.cv-extract-overlay').on('resize.cv-extract-overlay', function () {
        if (!self.visible || !self.$stage || !self.$stage.length) {
          return;
        }
        if (self.$stage.find('.cv-extract-overlay').length) {
          removeExtractOverlay(self.$stage);
          if (self.$toolbar && self.$toolbar.length) {
            self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
          }
        }
      });
      if (instance._beforeOpenPhase === 'loading') {
        this._enterBeforeOpenLoading(instance);
      } else if (instance._pendingGateContent && instance._pendingGateContent.html) {
        this._showGateContent(instance);
      } else {
        this.loadItem();
      }
      if (instance.opts.wcag) {
        setTimeout(function () {
          var el;
          if (self._stageOnlyEnabled(instance) && !self._stageOnlyHideNav(instance)) {
            el = self.$prev.is(':visible') ? self.$prev[0] : self.$next[0];
          } else if (!self._stageOnlyEnabled(instance)) {
            el = self.$el.find('.cv-close')[0];
          } else {
            el = self.$el.find('.cv-close')[0] || self.$stage[0];
          }
          if (el) {
            el.focus();
          }
        }, 0);
      }
    },

    _updateNavButtons: function (inst) {
      if (!inst || inst.items.length <= 1) {
        this.$prev.hide();
        this.$next.hide();
        return;
      }
      if (this._stageOnlyEnabled(inst) && this._stageOnlyHideNav(inst)) {
        this.$prev.hide();
        this.$next.hide();
        return;
      }
      if (inst.opts.loop) {
        this.$prev.show();
        this.$next.show();
      } else {
        this.$prev.toggle(inst.idx > 0);
        this.$next.toggle(inst.idx < inst.items.length - 1);
      }
    },

    _preloadAdjacentImages: function (inst) {
      if (!inst || !inst.items.length || inst.opts.preloadAdjacentImages === false) {
        return;
      }
      var n = inst.items.length;
      var nextIdx;
      var prevIdx;
      if (inst.opts.loop) {
        nextIdx = (inst.idx + 1) % n;
        prevIdx = (inst.idx - 1 + n) % n;
      } else {
        nextIdx = (inst.idx + 1 < n) ? inst.idx + 1 : -1;
        prevIdx = (inst.idx - 1 >= 0) ? inst.idx - 1 : -1;
      }
      var preload = function (item) {
        if (!item || (item.type || 'image') !== 'image') {
          return;
        }
        var src = getResolvedSrcUrl(item, inst) || item.src;
        if (!src || !isSafeResourceUrl(src)) {
          return;
        }
        var img = new Image();
        img.src = src;
      };
      if (nextIdx >= 0) {
        preload(inst.items[nextIdx]);
      }
      if (prevIdx >= 0 && prevIdx !== nextIdx) {
        preload(inst.items[prevIdx]);
      }
    },

    _stageOnlyEnabled: function (inst) {
      if (!inst || !inst.opts.stageOnly) {
        return false;
      }
      var so = inst.opts.stageOnly;
      return so === true || (so && so.enabled === true);
    },
    _stageOnlyHideNav: function (inst) {
      if (!inst || !inst.opts.stageOnly || typeof inst.opts.stageOnly !== 'object') {
        return false;
      }
      return inst.opts.stageOnly.hideNavigation === true;
    },

    _syncThemeToggle: function () {
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      var theme = inst.opts.theme || 'dark';
      var label = str(inst, theme === 'dark' ? 'switchToLightMode' : 'switchToDarkMode');
      if (inst.opts.wcag) {
        this.$themeToggle.attr('aria-label', label);
      }
      this.$themeToggle.html(theme === 'dark' ? Icons.themeLight : Icons.themeDark);
      this._applyTooltips(inst);
    },

    _syncFullscreenToggle: function () {
      var el = getFullscreenElement();
      var isOverlayFullscreen = (el === this.$el[0]);
      var inst = this.activeInstance;
      var key = isOverlayFullscreen ? 'exitFullscreen' : 'fullscreen';
      var label;
      if (inst) {
        label = str(inst, key);
      } else if (isOverlayFullscreen) {
        label = 'Exit fullscreen';
      } else {
        label = 'Fullscreen';
      }
      if (inst && inst.opts.wcag) {
        this.$fullscreenToggle.attr('aria-label', label);
      }
      this.$fullscreenToggle.html(isOverlayFullscreen ? Icons.fullscreenExit : Icons.fullscreen);
      if (inst && inst.opts.canShowTooltip !== false) {
        this.$fullscreenToggle.attr('data-cv-tooltip', label);
      } else if (inst) {
        this.$fullscreenToggle.removeAttr('data-cv-tooltip');
      }
      if (inst) {
        this._applyTooltips(inst);
      }
      if (this.$tooltip && this.$tooltip.length) {
        if (isOverlayFullscreen && this.$tooltip.parent()[0] !== this.$el[0]) {
          this.$el.append(this.$tooltip);
        } else if (!isOverlayFullscreen && this.$tooltip.parent()[0] !== document.body) {
          $('body').append(this.$tooltip);
        }
      }
    },

    _toggleOverlayFullscreen: function () {
      var el = this.$el[0];
      var fsEl = getFullscreenElement();
      var isOurs = (fsEl === el);
      var self = this;
      if (fsEl && isOurs) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
        setTimeout(function () {
          self._syncFullscreenToggle();
        }, 50);
      } else {
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
        setTimeout(function () {
          self._syncFullscreenToggle();
        }, 100);
      }
    },

    close: function () {
      if (this.$tooltip && this.$tooltip.length) {
        this.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true').remove();
        this.$tooltip = $();
      }
      this._hideShortcutsPopup();
      if (!this.activeInstance) {
        if (this._bodyOverflow !== null && this._bodyOverflow !== undefined) {
          document.body.style.overflow = this._bodyOverflow;
          this._bodyOverflow = null;
        }
        return;
      }
      var inst = this.activeInstance,
        item = inst.items[inst.idx];
      var hadWcag = inst.opts.wcag;
      if (inst._slideshowTimer) {
        clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null;
      }
      var fsEl = getFullscreenElement();
      if (fsEl === this.$el[0]) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
      var self = this;
      this._applyMinimizedUi(inst, false);
      this._minimizedSnapshot = null;
      this.$el.addClass('cv-closing');
      if (typeof inst.opts.onCleanup === 'function' && item) {
        inst.opts.onCleanup(item, inst);
      }
      setTimeout(function () {
        $(window).off('resize.cv-extract-overlay');
        self._destroyCurrent(inst);
        if (typeof inst.opts.onClose === 'function' && item) {
          inst.opts.onClose(item, inst);
        }
        self.$el.removeClass('cv-visible cv-closing');
        document.body.style.overflow = !isNullish(self._bodyOverflow) ? self._bodyOverflow : '';
        self._bodyOverflow = null;
        if (hadWcag) {
          self.$el[0].setAttribute('aria-hidden', 'true');
        }
        if (hadWcag) {
          if (self.$title[0]) {
            self.$title[0].removeAttribute('aria-live');
          }
          if (self.$counter[0]) {
            self.$counter[0].removeAttribute('aria-live');
          }
        }
        self.$stage.empty(); self.$loader.removeClass('cv-active');
        self._clearToolbarToggleActiveStates();
        self._resetZoomPan();
        self._swipeTracking = false;
        if (inst) {
          inst._openContext = null;
          inst._pendingGateContent = null;
          inst._beforeOpenPhase = null;
        }
        self.visible = false; self.activeInstance = null;
        if (hadWcag && self._focusBeforeOpen && typeof self._focusBeforeOpen.focus === 'function') {
          self._focusBeforeOpen.focus();
        }
        self._focusBeforeOpen = null;
        if (self._stripMessageTimer) {
          clearTimeout(self._stripMessageTimer); self._stripMessageTimer = null;
        }
        if (self.$el && self.$el.length) {
          self.$el.remove();
        }
        self.built = false;
        self.$el = null;
        self.$shell = null; self.$stage = null; self.$stageWrap = null; self.$toolbar = null;
        self.$loader = null; self.$prev = null; self.$next = null; self.$footer = null;
      }, 300);
    },

    _enterBeforeOpenLoading: function (instance) {
      this._destroyCurrent(instance);
      this.$stage.empty();
      this.$loader.addClass('cv-active');
      this.$footer.hide();
      this.$toolbar.empty();
      this.$pollOption.removeClass('cv-active').empty().hide();
      this.$counter.closest('.cv-header-left').hide();
      this.$prev.hide();
      this.$next.hide();
      if (typeof this._carouselEnabled === 'function' && this._carouselEnabled(instance)) {
        this.$carouselToggle.hide();
      }
      this._clearToolbarToggleActiveStates();
      var item = instance.items[instance.idx];
      this.$title.text((item && !isNullish(item.title) && item.title !== '') ? String(item.title) : '');
      this.$title.closest('.cv-header-center').show();
    },

    _finishBeforeOpenProceed: function (instance) {
      if (!instance || this.activeInstance !== instance) {
        return;
      }
      if (instance._pendingGateContent && instance._pendingGateContent.html) {
        instance._beforeOpenPhase = 'gate';
        this._showGateContent(instance);
      } else {
        instance._beforeOpenPhase = null;
        this.loadItem();
      }
    },

    _showGateContent: function (instance) {
      var gate = instance._pendingGateContent;
      if (!gate || !gate.html) {
        instance._beforeOpenPhase = null;
        this.loadItem();
        return;
      }
      var self = this;
      this.$stage.empty().append(gate.html);
      this.$title.text('');
      this.$counter.closest('.cv-header-left').hide();
      this.$prev.hide();
      this.$next.hide();
      if (typeof this._carouselEnabled === 'function' && this._carouselEnabled(instance)) {
        this.$carouselToggle.hide();
      }
      this.$footer.hide();
      this.$toolbar.empty();
      this.$pollOption.removeClass('cv-active').empty().hide();
      this.$loader.removeClass('cv-active');
      this._clearToolbarToggleActiveStates();
      var $proceed = this.$stage.find('[data-cv-gate-proceed]');
      $proceed.off('click.cv-gate').on('click.cv-gate', function (e) {
        e.preventDefault();
        var opts = (typeof gate.onProceed === 'function') ? gate.onProceed() : {};
        instance._openContext = opts || {};
        instance._pendingGateContent = null;
        instance._beforeOpenPhase = null;
        $proceed.off('click.cv-gate');
        self.loadItem();
      });
    },

    /* load item */
    loadItem: function (opts) {
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      var item = inst.items[inst.idx];
      if (!item) {
        return;
      }
      if (typeof this._carouselEnabled === 'function' && this._carouselEnabled(inst) && inst.items.length > 0) {
        if (typeof this._buildCarousel === 'function') {
          this._buildCarousel(inst);
        }
        if (typeof this._updateCarouselSelection === 'function') {
          this._updateCarouselSelection(inst);
        }
        if (typeof this._updateCarouselNavVisibility === 'function') {
          this._updateCarouselNavVisibility(inst);
        }
      }
      opts = opts || {};
      var useTransition = opts.transition && this.$stage.children().length > 0;
      if (useTransition) {
        var self = this;
        this.$stageWrap.addClass('cv-stage-out');
        setTimeout(function () {
          self.$stageWrap.removeClass('cv-stage-out');
          self._loadItemCore(inst, true);
        }, 280);
        return;
      }
      this._loadItemCore(inst, false);
    },

    _loadItemCore: function (inst, fadeIn) {
      var item = inst.items[inst.idx];
      if (!item) { return; }
      if (typeof inst.opts.onLoading === 'function') { inst.opts.onLoading(item, inst); }

      this._prepareStage(inst);
      var type = item.type || 'image';
      this._updateHeader(inst, item, type);
      var result = this._renderContent(inst, item, type);
      this._applyLayoutClasses(type);
      this._updateCommentPanel(inst, item);

      inst._currentResult = result || {};
      if (type === 'inline' && result && result.inlineContent !== null && result.inlineContent !== undefined) {
        inst._inlineContent = result.inlineContent;
      }

      this._resolveToolbar(inst, result || {});
      if (typeof this._updatePollOption === 'function') { this._updatePollOption(inst, item); }
      if (this.$pollOption.hasClass('cv-active') && !(result && result.imageError)) { this.$footer.show(); }
      this._updateNavButtons(inst);
      this._preloadAdjacentImages(inst);
      if (typeof this._updateCarouselSelection === 'function') { this._updateCarouselSelection(inst); }
      if (typeof inst.opts.onOpen === 'function') { inst.opts.onOpen(item, this.$stage, inst); }
      if (!fadeIn && typeof inst.opts.onComplete === 'function') { inst.opts.onComplete(item, inst); }
      this._startSlideshowTimer(inst);
      this._applyFadeIn(inst, item, fadeIn);
    },

    _prepareStage: function (inst) {
      this._destroyCurrent(inst);
      this.$stage.empty();
      this.$loader.removeClass('cv-active');
      this._clearToolbarToggleActiveStates();
      this._resetZoomPan();
    },

    _updateHeader: function (inst, item, type) {
      this.$title.text(!isNullish(item.title) && item.title !== '' ? String(item.title) : '');
      this.$counter.text((inst.idx + 1) + ' / ' + inst.items.length);
      if (type === 'html') {
        var hasTitle = (!isNullish(item.title) && item.title !== '');
        this.$title.closest('.cv-header-center').toggle(hasTitle);
        this.$counter.closest('.cv-header-left').toggle(hasTitle);
      } else {
        this.$title.closest('.cv-header-center').show();
        this.$counter.closest('.cv-header-left').show();
      }
      if (inst.opts.showCounter === false || inst.items.length <= 1) {
        this.$counter.closest('.cv-header-left').hide();
      }
    },

    _renderContent: function (inst, item, type) {
      var result = null;
      this._isCustomRendered = false;
      this._isImageItem = false;
      this._isPdfItem = false;
      this._isHtmlItem = false;

      if (typeof inst.opts.onRender === 'function') {
        result = inst.opts.onRender(item, this.$stage, inst);
        if (this.$stage.children().length > 0) { this._isCustomRendered = true; }
      }
      if (!this._isCustomRendered) {
        this._isImageItem = (type === 'image');
        this._isPdfItem = (type === 'pdf');
        this._isHtmlItem = (type === 'html');
        var renderer = CV.renderers[type];
        if (renderer) { result = renderer(item, this.$stage, inst, Overlay); }
      }
      if (this.$stage.children().length === 0) {
        builtInUnsupportedRenderer(item, this.$stage);
      }
      return result;
    },

    _applyLayoutClasses: function (type) {
      var $body = this.$el.find('.cv-body');
      if (this._isPdfItem) {
        $body.addClass('cv-body-pdf');
        this.$stageWrap.addClass('cv-stage-wrap-pdf');
        this.$stage.addClass('cv-stage-pdf');
      } else {
        $body.removeClass('cv-body-pdf');
        this.$stageWrap.removeClass('cv-stage-wrap-pdf');
        this.$stage.removeClass('cv-stage-pdf');
      }
      if (type === 'image' || type === 'inline' || type === 'markdown') {
        this.$shell.addClass('cv-stage-light-bg');
      } else {
        this.$shell.removeClass('cv-stage-light-bg');
      }
    },

    _updateCommentPanel: function (inst, item) {
      var commentList = typeof this._normalizeComments === 'function' ? this._normalizeComments(item) : [];
      var showCommentOpt = Boolean(inst.opts.showAttachmentComment);
      if (showCommentOpt && commentList.length > 0) {
        this._commentList = commentList;
        this._commentIndex = 0;
        if (typeof this._renderCommentAt === 'function') {
          this._renderCommentAt(inst, commentList, 0);
        }
        if (commentList.length > 1) {
          this.$commentNav.show();
          if (inst.opts.wcag) {
            this.$commentPrev.attr('aria-label', str(inst, 'commentPrev'));
            this.$commentNext.attr('aria-label', str(inst, 'commentNext'));
          }
        } else {
          this.$commentNav.hide();
        }
        if (this._commentPanelVisible === undefined) { this._commentPanelVisible = true; }
        this.$commentWrap.toggle(this._commentPanelVisible).attr('aria-hidden', !this._commentPanelVisible);
        this.$commentToggle.show().attr('aria-expanded', this._commentPanelVisible).toggleClass('cv-active', this._commentPanelVisible);
        if (inst.opts.canShowTooltip !== false) { this.$commentToggle.attr('data-cv-tooltip', str(inst, 'toggleComment')); }
        if (inst.opts.wcag) { this.$commentToggle.attr('aria-label', str(inst, 'toggleComment')); }
      } else {
        this._commentList = null;
        this.$commentTitle.empty();
        this.$commentAuthor.empty();
        this.$commentInner.empty();
        this.$commentNav.hide();
        this.$commentWrap.hide().attr('aria-hidden', 'true');
        this.$commentToggle.hide().removeClass('cv-active');
      }
    },

    _startSlideshowTimer: function (inst) {
      if (inst._slideshowTimer) { clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null; }
      var ss = inst.opts.slideshow;
      if (!(ss && ss.enabled && inst.items.length > 1 && !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying))) {
        if (typeof this._stopSlideshowProgress === 'function') { this._stopSlideshowProgress(); }
        return;
      }
      var intervalMs = (!isNullish(ss.interval) && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
      var advanceMedia = ss.advanceMedia === 'onEnd' ? 'onEnd' : 'interval';
      inst._slideshowPlaying = true;
      var self = this;
      var advanceFn = function () { if (Overlay.activeInstance === inst) { inst.next({ transition: true }); } };
      if (advanceMedia === 'onEnd') {
        var $media = this.$stage.find('video, audio');
        if ($media.length) {
          $media.one('ended', function () {
            if (inst._slideshowTimer) { clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null; }
            advanceFn();
          });
        }
      }
      inst._slideshowTimer = setTimeout(advanceFn, intervalMs);
      if (ss.showProgress && typeof this._startSlideshowProgress === 'function') { this._startSlideshowProgress(intervalMs); }
      var $slideBtn = this.$toolbar.find('.cv-slideshow-btn');
      if ($slideBtn.length) {
        var lbl = str(inst, 'pauseSlideshow');
        setToolbarBtnPresentation($slideBtn, inst, { label: lbl, tooltip: lbl });
      }
    },

    _applyFadeIn: function (inst, item, fadeIn) {
      if (!fadeIn || this.$stage.children().length === 0) { return; }
      var self = this;
      this.$stage.addClass('cv-stage-in');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          self.$stage.addClass('cv-stage-in-visible');
          setTimeout(function () {
            self.$stage.removeClass('cv-stage-in cv-stage-in-visible');
            if (typeof inst.opts.onComplete === 'function') { inst.opts.onComplete(item, inst); }
          }, 320);
        });
      });
    },

    _destroyCurrent: function (inst) {
      if (inst._currentResult && typeof inst._currentResult.destroy === 'function') {
        inst._currentResult.destroy();
      }
      inst._currentResult = null;
    },

    /* toolbar resolution */
    _resolveToolbar: function (inst, result) {
      if (this._isHtmlItem) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        var slideBtn = (typeof this._slideshowButtonItem === 'function') ? this._slideshowButtonItem(inst) : null;
        var htmlCi = inst.items[inst.idx];
        var htmlTbOpts = inst.opts.toolbar || {};
        var showHtmlDownload = (htmlTbOpts.download !== false) && getItemDownloadUrl(htmlCi, inst);
        var htmlToolbarItems = slideBtn ? [slideBtn] : [];
        var overlayHtml = this;
        if (typeof CV.Utils.shouldShowHtmlMdSourceToolbarButton === 'function' && CV.Utils.shouldShowHtmlMdSourceToolbarButton(htmlCi, inst)) {
          inst._htmlMdShowingSource = false;
          if (htmlToolbarItems.length) {
            htmlToolbarItems.push('separator');
          }
          htmlToolbarItems.push({
            id: 'html-md-source',
            icon: Icons.extractText,
            label: str(inst, 'htmlMdToggleSource'),
            showLabel: false,
            onClick: function (clickedItem, viewerInst) {
              var urlFn = viewerInst.opts.resolveMarkdownToggleUrl;
              if (typeof urlFn !== 'function') {
                return;
              }
              var nextSource = !viewerInst._htmlMdShowingSource;
              var url = urlFn(clickedItem, viewerInst, nextSource);
              if (isNullish(url) || String(url).trim() === '') {
                return;
              }
              viewerInst._htmlMdShowingSource = nextSource;
              var $iframe = overlayHtml.$stage.find('iframe.cv-html-iframe');
              if ($iframe.length) {
                $iframe.attr('src', String(url).trim());
              }
              var $btn = overlayHtml.$toolbar.find('.cv-tb-html-md-source');
              var inSource = viewerInst._htmlMdShowingSource;
              var lbl = inSource ? str(viewerInst, 'htmlMdToggleMarkdown') : str(viewerInst, 'htmlMdToggleSource');
              $btn.toggleClass('cv-active', Boolean(inSource));
              setToolbarBtnPresentation($btn, viewerInst, { tooltip: lbl });
            }
          });
        }
        this._buildToolbar(inst, htmlToolbarItems, showHtmlDownload);
        var hasHtmlToolbarContent = this.$toolbar.children().length > 0;
        var ssHtml = inst.opts.slideshow;
        var htmlFooterForProgress = Boolean(ssHtml && ssHtml.enabled && ssHtml.showProgress && inst.items && inst.items.length > 1);
        if (hasHtmlToolbarContent || htmlFooterForProgress) {
          this.$footer.show();
        } else {
          this.$footer.hide();
        }
        return;
      }
      if (result && result.imageError) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [], false);
        this.$footer.hide();
        return;
      }
      var slideBtnItem;
      if (this._stageOnlyEnabled(inst) && (typeof this._slideshowButtonItem === 'function') && (slideBtnItem = this._slideshowButtonItem(inst))) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [slideBtnItem], false);
        this.$footer.show();
        return;
      }
      if (this._stageOnlyEnabled(inst)) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [], false);
        this.$footer.hide();
        return;
      }
      var tbOpts = inst.opts.toolbar || {};
      var showZoom = this._isImageItem && !this._isCustomRendered && tbOpts.zoom !== false;
      var zoomOpts = inst.opts.zoom || {};
      var showPct = Boolean(zoomOpts.showPercentage);
      this.$zoomWidget.toggle(showZoom);
      this.$zoomPct.toggle(showZoom && showPct);

      if (this._isCustomRendered) {
        var customTb = result.toolbar || [];
        this._buildToolbar(inst, customTb, false);
      } else {
        var rendererTb = (result && result.toolbar) ? result.toolbar : [];
        var items = [];

        if (rendererTb.length) {
          items = items.concat(rendererTb);
        }

        var userItems = inst.opts.toolbarItems || [];
        if (userItems.length) {
          if (items.length) {
            items.push('separator');
          }
          items = items.concat(userItems);
        }

        var slideBtnItem2 = (typeof this._slideshowButtonItem === 'function') ? this._slideshowButtonItem(inst) : null;
        if (slideBtnItem2) {
          if (items.length > 0) {
            items.unshift('separator');
          }
          items.unshift(slideBtnItem2);
        }

        var currentType = (inst.items[inst.idx] && inst.items[inst.idx].type) || '';
        var self = this;

        /* Inline and Markdown: Copy button */
        if (currentType === 'inline' || currentType === 'markdown') {
          if (items.length > 0) {
            items.push('separator');
          }
          items.push({
            id: 'copy',
            icon: Icons.copy,
            label: str(inst, 'copy'),
            showLabel: false,
            className: 'cv-tb-copy',
            onClick: function () {
              var content = currentType === 'inline' ? inst._inlineContent : inst._markdownRaw;
              if (!isNullish(content)) {
                copyTextToClipboard(content, inst);
              }
            }
          });
        }

        /* Markdown: toggle raw/source view */
        var mdOpts = inst.opts.markdown;
        if (currentType === 'markdown' && mdOpts && mdOpts.toggleRawView) {
          if (isNullish(inst._markdownViewMode)) {
            inst._markdownViewMode = 'rendered';
          }
          if (items.length > 0) {
            items.push('separator');
          }
          items.push({
            id: 'markdown-toggle',
            icon: Icons.extractText,
            label: inst._markdownViewMode === 'rendered' ? str(inst, 'viewSource') : str(inst, 'viewMarkdown'),
            showLabel: false,
            className: 'cv-tb-markdown-toggle',
            onClick: function () {
              if (inst._markdownViewMode === 'rendered') {
                if (!isNullish(inst._markdownRaw)) {
                  var bodyHtml = (typeof CV.Utils.getInlineBodyHtml === 'function') ?
                    CV.Utils.getInlineBodyHtml(inst._markdownRaw, (inst.items && inst.items[inst.idx]) ? inst.items[inst.idx] : {}, inst) :
                    escHtml(inst._markdownRaw);
                  self.$stage.empty().append(
                    $('<div class="cv-inline-wrap"><div class="cv-inline-body">' + bodyHtml + '</div></div>')
                  );
                  inst._markdownViewMode = 'raw';
                }
              } else if (!isNullish(inst._markdownHtml)) {
                self.$stage.empty().append($('<div class="cv-markdown-body"></div>').html(inst._markdownHtml));
                inst._markdownViewMode = 'rendered';
              }
              var $btn = self.$toolbar.find('.cv-tb-markdown-toggle');
              if ($btn.length) {
                var lblMd = inst._markdownViewMode === 'rendered' ? str(inst, 'viewSource') : str(inst, 'viewMarkdown');
                setToolbarBtnPresentation($btn, inst, { tooltip: lblMd });
              }
            }
          });
        }

        /* Image: Extract text button */
        if (currentType === 'image' || (!currentType && this._isImageItem)) {
          var canShowFn = inst.opts.canShowExtractText;
          var extractFn = inst.opts.extractText;
          if (tbOpts.extractText === true && typeof canShowFn === 'function' && typeof extractFn === 'function') {
            var currentItem = inst.items[inst.idx];
            if (canShowFn(currentItem, inst)) {
              if (items.length > 0) {
                items.push('separator');
              }
              items.push({
                id: 'extract-text',
                icon: Icons.extractText,
                label: str(inst, 'extractText'),
                showLabel: false,
                className: 'cv-tb-extract-text',
                onClick: (function (eFn) {
                  return function (clickedItem, clickedInst) {
                    var $existing = self.$stage.find('.cv-extract-overlay');
                    if ($existing.length) {
                      $existing.remove();
                      self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
                      return;
                    }
                    self.$loader.addClass('cv-active');
                    eFn(clickedItem, clickedInst, function (resp) {
                      self.$loader.removeClass('cv-active');
                      if (!resp || !resp.data) {
                        return;
                      }
                      removeExtractOverlay(self.$stage);
                      requestAnimationFrame(function () {
                        requestAnimationFrame(function () {
                          var $img = self.$stage.find('.cv-image');
                          var $overlay = (typeof CV.Utils.buildExtractOverlay === 'function') ? CV.Utils.buildExtractOverlay($img, resp) : null;
                          if ($overlay) {
                            var $stack = $img.closest('.cv-img-transform');
                            var $wrap = $img.closest('.cv-img-wrap');
                            var mount = $stack.length ? $stack : $wrap;
                            if (mount.length) {
                              $overlay.addClass('cv-extract-overlay--stacked').css({
                                left: 0,
                                top: 0,
                                width: '100%',
                                height: '100%',
                                transform: 'none',
                                margin: 0
                              });
                              mount.append($overlay);
                              self._applyTransform();
                              self.$toolbar.find('.cv-tb-extract-text').addClass('cv-active');
                            }
                          }
                        });
                      });
                    }, function (message) {
                      self.$loader.removeClass('cv-active');
                      self._showStripMessage(message || '');
                    });
                  };
                }(extractFn))
              });
            }
          }
        }

        /* onToolbar callback */
        if (typeof inst.opts.onToolbar === 'function') {
          var modified = inst.opts.onToolbar(inst.items[inst.idx], items.slice(), inst);
          if ($.isArray(modified)) {
            items = modified;
          }
        }

        var ci = inst.items[inst.idx];
        var showDownload = (tbOpts.download !== false) && getItemDownloadUrl(ci, inst);
        this._buildToolbar(inst, items, showDownload);
      }

      var hasContent = this.$toolbar.children().length > 0 || showZoom;
      this.$footer.toggle(hasContent);
    },

    _buildToolbar: function (inst, items, showDownload) {
      var $tb = this.$toolbar;
      $tb.empty();
      this._resolvedToolbarItems = items || [];

      this._renderToolbarItems($tb, items, inst);

      if (showDownload) {
        if ($tb.children().length > 0) {
          $tb.append('<span class="cv-tb-sep"></span>');
        }
        var dlTitle = (inst.opts.canShowTooltip !== false) ? (' data-cv-tooltip="' + escHtml(str(inst, 'download')) + '"') : '';
        var $dl = $('<button class="cv-tb-btn cv-tb-download" type="button"' + dlTitle + '>' + Icons.download + '</button>');
        $dl.on('click', function (e) {
          e.preventDefault();
          performDownload(inst.items[inst.idx], inst);
        });
        $tb.append($dl);
      }
    },

    _isToolbarBtnVisible: function (sel) {
      var $b = this.$toolbar.find(sel);
      return $b.length && $b.is(':visible');
    },

    _clearToolbarToggleActiveStates: function () {
      if (this.$toolbar && this.$toolbar.length) {
        this.$toolbar.find('.cv-tb-extract-text, .cv-tb-pdf-extract, .cv-tb-pdf-twopage').removeClass('cv-active');
      }
      if (this.$carouselToggle && this.$carouselToggle.length) {
        this.$carouselToggle.removeClass('cv-active');
      }
      if (this.$commentToggle && this.$commentToggle.length) {
        this.$commentToggle.removeClass('cv-active');
      }
    },

    _getShortcutsList: function (inst) {
      var list = [];
      if (!inst || !inst.opts.keyboardNav) {
        return list;
      }
      var opts = inst.opts;
      var currentItem = inst.items[inst.idx];
      var tbOpts = opts.toolbar || {};

      list.push({ key: 'Escape', label: str(inst, 'close') });
      if (inst.items.length > 1) {
        if (this._isRtl(inst)) {
          list.push({ key: 'ArrowLeft', label: str(inst, 'nextItem') });
          list.push({ key: 'ArrowRight', label: str(inst, 'previousItem') });
        } else {
          list.push({ key: 'ArrowLeft', label: str(inst, 'previousItem') });
          list.push({ key: 'ArrowRight', label: str(inst, 'nextItem') });
        }
      }
      if (this._isImageItem && !this._isCustomRendered && tbOpts.zoom !== false) {
        list.push({ key: '+', label: str(inst, 'zoomIn') });
        list.push({ key: '-', label: str(inst, 'zoomOut') });
      }
      if (this._isPdfItem && this.$toolbar.find('.cv-tb-pdf-zoom-in').length) {
        list.push({ key: '+', label: str(inst, 'zoomIn') });
        list.push({ key: '-', label: str(inst, 'zoomOut') });
      }
      if (this._isToolbarBtnVisible('.cv-tb-pdf-print')) {
        list.push({ key: 'p', label: str(inst, 'print') });
      }
      var hasBuiltInMedia = !this._isCustomRendered && this.$stage.find('.jp-play, .jp-pause, .jp-mute, .jp-unmute, .cv-native-video, .cv-native-audio').length > 0;
      if (hasBuiltInMedia) {
        list.push({ key: ' ', label: str(inst, 'playPause') });
        list.push({ key: 'm', label: str(inst, 'muteUnmute') });
        list.push({ key: 'r', label: str(inst, 'cyclePlaybackSpeed') });
      }
      if (this.$stage.find('.cv-jp-hd').length) {
        list.push({ key: 'q', label: str(inst, 'toggleHd') });
      }
      if (this._isToolbarBtnVisible('.cv-tb-download')) {
        list.push({ key: 'd', label: str(inst, 'download') });
      }
      if (opts.fullscreen !== false && this.$fullscreenToggle.length && this.$fullscreenToggle.is(':visible')) {
        var fsEl = getFullscreenElement();
        list.push({ key: 'f', label: fsEl === this.$el[0] ? str(inst, 'exitFullscreen') : str(inst, 'fullscreen') });
      }
      if (opts.themeToggle !== false && this.$themeToggle.length && this.$themeToggle.is(':visible')) {
        list.push({ key: 't', label: str(inst, 'toggleTheme') });
      }
      if (opts.carousel && opts.carousel.enabled && this.$carouselToggle.length && this.$carouselToggle.is(':visible')) {
        list.push({ key: 'c', label: str(inst, 'attachments') });
      }
      if (opts.slideshow && opts.slideshow.enabled && inst.items.length > 1 && this.$toolbar.find('.cv-slideshow-btn').length) {
        list.push({ key: 's', label: str(inst, 'toggleSlideshow') });
      }
      if (opts.minimize && opts.minimize.enabled !== false && this.$minimizeToggle && this.$minimizeToggle.length && this.$minimizeToggle.is(':visible')) {
        list.push({ key: 'n', label: str(inst, 'minimize') });
      }
      var tbItems = this._resolvedToolbarItems || [];
      for (var i = 0; i < tbItems.length; i++) {
        var tbItem = tbItems[i];
        if (tbItem === 'separator' || tbItem === '-' || tbItem instanceof HTMLElement || tbItem instanceof $) {
          continue;
        }
        if (!tbItem.shortcutKey) {
          continue;
        }
        var isVisible = true;
        if (typeof tbItem.visible === 'function') {
          isVisible = tbItem.visible(currentItem, inst);
        } else if (tbItem.visible === false) {
          isVisible = false;
        }
        if (!isVisible) {
          continue;
        }
        var sk = String(tbItem.shortcutKey).toLowerCase().charAt(0);
        if (sk && !RESERVED_SHORTCUT_KEYS[sk]) {
          list.push({ key: sk, label: tbItem.label || (tbItem.id ? String(tbItem.id) : sk) });
        }
      }
      if (opts.shortcutsPopup !== false) {
        list.push({ key: '?', label: str(inst, 'showShortcuts') });
      }
      return list;
    },

    _showMediaStateFeedback: function (type) {
      var $wrap = this.$stage.find('.cv-video-wrap').first();
      if (!$wrap.length) {
        return;
      }
      $wrap.find('.cv-jp-state-feedback').remove();
      var svg = '';
      if (type === 'play') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';
      } else if (type === 'pause') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      } else if (type === 'mute') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      } else if (type === 'unmute') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
      } else {
        return;
      }
      var $el = $('<div class="cv-jp-state-feedback">' + svg + '</div>');
      $wrap.append($el);
      var t1 = setTimeout(function () {
        $el.addClass('cv-jp-state-feedback-out');
      }, 900);
      setTimeout(function () {
        clearTimeout(t1);
        $el.remove();
      }, 1300);
    },

    _showStripMessage: function (text, durationMs) {
      if (!this.$stripMessage || !this.$stripMessage.length) {
        return;
      }
      if (this._stripMessageTimer) {
        clearTimeout(this._stripMessageTimer);
        this._stripMessageTimer = null;
      }
      var ms = (durationMs != null && durationMs > 0) ? durationMs : 2000;
      this.$stripMessage.text(text).addClass('cv-strip-visible');
      var self = this;
      this._stripMessageTimer = setTimeout(function () {
        self.$stripMessage.removeClass('cv-strip-visible');
        self._stripMessageTimer = null;
      }, ms);
    },

    _shortcutKeyDisplay: function (key) {
      if (key === ' ') {
        return 'Space';
      }
      if (key === 'Escape') {
        return 'Esc';
      }
      if (key === 'ArrowLeft') {
        return '←';
      }
      if (key === 'ArrowRight') {
        return '→';
      }
      return key.length === 1 ? key.toUpperCase() : key;
    },

    _showShortcutsPopup: function () {
      var self = this;
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      this._focusBeforeShortcutsPopup = document.activeElement;
      var list = this._getShortcutsList(inst);
      var title = str(inst, 'keyboardShortcuts');
      var useWcag = Boolean(inst.opts.wcag);
      var html = '<div class="cv-shortcuts-popup-inner"' + (useWcag ? ' tabindex="-1"' : '') + '><div class="cv-shortcuts-popup-title">' + escHtml(title) + '</div><ul class="cv-shortcuts-list">';
      for (var i = 0; i < list.length; i++) {
        var displayKey = this._shortcutKeyDisplay(list[i].key);
        html += '<li><kbd>' + escHtml(displayKey) + '</kbd> <span>' + escHtml(list[i].label) + '</span></li>';
      }
      html += '</ul>';
      if (useWcag) {
        html += '<button type="button" class="cv-shortcuts-popup-close" aria-label="' + escHtml(str(inst, 'close')) + '">' + escHtml(str(inst, 'close')) + '</button>';
      }
      html += '</div>';
      this.$shortcutsPopup.html(html).addClass('cv-open').attr('aria-hidden', 'false');
      if (useWcag) {
        this.$shortcutsPopup.attr('aria-modal', 'true');
        var $closeBtn = this.$shortcutsPopup.find('.cv-shortcuts-popup-close');
        if ($closeBtn.length) {
          $closeBtn.on('click', function () {
            self._hideShortcutsPopup();
          });
        }
      }
      this.$shortcutsPopup.off('click.cv-shortcuts').on('click.cv-shortcuts', function (e) {
        if (e.target === self.$shortcutsPopup[0] || $(e.target).closest('.cv-shortcuts-popup-inner').length === 0) {
          self._hideShortcutsPopup();
        }
      });
      if (useWcag) {
        var $focusTarget = this.$shortcutsPopup.find('.cv-shortcuts-popup-close');
        if ($focusTarget.length) {
          $focusTarget[0].focus();
        } else {
          this.$shortcutsPopup.find('.cv-shortcuts-popup-inner')[0].focus();
        }
      }
      if (inst._slideshowTimer) {
        clearTimeout(inst._slideshowTimer);
        inst._slideshowTimer = null;
        inst._slideshowHeldByShortcutsPopup = true;
        if (typeof this._stopSlideshowProgress === 'function') {
          this._stopSlideshowProgress();
        }
      }
    },

    _hideShortcutsPopup: function () {
      var hadFocus = this._focusBeforeShortcutsPopup;
      this.$shortcutsPopup.removeClass('cv-open').attr('aria-hidden', 'true').removeAttr('aria-modal').empty();
      this._focusBeforeShortcutsPopup = null;
      if (hadFocus && typeof hadFocus.focus === 'function') {
        try {
          hadFocus.focus();
        } catch (err) {}
      }
      var inst = this.activeInstance;
      if (inst && inst._slideshowHeldByShortcutsPopup) {
        inst._slideshowHeldByShortcutsPopup = false;
        var ss = inst.opts.slideshow;
        if (ss && ss.enabled && inst.items.length > 1 && !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying)) {
          var intervalMs = (!isNullish(ss.interval) && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
          inst._slideshowTimer = setTimeout(function () {
            if (Overlay.activeInstance === inst) {
              inst.next({ transition: true });
            }
          }, intervalMs);
          if (ss.showProgress && typeof this._startSlideshowProgress === 'function') {
            this._startSlideshowProgress(intervalMs);
          }
        }
      }
    },

    _renderToolbarItems: function ($tb, items, inst) {
      if (!items || !items.length) {
        return;
      }
      var currentItem = inst.items[inst.idx];

      for (var i = 0; i < items.length; i++) {
        var tbItem = items[i];
        if (tbItem === 'separator' || tbItem === '-') {
          $tb.append('<span class="cv-tb-sep"></span>'); continue;
        }
        if (tbItem instanceof HTMLElement || tbItem instanceof $) {
          $tb.append(tbItem); continue;
        }

        var isVisible = true;
        if (typeof tbItem.visible === 'function') {
          isVisible = tbItem.visible(currentItem, inst);
        } else if (tbItem.visible === false) {
          isVisible = false;
        }
        if (!isVisible) {
          continue;
        }

        var iconHtml = '';
        if (tbItem.icon) {
          if (tbItem.icon.charAt(0) === '<') {
            iconHtml = sanitizeIconHtml(tbItem.icon);
          } else {
            iconHtml = '<i class="cv-tb-icon ' + escHtml(tbItem.icon) + '"></i>';
          }
        }
        var label = tbItem.label || '';
        var tooltipText = (!isNullish(tbItem.tooltip) && tbItem.tooltip !== '') ? String(tbItem.tooltip) : label;
        var showTooltip = inst.opts.canShowTooltip !== false && tooltipText !== '';
        var ariaLabel = (tooltipText || (tbItem.id ? String(tbItem.id) : '')) && inst.opts.wcag ? ' aria-label="' + escHtml(tooltipText || tbItem.id || '') + '"' : '';
        var dataTooltip = showTooltip ? ' data-cv-tooltip="' + escHtml(tooltipText) + '"' : '';
        var btnHtml = iconHtml;
        if (tbItem.showLabel && label) {
          btnHtml += ' <span class="cv-tb-label">' + escHtml(label) + '</span>';
        }

        var shortcutAttr = '';
        if (!isNullish(tbItem.shortcutKey) && String(tbItem.shortcutKey).trim() !== '') {
          var sk = String(tbItem.shortcutKey).toLowerCase().charAt(0);
          if (sk) {
            shortcutAttr = ' data-cv-shortcut="' + escHtml(sk) + '"';
          }
        }
        var $btn = $(
          '<button class="cv-tb-btn' +
            (tbItem.id ? ' cv-tb-' + escHtml(String(tbItem.id)) : '') +
            (tbItem.className ? ' ' + escHtml(String(tbItem.className)) : '') +
          '" type="button"' + shortcutAttr + dataTooltip + ariaLabel + '>' + btnHtml + '</button>'
        );
        if (typeof tbItem.onClick === 'function') {
          (function (fn, btn) {
            btn.on('click', function (e) {
              e.preventDefault(); fn(inst.items[inst.idx], inst);
            });
          }(tbItem.onClick, $btn));
        }
        $tb.append($btn);
      }
    }
  };

  /* --- COMPONENTVIEWER CLASS --- */

  function ComponentViewer ($container, options) {
    this.id = ++ComponentViewer._counter;
    this.$container = $container;
    this.opts = $.extend(true, {}, DEFAULTS, options);
    var so = this.opts.stageOnly;
    if (so === true || so === false) {
      this.opts.stageOnly = { enabled: Boolean(so), hideNavigation: false };
    } else if (so && typeof so === 'object') {
      this.opts.stageOnly = $.extend({}, DEFAULTS.stageOnly, so);
    } else {
      this.opts.stageOnly = $.extend({}, DEFAULTS.stageOnly);
    }
    var minCfg = this.opts.minimize;
    if (minCfg === true || minCfg === false) {
      this.opts.minimize = { enabled: Boolean(minCfg) };
    } else if (minCfg && typeof minCfg === 'object') {
      this.opts.minimize = $.extend({}, DEFAULTS.minimize, minCfg);
    } else {
      this.opts.minimize = $.extend({}, DEFAULTS.minimize);
    }
    this.items = []; this.idx = 0; this._currentResult = null;
    var cvSelf = this;
    this._beforeCollectContext = { trigger: 'init' };
    this._collectItems(function () {
      cvSelf._bindClicks();
    });
  }
  ComponentViewer._counter = 0;

  ComponentViewer.prototype = {
    constructor: ComponentViewer,
    _indexOfItemByElement: function (el) {
      var node = el && el.jquery ? el[0] : el;
      if (!node) {
        return -1;
      }
      for (var i = 0; i < this.items.length; i++) {
        if (this.items[i].$el && this.items[i].$el[0] === node) {
          return i;
        }
      }
      return -1;
    },
    _collectItems: function (done) {
      var self = this;
      var finish = function () {
        self._doCollectItems();
        self._beforeCollectContext = null;
        if (typeof done === 'function') {
          done();
        }
      };
      var bci = self.opts.beforeCollectItems;
      if (typeof bci === 'function') {
        if (bci.length >= 2) {
          bci(self, finish);
        } else {
          bci(self);
          finish();
        }
      } else {
        finish();
      }
    },
    _doCollectItems: function () {
      var self = this;
      this.items = [];
      if (self.opts.items && Array.isArray(self.opts.items) && self.opts.items.length > 0) {
        self.items = self.opts.items.slice();
        return;
      }
      this.$container.find(this.opts.selector).each(function () {
        var $el = $(this);
        var src = $el.attr('data-src') || $el.data('src') || $el.attr('href') || $el.find('img').attr('src');
        var fileExt = ($el.data('ext') || (src || '').split('.').pop() || '').toLowerCase();
        var defaultType = $el.data('type') || (fileExt === 'md' ? 'markdown' : 'image');
        var defaultItem = {
          type: defaultType,
          src: src,
          title: $el.data('title') || $el.attr('title') || '',
          downloadUrl: $el.data('download') || $el.attr('data-download') || null,
          zoomUrl: $el.data('zoomurl') || $el.data('zoom-url') || null,
          fileExt: $el.data('ext') || null,
          fileSize: $el.data('size') || null,
          mimeType: $el.data('mime') || null,
          thumbnailUrl: $el.data('thumbnail') || $el.data('poster') || null,
          message: $el.data('message') || null,
          html: $el.data('html') || null,
          content: $el.data('content') || null,
          comment: $el.data('comment') || null,
          author: $el.data('author') || null,
          comments: (function () {
            try {
              var c = $el.data('comments');
              if (Array.isArray(c)) {
                return c;
              }
              if (typeof c === 'string') {
                return JSON.parse(c);
              }
            } catch (e) {}
            return undefined;
          }()),
          pollOptionLabel: $el.data('pollOptionLabel') || null,
          pollOptionId: !isNullish($el.data('pollOptionId')) ? $el.data('pollOptionId') : null,
          pollOptionSelected: $el.data('pollOptionSelected') || $el.data('poll-option-selected') || false
        };
        var item = typeof self.opts.itemData === 'function' ? self.opts.itemData($el, defaultItem) : defaultItem;
        if (isNullish(item)) {
          item = defaultItem;
        }
        item.$el = $el; self.items.push(item);
      });
    },
    _bindClicks: function () {
      var self = this;
      var containerEl = this.$container[0];
      if (!containerEl) {
        return;
      }
      if (this._containerCaptureClick) {
        containerEl.removeEventListener('click', this._containerCaptureClick, true);
        this._containerCaptureClick = null;
      }
      var handler = function (e) {
        var $target = $(e.target);
        var $matched = $target.closest(self.opts.selector);
        if (!$matched.length) {
          return;
        }
        if (!$matched.closest(self.$container).length) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        self._beforeCollectContext = { trigger: 'click', $element: $matched, originalEvent: e };
        self._collectItems(function () {
          var item = null;
          for (var i = 0; i < self.items.length; i++) {
            if (self.items[i].$el && self.items[i].$el[0] === $matched[0]) {
              item = self.items[i];
              break;
            }
          }
          if (!item && self.items.length > 0) {
            item = self.items[0];
          }
          if (typeof self.opts.beforeOpen !== 'function') {
            self._openContext = {};
          }
          if (Overlay.visible && Overlay.activeInstance === self && Overlay._minimized) {
            Overlay._applyMinimizedUi(self, false);
          }
          self.open($matched);
        });
      };
      this._containerCaptureClick = handler;
      containerEl.addEventListener('click', handler, true);
    },
    open: function (indexOrElement) {
      var self = this;
      this._beforeCollectContext = { trigger: 'open', openArg: indexOrElement };
      this._collectItems(function () {
        if (self.items.length === 0) {
          return;
        }
        var idx = 0;
        if (indexOrElement !== undefined && indexOrElement !== null) {
          if (typeof indexOrElement === 'number') {
            idx = Math.max(0, Math.min(indexOrElement, self.items.length - 1));
          } else {
            var el = indexOrElement && indexOrElement.jquery ? indexOrElement[0] : indexOrElement;
            for (var i = 0; i < self.items.length; i++) {
              if (self.items[i].$el && self.items[i].$el[0] === el) {
                idx = i;
                break;
              }
            }
          }
        }
        var item = self.items[idx];
        var $matched = (item && item.$el && item.$el.length) ? item.$el : $();
        if (typeof self.opts.beforeOpen === 'function') {
          self.idx = idx;
          self._slideshowPaused = false;
          self._slideshowPlaying = false;
          self._beforeOpenPhase = 'loading';
          self._pendingGateContent = null;
          self._openContext = {};
          Overlay.open(self);
          setTimeout(function () {
            if (typeof self.opts.beforeOpen !== 'function') {
              return;
            }
            self.opts.beforeOpen(item, $matched, function (arg) {
              if (arg && arg.gateContent) {
                self._pendingGateContent = arg.gateContent;
                self._openContext = {};
              } else {
                self._openContext = arg || {};
                self._pendingGateContent = null;
              }
              Overlay._finishBeforeOpenProceed(self);
            });
          }, 0);
          return;
        }
        self.idx = idx;
        self._slideshowPaused = false;
        self._slideshowPlaying = false;
        self._openContext = {};
        Overlay.open(self);
      });
    },
    close: function () {
      Overlay.close();
    },
    next: function (opts) {
      var self = this;
      this._beforeCollectContext = { trigger: 'next' };
      this._collectItems(function () {
        if (self.items.length < 2) {
          return;
        }
        if (self._slideshowTimer) {
          clearTimeout(self._slideshowTimer); self._slideshowTimer = null;
        }
        var currentItem = self.items[self.idx];
        var currentIdx = (currentItem && currentItem.$el) ? self._indexOfItemByElement(currentItem.$el) : self.idx;
        if (currentIdx < 0) {
          currentIdx = 0;
        }
        self._firePrevClose(self.items[currentIdx]);
        self.idx = self.opts.loop ? (currentIdx + 1) % self.items.length : Math.min(self.items.length - 1, currentIdx + 1);
        Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
      });
    },
    prev: function (opts) {
      var self = this;
      this._beforeCollectContext = { trigger: 'prev' };
      this._collectItems(function () {
        if (self.items.length < 2) {
          return;
        }
        if (self._slideshowTimer) {
          clearTimeout(self._slideshowTimer); self._slideshowTimer = null;
        }
        var currentItem = self.items[self.idx];
        var currentIdx = (currentItem && currentItem.$el) ? self._indexOfItemByElement(currentItem.$el) : self.idx;
        if (currentIdx < 0) {
          currentIdx = self.items.length - 1;
        }
        self._firePrevClose(self.items[currentIdx]);
        self.idx = self.opts.loop ? (currentIdx - 1 + self.items.length) % self.items.length : Math.max(0, currentIdx - 1);
        Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
      });
    },
    goTo: function (index, opts) {
      var self = this;
      this._beforeCollectContext = { trigger: 'goTo', index: index };
      this._collectItems(function () {
        if (self.items.length === 0) {
          return;
        }
        var idx = Math.max(0, Math.min(index, self.items.length - 1));
        if (idx === self.idx) {
          return;
        }
        if (self._slideshowTimer) {
          clearTimeout(self._slideshowTimer); self._slideshowTimer = null;
        }
        self._firePrevClose(self.items[self.idx]);
        self.idx = idx;
        Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
      });
    },
    currentItem: function () {
      return this.items[this.idx];
    },
    setTheme: function (theme) {
      if (theme !== 'dark' && theme !== 'light') {
        return;
      }
      this.opts.theme = theme;
      if (Overlay.activeInstance === this) {
        Overlay.$el[0].className = buildOverlayClassName(theme, Overlay.visible, Overlay.$el.hasClass('cv-closing'), this);
        Overlay._syncThemeToggle();
      }
      if (typeof this.opts.onThemeChange === 'function') {
        this.opts.onThemeChange(theme, this);
      }
    },
    refresh: function () {
      var wasOpen = Overlay.visible && Overlay.activeInstance === this;
      var self = this;
      this._beforeCollectContext = { trigger: 'refresh' };
      this._collectItems(function () {
        self._bindClicks();
        if (wasOpen && self.items.length) {
          self.idx = Math.min(self.idx, self.items.length - 1);
          Overlay.loadItem();
        } else if (wasOpen) {
          self.close();
        }
      });
    },
    showLoader: function () {
      if (Overlay.activeInstance === this && Overlay.$loader && Overlay.$loader.length) {
        Overlay.$loader.addClass('cv-active');
      }
    },
    hideLoader: function () {
      if (Overlay.activeInstance === this && Overlay.$loader && Overlay.$loader.length) {
        Overlay.$loader.removeClass('cv-active');
      }
    },
    showStripMessage: function (text, durationMs) {
      if (Overlay.activeInstance !== this) {
        return;
      }
      if (!Overlay.$stripMessage || !Overlay.$stripMessage.length) {
        return;
      }
      Overlay._showStripMessage(text, durationMs);
    },
    destroy: function () {
      var containerEl = this.$container && this.$container[0];
      if (containerEl && this._containerCaptureClick) {
        containerEl.removeEventListener('click', this._containerCaptureClick, true);
        this._containerCaptureClick = null;
      }
      this.$container.removeData('cv-instance');
      if (Overlay.$tooltip && Overlay.$tooltip.length) {
        Overlay.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true').remove();
        Overlay.$tooltip = $();
      }
      $('body .cv-tooltip').remove();
      if (Overlay.activeInstance === this) {
        Overlay.close();
      } else if (!Overlay.activeInstance && Overlay.$el && Overlay.$el.length) {
        Overlay.$el.remove();
        Overlay.built = false;
        Overlay.$el = null;
        Overlay.$shell = null; Overlay.$stage = null; Overlay.$stageWrap = null; Overlay.$toolbar = null;
        Overlay.$loader = null; Overlay.$prev = null; Overlay.$next = null; Overlay.$footer = null;
      }
      this.items = []; this.opts = null;
    },
    _firePrevClose: function (item) {
      if (typeof this.opts.onClose === 'function' && item) {
        this.opts.onClose(item, this);
      }
    }
  };

  /* --- JQUERY PLUGIN BRIDGE --- */

  $.fn[PLUGIN_NAME] = function (methodOrOptions) {
    if (typeof methodOrOptions === 'string') {
      var args = [].slice.call(arguments, 1),
        ret;
      this.each(function () {
        var inst = $(this).data('cv-instance');
        if (inst && typeof inst[methodOrOptions] === 'function') {
          ret = inst[methodOrOptions].apply(inst, args);
        }
      });
      return ret !== undefined ? ret : this;
    }
    Overlay._bindKeydownCaptureOnce();
    return this.each(function () {
      var $el = $(this);
      var existing = $el.data('cv-instance');
      if (existing && typeof existing.destroy === 'function') {
        existing.destroy();
      }
      $el.data('cv-instance', new ComponentViewer($el, methodOrOptions));
    });
  };

  /* Preserve the _cv namespace on the real plugin function */
  $.fn[PLUGIN_NAME]._cv = CV;
  $.fn[PLUGIN_NAME].defaults = DEFAULTS;
  $.fn[PLUGIN_NAME].Icons = Icons;
  $.fn[PLUGIN_NAME].defaultStrings = DEFAULT_STRINGS;

  $.fn[PLUGIN_NAME].getActive = function () {
    return Overlay.visible ? Overlay.activeInstance : null;
  };

  $[PLUGIN_NAME] = function (options) {
    var $container = $('<div>');
    $container[PLUGIN_NAME](options);
    return $container;
  };

  /* --- v3 registration API --- */
  CV.renderers = CV.renderers || {};
  CV.features = CV.features || {};
  CV.registerRenderer = function (type, fn) { CV.renderers[type] = fn; };
  CV.registerFeature = function (name, fn) { CV.features[name] = fn; };

  /* Register built-in error renderer */
  CV.renderers.error = function (item, $stage) {
    return builtInErrorRenderer(item, $stage);
  };

  /* --- expose Overlay on CV --- */
  CV.Overlay = Overlay;

}(jQuery, window, document));
