/**
 * ComponentViewer v3 — HTML / iframe renderer
 *
 * Registers the "html" built-in renderer.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function isHtmlMarkdownFileItem (item, inst) {
    if (!item || item.type !== 'html') {
      return false;
    }
    var ext = String(item.fileExt || '').toLowerCase().replace(/^\./, '');
    if (ext === 'md' || ext === 'markdown') {
      return true;
    }
    if (/\.(md|markdown)$/i.test(String(item.title || ''))) {
      return true;
    }
    var src = String((inst ? (U.getResolvedSrcUrl(item, inst) || item.src) : item.src) || '');
    return (/\.(md|markdown)(\?|#|$)/i).test(src);
  }

  function htmlItemHasIframeSrc (item, inst) {
    var src = U.getResolvedSrcUrl(item, inst) || item.src;
    return Boolean(src && U.isSafeResourceUrl(src));
  }

  function shouldShowHtmlMdSourceToolbarButton (item, inst) {
    if (!inst || !inst.opts) {
      return false;
    }
    var tb = inst.opts.toolbar || {};
    if (tb.toggleSource !== true) {
      return false;
    }
    if (typeof inst.opts.resolveMarkdownToggleUrl !== 'function') {
      return false;
    }
    return isHtmlMarkdownFileItem(item, inst) && htmlItemHasIframeSrc(item, inst);
  }

  function builtInHtmlRenderer (item, $stage, inst, overlay) {
    var src = U.getResolvedSrcUrl(item, inst) || item.src;
    var html = item.html;
    if (src && U.isSafeResourceUrl(src)) {
      if (inst) {
        inst._htmlMdShowingSource = false;
      }
      var titleAttr = (!U.isNullish(item.title) && String(item.title).trim() !== '') ? String(item.title).trim().replace(/"/g, '&quot;') : '';
      var $wrap = $('<div class="cv-html-iframe-wrap cv-html-iframe-loading"></div>');
      var $iframeLoader = $('<div class="cv-html-iframe-loader" aria-hidden="true"><div class="cv-spinner" role="presentation"></div></div>');
      var $iframe = $('<iframe class="cv-html-iframe cv-stage-iframe"></iframe>');
      if (titleAttr) {
        $iframe.attr('title', titleAttr);
      }
      if (inst && inst.opts && inst.opts.wcag) {
        $iframe.attr('aria-busy', 'true');
      }
      var finished = false;
      var fallbackTid = null;
      var onIframeSettled = function () {
        if (finished) {
          return;
        }
        finished = true;
        if (fallbackTid !== null) {
          clearTimeout(fallbackTid);
          fallbackTid = null;
        }
        $iframe.off('.cvHtmlSrc');
        setTimeout(function () {
          if ($iframeLoader && $iframeLoader.length) {
            $iframeLoader.remove();
          }
          $wrap.removeClass('cv-html-iframe-loading');
        }, 500);
        if (inst && inst.opts && inst.opts.wcag) {
          $iframe.removeAttr('aria-busy');
        }
      };
      $iframe.on('load.cvHtmlSrc', onIframeSettled);
      $iframe.on('error.cvHtmlSrc', onIframeSettled);
      $wrap.append($iframeLoader);
      $wrap.append($iframe);
      $stage.append($wrap);
      $iframe.attr('src', src);
      fallbackTid = setTimeout(onIframeSettled, 120000);
      return {
        destroy: function () {
          if (fallbackTid !== null) {
            clearTimeout(fallbackTid);
            fallbackTid = null;
          }
          $iframe.off('.cvHtmlSrc');
          if (!finished) {
            onIframeSettled();
          }
        }
      };
    }
    if (U.isNullish(html) || (typeof html === 'string' && String(html).trim() === '')) {
      U.showError($stage, 'html', 'No HTML or src provided for html view', item);
      return null;
    }
    overlay.$loader.addClass('cv-active');
    if (typeof html === 'string') {
      $stage.append($(html));
    } else if (html.jquery) {
      $stage.append(html);
    } else if (html.nodeType) {
      $stage.append(html);
    } else {
      overlay.$loader.removeClass('cv-active');
      U.showError($stage, 'html', 'No HTML provided for html view', item);
      return null;
    }
    setTimeout(function () {
      overlay.$loader.removeClass('cv-active');
    }, 120);
    return {};
  }

  /* Expose helper on Utils — core toolbar logic needs it */
  U.shouldShowHtmlMdSourceToolbarButton = shouldShowHtmlMdSourceToolbarButton;

  CV.registerRenderer('html', builtInHtmlRenderer);

}(jQuery));
