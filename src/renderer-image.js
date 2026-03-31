(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function isGifItem (inst) {
    if (!inst || !inst.items || inst.idx < 0) {
      return false;
    }
    var item = inst.items[inst.idx];
    return (item.type || 'image') === 'image' && item.src && (/\.gif$/i).test(item.src);
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

  function builtInImageRenderer (item, $stage, inst, overlay) {
    var srcUrl = U.getResolvedSrcUrl(item, inst);
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      U.showError($stage, 'image', 'Invalid or unsafe image URL', item, { noDownload: true });
      return { imageError: true };
    }
    var $wrap = $('<div class="cv-img-wrap"></div>');
    var $stack = $('<div class="cv-img-transform"></div>');
    overlay.$loader.addClass('cv-active');
    var altText = (!U.isNullish(item.title) && String(item.title).trim() !== '') ? String(item.title) : '';
    var $img = $('<img class="cv-image" alt="' + U.escHtml(altText) + '" />');
    var imgEl = $img[0];
    function onImageReady () {
      overlay.$loader.removeClass('cv-active');
      $img.addClass('cv-loaded');
      syncCvImgTransformDimensions(imgEl);
      overlay._clampPan();
      overlay._applyTransform();
    }
    imgEl.onload = function () {
      if (overlay.activeInstance !== inst) {
        return;
      }
      if (typeof imgEl.decode === 'function') {
        imgEl.decode().then(onImageReady).catch(function () {
          requestAnimationFrame(onImageReady);
        });
      } else {
        requestAnimationFrame(onImageReady);
      }
    };
    imgEl.onerror = function () {
      overlay.$loader.removeClass('cv-active');
      $wrap.remove();
      $stage.empty();
      U.showError($stage, 'image', 'Image could not be loaded', item, { noDownload: !U.getItemDownloadUrl(item, inst) });
      if (inst) {
        overlay._resolveToolbar(inst, { imageError: true });
      }
    };
    $stack.append($img);
    $wrap.append($stack);
    $stage.append($wrap);
    imgEl.src = srcUrl;
    return {};
  }

  CV.registerRenderer('image', builtInImageRenderer);

  CV.Utils.isGifItem = isGifItem;
  CV.Utils.syncCvImgTransformDimensions = syncCvImgTransformDimensions;

})(jQuery);
