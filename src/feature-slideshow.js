/**
 * ComponentViewer v3 — Slideshow feature
 *
 * Injects slideshow progress-bar and play/pause button methods into the overlay.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  var SLIDESHOW_DEFAULT_INTERVAL = 4;

  function initSlideshow (overlay) {

    overlay._startSlideshowProgress = function (intervalMs) {
      if (!overlay.$slideshowProgressWrap || !overlay.$slideshowProgressBar.length) {
        return;
      }
      overlay.$slideshowProgressBar.css({ transition: 'none', width: '0%' });
      overlay.$slideshowProgressWrap.show();
      var bar = overlay.$slideshowProgressBar[0];
      if (bar) {
        bar.getBoundingClientRect();
      }
      overlay.$slideshowProgressBar.css({ transition: 'width ' + intervalMs + 'ms linear', width: '100%' });
    };

    overlay._stopSlideshowProgress = function () {
      if (!overlay.$slideshowProgressWrap || !overlay.$slideshowProgressBar.length) {
        return;
      }
      overlay.$slideshowProgressWrap.hide();
      overlay.$slideshowProgressBar.css({ transition: 'none', width: '0%' });
    };

    overlay._slideshowButtonItem = function (inst) {
      var ss = inst.opts.slideshow;
      if (!ss || !ss.enabled || !inst.items || inst.items.length < 2) {
        return null;
      }
      if (ss.autoStart === true && ss.hideSlideshowButton === true) {
        return null;
      }
      var running = !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying);
      var intervalMs = (!U.isNullish(ss.interval) && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
      return {
        id: 'slideshow',
        className: 'cv-slideshow-btn',
        showLabel: true,
        label: running ? U.str(inst, 'pauseSlideshow') : U.str(inst, 'playSlideshow'),
        onClick: function () {
          var r = !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying);
          var $btn = overlay.$toolbar.find('.cv-slideshow-btn');
          if (r) {
            inst._slideshowPaused = true;
            if (inst._slideshowTimer) {
              clearTimeout(inst._slideshowTimer);
              inst._slideshowTimer = null;
            }
            overlay._stopSlideshowProgress();
            var playSlideshowStr = U.str(inst, 'playSlideshow');
            U.setToolbarBtnPresentation($btn, inst, { label: playSlideshowStr, tooltip: playSlideshowStr });
          } else {
            inst._slideshowPaused = false;
            inst._slideshowPlaying = true;
            inst._slideshowTimer = setTimeout(function () {
              if (overlay.activeInstance === inst) {
                inst.next({ transition: true });
              }
            }, intervalMs);
            if (ss.showProgress) {
              overlay._startSlideshowProgress(intervalMs);
            }
            var pauseSlideshowStr = U.str(inst, 'pauseSlideshow');
            U.setToolbarBtnPresentation($btn, inst, { label: pauseSlideshowStr, tooltip: pauseSlideshowStr });
          }
        }
      };
    };
  }

  CV.registerFeature('slideshow', initSlideshow);

}(jQuery));
