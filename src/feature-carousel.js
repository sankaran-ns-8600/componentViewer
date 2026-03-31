/**
 * ComponentViewer v3 — Carousel feature
 *
 * Injects carousel-related methods into the overlay singleton.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function initCarousel (overlay) {

    overlay._carouselEnabled = function (inst) {
      if (!inst) {
        return false;
      }
      var c = inst.opts.carousel;
      return Boolean(c && c.enabled);
    };

    overlay._carouselNavThreshold = function (inst) {
      if (!inst) {
        return 4;
      }
      var c = inst.opts.carousel;
      return (c && c.navThreshold !== null && c.navThreshold !== undefined) ? c.navThreshold : 4;
    };

    overlay._buildCarousel = function (inst) {
      var self = overlay;
      self.$carousel.empty();
      var items = inst.items;
      var truncate = function (s, maxLen) {
        if (U.isNullish(s) || s === '') {
          return '';
        }
        var str = String(s).trim();
        if (str.length <= maxLen) {
          return str;
        }
        return str.slice(0, maxLen - 1) + '\u2026';
      };
      for (var i = 0; i < items.length; i++) {
        (function (idx) {
          var item = items[idx];
          var type = item.type || 'image';
          if ((type === 'audio' || type === 'video') && U.isImageLikeExtension(item)) {
            type = 'image';
          }
          var thumbSrc = null;
          var resolvedThumb = U.getResolvedUrl(item, inst, 'thumbnailUrl') || item.thumbnailUrl;
          var resolvedItemSrc = U.getResolvedUrl(item, inst, 'src') || item.src;
          if (type === 'image' && (resolvedThumb || resolvedItemSrc) && U.isSafeResourceUrl(resolvedThumb || resolvedItemSrc)) {
            thumbSrc = (resolvedThumb && U.isSafeResourceUrl(resolvedThumb)) ? resolvedThumb : resolvedItemSrc;
          } else if ((type === 'video' || type === 'audio') && resolvedThumb && U.isSafeResourceUrl(resolvedThumb)) {
            thumbSrc = resolvedThumb;
          }
          var typeLabel;
          if (type === 'pdf') {
            typeLabel = 'PDF';
          } else if (type === 'video') {
            typeLabel = 'Video';
          } else if (type === 'audio') {
            typeLabel = 'Audio';
          } else if (type === 'inline') {
            typeLabel = 'Code';
          } else if (type === 'markdown') {
            typeLabel = 'MD';
          } else if (type === 'html') {
            typeLabel = 'HTML';
          } else if (type === 'error') {
            typeLabel = '\u2014';
          } else {
            typeLabel = (item.fileExt || type).slice(0, 4);
          }
          var title = (!U.isNullish(item.title) && item.title !== '') ? String(item.title).trim() : '';
          var $item = $('<button type="button" class="cv-carousel-item" data-cv-index="' + idx + '"></button>');
          if (thumbSrc) {
            var $img = $('<img class="cv-carousel-thumb" alt="">').attr('src', thumbSrc);
            $img.on('error', function () {
              $item.addClass('cv-carousel-no-thumb');
            });
            $item.append($img);
            if (type === 'video' || type === 'audio') {
              $item.append($('<span class="cv-carousel-play-icon">' + U.Icons.play + '</span>'));
            }
          } else {
            $item.addClass('cv-carousel-no-thumb').text(title ? truncate(title, 12) : typeLabel);
          }
          if (title) {
            $item.attr('title', title);
          }
          if (inst.opts.wcag) {
            $item.attr('aria-label', U.str(inst, 'carouselItemLabel').replace('%1', String(idx + 1)).replace('%2', String(inst.items.length)));
          }
          $item.on('click', function (e) {
            e.preventDefault();
            if (inst !== self.activeInstance) {
              return;
            }
            if (idx === inst.idx) {
              return;
            }
            inst.goTo(idx);
          });
          self.$carousel.append($item);
        }(i));
      }
      self._updateCarouselSelection(inst);
      self._updateCarouselNavVisibility(inst);
    };

    overlay._updateCarouselNavVisibility = function (inst) {
      if (!inst || !overlay._carouselEnabled(inst)) {
        return;
      }
      var threshold = overlay._carouselNavThreshold(inst);
      var showNav = inst.items.length > threshold;
      overlay.$carouselPrev.toggle(showNav);
      overlay.$carouselNext.toggle(showNav);
    };

    overlay._updateCarouselSelection = function (inst) {
      if (!inst || !overlay._carouselEnabled(inst)) {
        return;
      }
      overlay.$carousel.find('.cv-carousel-item').removeClass('cv-active').attr('aria-current', null);
      var $current = overlay.$carousel.find('.cv-carousel-item[data-cv-index="' + inst.idx + '"]');
      $current.addClass('cv-active').attr('aria-current', 'true');
      var el = $current[0];
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    };

    overlay._scrollCarouselBy = function (stepPx, inst) {
      var el = overlay.$carousel && overlay.$carousel[0];
      if (!el) {
        return;
      }
      var directionStep = overlay._isRtl(inst) ? -stepPx : stepPx;
      if (typeof el.scrollBy === 'function') {
        el.scrollBy({ left: directionStep, behavior: 'smooth' });
      } else {
        el.scrollLeft += directionStep;
      }
    };
  }

  CV.registerFeature('carousel', initCarousel);

}(jQuery));
