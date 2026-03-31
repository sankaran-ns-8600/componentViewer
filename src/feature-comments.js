/**
 * ComponentViewer v3 — Comments feature
 *
 * Injects comment normalization and rendering methods into the overlay.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function initComments (overlay) {

    overlay._normalizeComments = function (item) {
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
    };

    overlay._renderCommentAt = function (inst, list, index) {
      if (!list || !list.length || index < 0 || index >= list.length) {
        return;
      }
      var c = list[index];
      var titleText = (!U.isNullish(c.title)) ? String(c.title).trim() : '';
      var authorText = (!U.isNullish(c.author)) ? String(c.author).trim() : '';
      var text = (!U.isNullish(c.text)) ? String(c.text).trim() : '';
      overlay.$commentTitle.text(titleText).toggle(titleText !== '');
      overlay.$commentAuthor.text(authorText ? (U.str(inst, 'commentBy') + ' ' + authorText) : '').toggle(authorText !== '');
      overlay.$commentSep.toggle(titleText !== '' || authorText !== '');
      overlay.$commentInner.text(text).toggle(text !== '');
      overlay.$commentCounter.text(U.str(inst, 'commentCounter').replace('%1', String(index + 1)).replace('%2', String(list.length)));
      if (inst.opts.wcag) {
        overlay.$commentPrev.attr('aria-label', U.str(inst, 'commentPrev'));
        overlay.$commentNext.attr('aria-label', U.str(inst, 'commentNext'));
      }
    };
  }

  CV.registerFeature('comments', initComments);

}(jQuery));
