(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function parsePositiveDim (v) {
    if (v === null || v === undefined || v === '') {
      return 0;
    }
    var n = (typeof v === 'number') ? v : parseFloat(String(v).replace(/,/g, ''));
    return (isFinite(n) && n > 0) ? n : 0;
  }

  /**
   * When APIs mark "normalized" coords they may use 0..1, 0..100, or 0..1000 — not always unit interval.
   * Uses the largest corner value seen in the payload to pick a matching reference span.
   */
  function inferNormalizedRefDenomFromMax (mxy) {
    if (!isFinite(mxy) || mxy <= 0) {
      return 1;
    }
    if (mxy <= 1.01) {
      return 1;
    }
    if (mxy <= 101) {
      return 100;
    }
    if (mxy <= 1001) {
      return 1000;
    }
    return mxy;
  }

  function isOcrNormalizedCoordinateMode (data, resp) {
    if (!data && !resp) {
      return false;
    }
    if (data && data.coordinateSpace === 'normalized') {
      return true;
    }
    if (data && data.normalizedCoordinates === true) {
      return true;
    }
    if (resp && resp.normalizedCoordinates === true) {
      return true;
    }
    var rd = resp && resp.data;
    if (rd && rd.normalizedCoordinates === true) {
      return true;
    }
    return false;
  }

  /**
   * Word quad → axis-aligned box. Prefer corners 0 and 2 like TextExtraction.js; fallback min/max.
   */
  function extractWordBboxFromBox (box) {
    if (!box || !box.length) {
      return null;
    }
    if (box.length >= 3) {
      var p0 = box[0];
      var p2 = box[2];
      if (p0 && p2 && p0.length >= 2 && p2.length >= 2) {
        var x0 = Number(p0[0]);
        var y0 = Number(p0[1]);
        var x2 = Number(p2[0]);
        var y2 = Number(p2[1]);
        if (!isNaN(x0) && !isNaN(y0) && !isNaN(x2) && !isNaN(y2)) {
          return {
            x: Math.min(x0, x2),
            y: Math.min(y0, y2),
            w: Math.max(0, Math.abs(x2 - x0)),
            h: Math.max(0, Math.abs(y2 - y0))
          };
        }
      }
    }
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < box.length; i++) {
      var pt = box[i];
      if (!pt || pt.length < 2) {
        continue;
      }
      var x = Number(pt[0]);
      var y = Number(pt[1]);
      if (isNaN(x) || isNaN(y)) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (!isFinite(minX) || !isFinite(minY)) {
      return null;
    }
    return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
  }

  function scanLinesMaxExtents (lines) {
    var maxX = 0;
    var maxY = 0;
    for (var i = 0, il = lines.length; i < il; i++) {
      var line = lines[i];
      if (!line || !line.length) {
        continue;
      }
      for (var w = 0, wl = line.length; w < wl; w++) {
        var box = (line[w] && line[w].box) || [];
        for (var b = 0; b < box.length; b++) {
          var pt = box[b];
          if (!pt || pt.length < 2) {
            continue;
          }
          var x = Number(pt[0]);
          var y = Number(pt[1]);
          if (!isNaN(x)) {
            maxX = Math.max(maxX, x);
          }
          if (!isNaN(y)) {
            maxY = Math.max(maxY, y);
          }
        }
      }
    }
    return { maxX: maxX, maxY: maxY };
  }

  /**
   * Map OCR coords to the on-screen <img> element.
   * .cv-image uses object-fit:contain — letterboxing inside clientWidth × clientHeight.
   */
  function getCvImageContentMetrics (imgEl) {
    var reflowTrigger = imgEl.offsetWidth + imgEl.offsetHeight;
    if (!isFinite(reflowTrigger)) {
      return null;
    }
    var nw = imgEl.naturalWidth;
    var nh = imgEl.naturalHeight;
    var ow = imgEl.offsetWidth;
    var oh = imgEl.offsetHeight;
    var cw = (ow > 0 && oh > 0) ? ow : imgEl.clientWidth;
    var ch = (ow > 0 && oh > 0) ? oh : imgEl.clientHeight;
    if (!nw || !nh || !cw || !ch) {
      return null;
    }
    var fitScale = Math.min(cw / nw, ch / nh);
    var dispW = nw * fitScale;
    var dispH = nh * fitScale;
    return {
      nw: nw,
      nh: nh,
      cw: cw,
      ch: ch,
      fitScale: fitScale,
      dispW: dispW,
      dispH: dispH,
      offsetX: (cw - dispW) / 2,
      offsetY: (ch - dispH) / 2
    };
  }

  function resolveOcrReferenceSize (data, resp, lines, nw, nh) {
    data = data || {};
    var ext = scanLinesMaxExtents(lines);
    if (isOcrNormalizedCoordinateMode(data, resp)) {
      var explicitDenom = parsePositiveDim(
        data.normalizedDenominator || data.coordinateDenominator ||
        (resp && (resp.normalizedDenominator || resp.coordinateDenominator)) ||
        (resp && resp.data && (resp.data.normalizedDenominator || resp.data.coordinateDenominator))
      );
      if (explicitDenom) {
        return { refW: explicitDenom, refH: explicitDenom };
      }
      var mxy = Math.max(ext.maxX || 0, ext.maxY || 0);
      var denom = inferNormalizedRefDenomFromMax(mxy);
      return { refW: denom, refH: denom };
    }
    var explicitRefW = parsePositiveDim(
      data.imageWidth || data.sourceWidth || data.width || data.pageWidth ||
      data.ocrWidth || (resp && (resp.imageWidth || resp.sourceWidth || resp.width))
    );
    var explicitRefH = parsePositiveDim(
      data.imageHeight || data.sourceHeight || data.height || data.pageHeight ||
      data.ocrHeight || (resp && (resp.imageHeight || resp.sourceHeight || resp.height))
    );
    if (explicitRefW > nw * 1.04 && ext.maxX > 0 && ext.maxX <= nw + 2) {
      explicitRefW = 0;
    }
    if (explicitRefH > nh * 1.04 && ext.maxY > 0 && ext.maxY <= nh + 2) {
      explicitRefH = 0;
    }
    if (!explicitRefW && !explicitRefH && ext.maxX > 0 && ext.maxY > 0 &&
      ext.maxX <= 1.01 && ext.maxY <= 1.01) {
      return { refW: 1, refH: 1 };
    }
    var refW = explicitRefW;
    var refH = explicitRefH;
    if (!refW) {
      refW = nw;
    }
    if (!refH) {
      refH = nh;
    }
    if (!explicitRefW && ext.maxX > 1) {
      refW = ext.maxX;
    } else if (ext.maxX > nw + 0.5) {
      refW = Math.max(refW, ext.maxX);
    }
    if (!explicitRefH && ext.maxY > 1) {
      refH = ext.maxY;
    } else if (ext.maxY > nh + 0.5) {
      refH = Math.max(refH, ext.maxY);
    }
    return { refW: refW, refH: refH };
  }

  /** When OCR omits image size, use the loaded viewer bitmap (natural pixels) as reference width/height. */
  function applyViewerImageDimsToOcrResponse (resp, imgEl) {
    if (!resp || !imgEl) {
      return;
    }
    var nw = imgEl.naturalWidth;
    var nh = imgEl.naturalHeight;
    if (!nw || !nh) {
      return;
    }
    resp.data = resp.data || {};
    var d = resp.data;
    if (!parsePositiveDim(d.imageWidth || d.sourceWidth || d.width || d.pageWidth || d.ocrWidth)) {
      d.imageWidth = nw;
    }
    if (!parsePositiveDim(d.imageHeight || d.sourceHeight || d.height || d.pageHeight || d.ocrHeight)) {
      d.imageHeight = nh;
    }
  }

  function buildExtractOverlay ($img, resp) {
    var el = $img[0];
    if (el) {
      applyViewerImageDimsToOcrResponse(resp, el);
    }
    var data = (resp && resp.data) || {};
    var lines = data.lines || (resp && resp.lines);
    if (!lines || !lines.length) {
      return null;
    }
    if (!el) {
      return null;
    }
    var m = getCvImageContentMetrics(el);
    if (!m) {
      return null;
    }
    var ref = resolveOcrReferenceSize(data, resp, lines, m.nw, m.nh);
    var letterboxed = (m.offsetX > 0.5 || m.offsetY > 0.5);
    var sx;
    var sy;
    var ox;
    var oy;
    if (letterboxed) {
      sx = m.fitScale * (m.nw / ref.refW);
      sy = m.fitScale * (m.nh / ref.refH);
      ox = m.offsetX;
      oy = m.offsetY;
    } else {
      sx = m.cw / ref.refW;
      sy = m.ch / ref.refH;
      ox = 0;
      oy = 0;
    }
    var TOP_ADJ = 2;
    var HEIGHT_PAD = 5;
    var html = '';
    var fsMin = 7;
    var CHAR_W = 0.55;
    for (var i = 0, len = lines.length; i < len; i++) {
      var line = lines[i];
      if (!line || !line.length) {
        continue;
      }
      for (var w = 0, wl = line.length; w < wl; w++) {
        var info = line[w];
        var box = (info && info.box) || [];
        var bb = extractWordBboxFromBox(box);
        if (!bb) {
          continue;
        }
        var left = Math.round(ox + bb.x * sx);
        var top = Math.round(oy + (bb.y - TOP_ADJ) * sy);
        var width = Math.max(1, Math.round(bb.w * sx));
        var rawH = bb.h;
        var height = Math.round((rawH + HEIGHT_PAD) * sy);
        var wordStr = String((info && info.word) != null ? info.word : '');
        var wordLen = wordStr.length || 1;
        var fsFromH = Math.floor((rawH - HEIGHT_PAD) * sy);
        var fsFromW = Math.floor(width / (CHAR_W * wordLen));
        var fs = Math.max(fsMin, Math.min(fsFromH, isFinite(fsFromW) ? fsFromW : fsFromH));
        html += '<span class="cv-extract-word" style="left:' + left + 'px;top:' + top + 'px;width:' + width + 'px;height:' + height + 'px;font-size:' + fs + 'px">' + U.escHtml(wordStr) + '</span>';
      }
    }
    if (!html) {
      return null;
    }
    var $overlay = $('<div class="cv-extract-overlay"><div class="cv-extract-layer">' + html + '</div></div>');
    $overlay.find('.cv-extract-layer').css({
      width: m.cw,
      height: m.ch
    });
    return $overlay;
  }

  function removeExtractOverlay ($stage) {
    $stage.find('.cv-extract-overlay').remove();
  }

  CV.registerFeature('extract', function (overlay, utils) {
    CV.Utils.buildExtractOverlay = buildExtractOverlay;
    CV.Utils.removeExtractOverlay = removeExtractOverlay;
    CV.Utils.getCvImageContentMetrics = getCvImageContentMetrics;
  });

})(jQuery);
