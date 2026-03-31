/**
 * ComponentViewer v3 — Minimize / restore feature
 *
 * Injects minimize-related methods into the overlay singleton.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function initMinimize (overlay) {

    overlay._canMinimize = function (inst) {
      var cfg = inst && inst.opts && inst.opts.minimize;
      return Boolean(cfg && cfg.enabled !== false);
    };

    overlay._captureMinimizedSnapshot = function (inst) {
      if (!inst || !inst.items || inst.idx < 0 || inst.idx >= inst.items.length) {
        overlay._minimizedSnapshot = null;
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
      overlay._minimizedSnapshot = {
        items: listSnapshot,
        item: snapItem,
        $el: current && current.$el ? current.$el : null,
        idx: inst.idx
      };
    };

    overlay._applyMinimizedUi = function (inst, minimized) {
      overlay._minimized = Boolean(minimized);
      overlay.$el.toggleClass('cv-minimized', overlay._minimized);
      overlay.$restoreFab.toggle(overlay._minimized);
      if (overlay.visible) {
        if (overlay._minimized) {
          document.body.style.overflow = !U.isNullish(overlay._bodyOverflow) ? overlay._bodyOverflow : '';
        } else {
          document.body.style.overflow = 'hidden';
        }
      }
      if (!inst) {
        return;
      }
      if (inst.opts.canShowTooltip !== false) {
        overlay.$minimizeToggle.attr('data-cv-tooltip', U.str(inst, 'minimize'));
        overlay.$restoreFab.attr('data-cv-tooltip', U.str(inst, 'restoreViewer'));
      } else {
        overlay.$minimizeToggle.removeAttr('data-cv-tooltip');
        overlay.$restoreFab.removeAttr('data-cv-tooltip');
      }
      if (inst.opts.wcag) {
        overlay.$minimizeToggle.attr('aria-label', U.str(inst, 'minimize'));
        overlay.$restoreFab.attr('aria-label', U.str(inst, 'restoreViewer'));
      } else {
        overlay.$minimizeToggle.removeAttr('aria-label');
        overlay.$restoreFab.removeAttr('aria-label');
      }
    };

    overlay._restoreFromMinimized = function () {
      var inst = overlay.activeInstance;
      if (!inst) {
        return;
      }
      overlay._applyMinimizedUi(inst, false);
      var snap = overlay._minimizedSnapshot;
      inst._beforeCollectContext = { trigger: 'restore' };
      inst._collectItems(function () {
        if (!inst.items.length && snap && snap.items && snap.items.length) {
          inst.items = $.extend(true, [], snap.items);
          inst.idx = Math.max(0, Math.min((!U.isNullish(snap.idx) ? snap.idx : 0), inst.items.length - 1));
          overlay.loadItem();
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
            inst.idx = Math.max(0, Math.min((!U.isNullish(snap.idx) ? snap.idx : 0), inst.items.length - 1));
            overlay.loadItem();
            return;
          }
        }
        inst.idx = restoreIdx;
        overlay.loadItem();
      });
    };
  }

  CV.registerFeature('minimize', initMinimize);

}(jQuery));
