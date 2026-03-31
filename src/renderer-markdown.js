/**
 * ComponentViewer v3 — Markdown renderer
 *
 * Registers the "markdown" built-in renderer.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function minimalMarkdownToHtml (text) {
    if (U.isNullish(text) || typeof text !== 'string') {
      return '';
    }
    var s = U.escHtml(text);
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\n/g, '<br>\n');
    return s;
  }

  function builtInMarkdownRenderer (item, $stage, inst, overlay) {
    function getMarkdownRenderer () {
      if (typeof window.marked === 'function' || (window.marked && typeof window.marked.parse === 'function')) {
        return function (md) {
          return window.marked.parse ? window.marked.parse(md) : window.marked(md);
        };
      }
      return minimalMarkdownToHtml;
    }

    function sanitizeHtml (html) {
      if (typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(html);
      }
      if (inst && inst.opts && typeof inst.opts.sanitizeMarkdown === 'function') {
        return inst.opts.sanitizeMarkdown(html);
      }
      return html;
    }

    function showMarkdown (html) {
      var $wrap = $('<div class="cv-markdown-body"></div>').html(sanitizeHtml(html));
      $stage.append($wrap);
    }

    if (!U.isNullish(item.content) && typeof item.content === 'string') {
      var renderer = getMarkdownRenderer();
      var raw = item.content;
      var html = renderer(raw);
      if (inst) {
        inst._markdownRaw = raw;
        inst._markdownHtml = html;
        inst._markdownViewMode = 'rendered';
      }
      showMarkdown(html);
      return {};
    }
    var markdownSrcUrl = U.getResolvedSrcUrl(item, inst) || item.src;
    if (markdownSrcUrl && U.isSafeResourceUrl(markdownSrcUrl)) {
      var fetchUrl = markdownSrcUrl;
      if (fetchUrl.indexOf('http') !== 0 && fetchUrl.indexOf('blob') !== 0 && fetchUrl.indexOf('data:') !== 0) {
        try {
          fetchUrl = new URL(fetchUrl, window.location.href).href;
        } catch (e) {}
      }
      if (inst) {
        inst._markdownViewMode = 'rendered';
        inst._markdownRaw = null;
        inst._markdownHtml = null;
      }
      overlay.$loader.addClass('cv-active');
      var $placeholder = $('<div class="cv-markdown-body"><div class="cv-inline-loading"><div class="cv-inline-spinner"></div></div></div>');
      $stage.append($placeholder);
      fetch(fetchUrl, { method: 'GET', credentials: 'include' })
        .then(function (r) {
          if (!r.ok) {
            throw new Error('HTTP ' + r.status);
          }
          return r.text();
        })
        .then(function (text) {
          var renderer = getMarkdownRenderer();
          var html = renderer(text);
          if (inst) {
            inst._markdownRaw = text;
            inst._markdownHtml = html;
          }
          $placeholder.html(sanitizeHtml(html));
          overlay.$loader.removeClass('cv-active');
        })
        .catch(function () {
          $placeholder.remove();
          overlay.$loader.removeClass('cv-active');
          U.showError($stage, 'markdown', 'Could not load file for markdown view', item);
        });
      return {};
    }
    U.showError($stage, 'markdown', 'No content or invalid URL for markdown view', item);
    return null;
  }

  CV.registerRenderer('markdown', builtInMarkdownRenderer);

}(jQuery));
