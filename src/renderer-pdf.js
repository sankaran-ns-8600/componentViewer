/**
 * ComponentViewer v3 — PDF Renderer
 *
 * Provides two renderers:
 *   builtInPdfIframeRenderer  – simple <iframe> fallback
 *   builtInPdfRenderer        – full PDF.js-based renderer with thumbnails,
 *                                zoom, rotation, text-layer, annotations,
 *                                two-page spread, and print support
 *
 * Depends on: utils.js, core.js (loaded first).
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  /* ------------------------------------------------------------------ */
  /*  Iframe fallback                                                    */
  /* ------------------------------------------------------------------ */

  function builtInPdfIframeRenderer (item, $stage, inst, overlay) {
    var srcUrl = U.getResolvedSrcUrl(item, inst);
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      return null;
    }
    var $wrap   = $('<div class="cv-pdf-iframe-wrap"></div>');
    var $iframe = $('<iframe class="cv-pdf-iframe" title="PDF"></iframe>');
    $iframe.attr('src', srcUrl);
    $wrap.append($iframe);
    $stage.append($wrap);
    return {};
  }

  /* ------------------------------------------------------------------ */
  /*  Full PDF.js renderer                                               */
  /* ------------------------------------------------------------------ */

  function builtInPdfRenderer (item, $stage, inst, overlay) {
    if (typeof window.pdfjsLib === 'undefined') {
      return builtInPdfIframeRenderer(item, $stage, inst, overlay);
    }
    var srcUrl = U.getResolvedSrcUrl(item, inst) || item.src;
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      return null;
    }

    var pdfOpts         = inst.opts.pdf || {};
    var showAnnotations = pdfOpts.annotations !== false;
    var useAutoFit      = pdfOpts.autoFit !== false;
    var minScale        = (typeof pdfOpts.autoFitMinScale === 'number' ? pdfOpts.autoFitMinScale : 0.75);
    var maxScale        = (typeof pdfOpts.autoFitMaxScale === 'number' ? pdfOpts.autoFitMaxScale : 2.5);
    var enableTextLayer = pdfOpts.textLayer !== false;
    var onPrint         = typeof pdfOpts.onPrint === 'function' ? pdfOpts.onPrint : null;
    var twoPageView     = false;
    var TWO_PAGE_GAP    = 12;

    var $container = $(
      '<div class="cv-pdf-wrap">' +
        '<div class="cv-pdf-sidebar" style="display:none"><div class="cv-pdf-thumbs"></div></div>' +
        '<div class="cv-pdf-main"><div class="cv-pdf-main-inner"><div class="cv-pdf-canvas-wrap"></div></div></div>' +
      '</div>'
    );

    var $sidebar   = $container.find('.cv-pdf-sidebar');
    var $thumbs    = $container.find('.cv-pdf-thumbs');
    var $main      = $container.find('.cv-pdf-main');
    var $canvasWrap = $container.find('.cv-pdf-canvas-wrap');

    var pdfDoc    = null,
      pageNum     = 1,
      totalPages  = 0;
    var pdfScale  = 1.0,
      rotation    = 0;
    var rendering = false;
    var pdfResizeTid    = null;
    var scrollTid       = null;
    var zoomRenderTid   = null;
    var pendingZoomRender = false;
    var textLayerVisible  = false;
    var $zoomSelect       = null;
    var zoomPresetsPct    = [50, 75, 100, 125, 150, 175, 200, 225, 250];
    var $pageInfo         = null;
    var pageEditing       = false;
    var $tbExtract        = null;

    /* ---------- scale helpers ---------- */

    function clampPdfScale (s) {
      return Math.max(0.25, Math.min(5, s));
    }
    function nearestPresetPct (scale) {
      var pct = Math.round(scale * 100);
      var best = zoomPresetsPct[0],
        bestD = Math.abs(pct - best);
      for (var i = 1; i < zoomPresetsPct.length; i++) {
        var d = Math.abs(pct - zoomPresetsPct[i]);
        if (d < bestD) {
          bestD = d; best = zoomPresetsPct[i];
        }
      }
      return best;
    }
    function syncZoomSelect () {
      if (!$zoomSelect || !$zoomSelect.length) {
        return;
      }
      if (useAutoFit) {
        $zoomSelect.val('autofit'); return;
      }
      $zoomSelect.val(String(nearestPresetPct(pdfScale)));
    }
    function onZoomRenderDone () {
      zoomRenderTid = null;
      if (pendingZoomRender) {
        pendingZoomRender = false;
        renderAllPages(function () {
          syncZoomSelect(); onZoomRenderDone();
        });
      }
    }
    function scheduleZoomRender () {
      clearTimeout(zoomRenderTid);
      zoomRenderTid = setTimeout(function () {
        if (rendering) {
          pendingZoomRender = true;
          return;
        }
        renderAllPages(function () {
          syncZoomSelect(); onZoomRenderDone();
        });
      }, 100);
    }
    function setPdfScaleManual (nextScale) {
      useAutoFit = false;
      pdfScale = clampPdfScale(nextScale);
      syncZoomSelect();
      scheduleZoomRender();
    }

    /* ---------- auto-fit ---------- */

    function applyAutoFitScale () {
      if (!useAutoFit || !pdfDoc) {
        return;
      }
      var size = getStageSize();
      pdfDoc.getPage(1).then(function (page) {
        var vp1 = page.getViewport({ scale: 1, rotation: rotation });
        if (size.w > 0 && size.h > 0) {
          var fitScale;
          if (twoPageView) {
            fitScale = Math.min((size.w - TWO_PAGE_GAP) / (2 * vp1.width), size.h / vp1.height);
          } else {
            fitScale = Math.min(size.w / vp1.width, size.h / vp1.height);
          }
          pdfScale = Math.max(minScale, Math.min(fitScale, maxScale));
        }
        renderAllPages();
        syncZoomSelect();
      });
    }

    /* ---------- scroll-based current-page tracking ---------- */

    function updateCurrentPageFromScroll () {
      if (!pdfDoc || totalPages < 1) {
        return;
      }
      var main = $main[0];
      if (!main) {
        return;
      }
      var mainRect = main.getBoundingClientRect();
      var pages = $canvasWrap.find('.cv-pdf-page');
      var best = 1;
      var bestVisible = 0;
      for (var i = 0; i < pages.length; i++) {
        var el = pages[i];
        var num = parseInt(el.getAttribute('data-page'));
        if (!num) {
          continue;
        }
        var rect = el.getBoundingClientRect();
        var overlapTop    = Math.max(mainRect.top, rect.top);
        var overlapBottom = Math.min(mainRect.bottom, rect.bottom);
        var visible = Math.max(0, overlapBottom - overlapTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = num;
        }
      }
      if (pageNum !== best) {
        pageNum = best;
        updatePageInfoDisplay();
        $thumbs.find('.cv-pdf-thumb').removeClass('cv-active');
        $thumbs.find('[data-page="' + pageNum + '"]').addClass('cv-active');
      }
    }

    /* ---------- page rendering ---------- */

    function renderPageToContainer ($parent, num, done) {
      pdfDoc.getPage(num).then(function (page) {
        var vp = page.getViewport({ scale: pdfScale, rotation: rotation });
        var $pageWrap = $('<div class="cv-pdf-page"></div>');
        $pageWrap.attr('data-page', num);
        $pageWrap.css({ position: 'relative', width: vp.width + 'px', height: vp.height + 'px' });

        var canvas = document.createElement('canvas');
        canvas.width  = vp.width;
        canvas.height = vp.height;
        canvas.className = 'cv-pdf-canvas';
        $pageWrap.append(canvas);
        $parent.append($pageWrap);

        var renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        var renderPromise = renderTask.promise || renderTask;
        renderPromise.then(function () {
          if (showAnnotations) {
            renderAnnotations(page, vp, $pageWrap);
          }
          if (enableTextLayer && textLayerVisible && typeof page.getTextContent === 'function') {
            page.getTextContent().then(function (tc) {
              renderTextLayerForPage(tc, vp, $pageWrap);
            });
          }
          if (done) {
            done();
          }
        });
      });
    }

    function renderOnePage (num, done) {
      renderPageToContainer($canvasWrap, num, done);
    }

    function renderSpread (leftNum, rightNum, done) {
      var $spread = $('<div class="cv-pdf-spread"></div>');
      $canvasWrap.append($spread);
      var pending = rightNum ? 2 : 1;
      function onOne () {
        pending--;
        if (pending === 0 && done) {
          done();
        }
      }
      renderPageToContainer($spread, leftNum, onOne);
      if (rightNum) {
        renderPageToContainer($spread, rightNum, onOne);
      }
    }

    function renderAllPages (done) {
      if (rendering || !pdfDoc) {
        return;
      }
      rendering = true;
      $canvasWrap.empty();
      if (twoPageView) {
        var spreadIndex = 0;
        var numSpreads = Math.ceil(totalPages / 2);
        var nextSpread = function () {
          spreadIndex++;
          if (spreadIndex > numSpreads) {
            rendering = false;
            updatePageInfoDisplay();
            $main.off('scroll.cv-pdf-page').on('scroll.cv-pdf-page', function () {
              clearTimeout(scrollTid);
              scrollTid = setTimeout(updateCurrentPageFromScroll, 80);
            });
            updateCurrentPageFromScroll();
            if (done) {
              done();
            }
            return;
          }
          var left  = (spreadIndex - 1) * 2 + 1;
          var right = (left + 1 <= totalPages) ? left + 1 : null;
          renderSpread(left, right, nextSpread);
        };
        nextSpread();
      } else {
      var idx = 0;
        var next = function () {
        idx++;
        if (idx > totalPages) {
          rendering = false;
            updatePageInfoDisplay();
            $main.off('scroll.cv-pdf-page').on('scroll.cv-pdf-page', function () {
            clearTimeout(scrollTid);
            scrollTid = setTimeout(updateCurrentPageFromScroll, 80);
          });
          updateCurrentPageFromScroll();
            if (done) {
              done();
            }
          return;
        }
        renderOnePage(idx, next);
        };
      next();
      }
    }

    /* ---------- annotation helpers ---------- */

    function normalizeRectFallback (r) {
      if (!r || r.length < 4) {
        return [0, 0, 0, 0];
      }
      var x1 = r[0],
        y1 = r[1],
        x2 = r[2],
        y2 = r[3];
      return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    }

    function multiplyTransform (m1, m2) {
      if (!m1 || m1.length < 6 || !m2 || m2.length < 6) {
        return m2 || m1;
      }
      return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ];
    }

    /* ---------- text layer ---------- */

    function renderTextLayerForPage (textContent, viewport, $pageWrap) {
      if (!textContent || !textContent.items || !viewport) {
        return;
      }
      var Util = (typeof pdfjsLib !== 'undefined' && pdfjsLib.Util && typeof pdfjsLib.Util.transform === 'function') ? pdfjsLib.Util : null;
      var vpTransform = viewport.transform;
      if (!vpTransform || vpTransform.length < 6) {
        vpTransform = [1, 0, 0, 1, 0, 0];
      }
      var $layer = $('<div class="cv-pdf-text-layer"></div>');
      $layer.css({ position: 'absolute', left: 0, top: 0, width: viewport.width + 'px', height: viewport.height + 'px', overflow: 'hidden', pointerEvents: 'auto', userSelect: 'text', WebkitUserSelect: 'text' });
      var items = textContent.items;
      for (var i = 0; i < items.length; i++) {
        var tcItem = items[i];
        var str = (tcItem && tcItem.str !== null && tcItem.str !== undefined) ? String(tcItem.str) : '';
        var t = (tcItem && tcItem.transform !== null && tcItem.transform !== undefined && tcItem.transform.length >= 6) ?
          tcItem.transform : [1, 0, 0, 1, 0, 0];
        var tx = Util ? Util.transform(vpTransform, t) : multiplyTransform(vpTransform, t);
        var left = tx[4];
        var fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) || 12;
        var top = tx[5] - fontHeight;
        var span = document.createElement('span');
        span.className = 'cv-pdf-text-span';
        span.style.cssText = 'position:absolute;left:' + left + 'px;top:' + top + 'px;font-size:' + fontHeight + 'px;line-height:1.15;white-space:pre;pointer-events:auto;';
        span.textContent = str;
        $layer[0].appendChild(span);
      }
      var $ann = $pageWrap.find('.cv-pdf-annotations');
      if ($ann.length) {
        $ann.before($layer);
      } else {
        $pageWrap.append($layer);
      }
    }

    function renderTextLayerForAllPages () {
      if (!pdfDoc || typeof pdfDoc.getPage !== 'function') {
        return;
      }
      $canvasWrap.find('.cv-pdf-page').each(function () {
        var $pw = $(this);
        var num = parseInt($pw.attr('data-page'));
        if (!num) {
          return;
        }
        pdfDoc.getPage(num).then(function (page) {
          var vp = page.getViewport({ scale: pdfScale, rotation: rotation });
          if (typeof page.getTextContent !== 'function') {
            return;
          }
          page.getTextContent().then(function (tc) {
            renderTextLayerForPage(tc, vp, $pw);
          });
        });
      });
    }

    /* ---------- annotations ---------- */

    function renderAnnotations (page, viewport, $pageWrap) {
      page.getAnnotations().then(function (annotations) {
        if (!annotations || !annotations.length) {
          return;
        }
        var convertToViewport = viewport.convertToViewportRectangle || viewport.convertToViewport;
        if (!convertToViewport) {
          return;
        }
        var normalizeRect = (typeof pdfjsLib.Util !== 'undefined' && typeof pdfjsLib.Util.normalizeRect === 'function') ?
          pdfjsLib.Util.normalizeRect :
          normalizeRectFallback;

        var $layer = $('<div class="cv-pdf-annotations"></div>');
        $layer.css({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' });

        for (var i = 0; i < annotations.length; i++) {
          var ann = annotations[i];
          if (!ann.rect) {
            continue;
          }

          var rawRect = convertToViewport.call(viewport, ann.rect);
          var rect = normalizeRect(rawRect);

          var $el = $('<div class="cv-pdf-annot"></div>');
          $el.css({
            position: 'absolute',
            left: rect[0] + 'px',
            top: rect[1] + 'px',
            width: (rect[2] - rect[0]) + 'px',
            height: (rect[3] - rect[1]) + 'px'
          });

          if (ann.subtype === 'Link' && ann.url && U.isSafeResourceUrl(ann.url)) {
            var $link = $('<a class="cv-pdf-annot-link"></a>');
            $link.attr({ href: ann.url, target: '_blank' });
            $link.css({ display: 'block', width: '100%', height: '100%' });
            $el.append($link);
          } else if (ann.subtype === 'Link' && ann.dest) {
            (function (dest, el, doc) {
              el.css('cursor', 'pointer');
              el.on('click', function () {
                if (typeof dest === 'number') {
                  goToPage(dest + 1);
                } else if (Array.isArray(dest)) {
                  doc.getPageIndex(dest[0]).then(function (idx) {
                    goToPage(idx + 1);
                  });
                }
              });
            }(ann.dest, $el, pdfDoc));
          }

          if (ann.subtype === 'Highlight') {
            $el.addClass('cv-pdf-annot-highlight');
          }

          $layer.append($el);
        }

        $pageWrap.append($layer);
      });
    }

    /* ---------- thumbnails ---------- */

    function buildThumbnail (num) {
      pdfDoc.getPage(num).then(function (page) {
        var vp = page.getViewport({ scale: 0.25 });
        var c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        var $t = $('<div class="cv-pdf-thumb' + (num === 1 ? ' cv-active' : '') + '" data-page="' + num + '"></div>');
        $t.append(c).append('<span class="cv-pdf-thumb-num">' + num + '</span>');
        $t.on('click', function () {
          goToPage(num);
        });
        $thumbs.append($t);
        page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      });
    }

    /* ---------- page info / navigation ---------- */

    function updatePageInfoDisplay () {
      if (!$pageInfo || pageEditing) {
        return;
      }
      var $cur = $pageInfo.find('.cv-pdf-page-current');
      var $tot = $pageInfo.find('.cv-pdf-page-total');
      if ($cur.length) {
        $cur.text(pageNum);
      }
      if ($tot.length) {
        $tot.text(totalPages || '-');
      }
    }
    function goToPage (num) {
      if (totalPages < 1) {
        return;
      }
      num = Math.max(1, Math.min(totalPages, num));
      pageNum = num;
      updatePageInfoDisplay();
      $thumbs.find('.cv-pdf-thumb').removeClass('cv-active');
      $thumbs.find('[data-page="' + pageNum + '"]').addClass('cv-active');
      var $pageEl = $canvasWrap.find('.cv-pdf-page[data-page="' + num + '"]');
      if ($pageEl.length) {
        $pageEl[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    /* ---------- stage size helper ---------- */

    function getStageSize () {
      var $wrap = overlay.$stageWrap;
      return {
        w: ($wrap && $wrap.length ? $wrap.width() : 0) || $stage.width() || 600,
        h: ($wrap && $wrap.length ? $wrap.height() : 0) || $stage.height() || 800
      };
    }

    /* ---------- load the PDF ---------- */

    overlay.$loader.addClass('cv-active');
    if (pdfOpts.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfOpts.workerSrc;
    }

    var docParams = { url: srcUrl, withCredentials: true };
    if (pdfOpts.cMapUrl) {
      docParams.cMapUrl   = pdfOpts.cMapUrl;
      docParams.cMapPacked = pdfOpts.cMapPacked !== false;
    }

    var loadingTask = (typeof docParams === 'object' && docParams.url) ? pdfjsLib.getDocument(docParams) : pdfjsLib.getDocument(srcUrl);
    var loadPromise = loadingTask.promise || loadingTask;
    loadPromise.then(function (pdf) {
      pdfDoc = pdf; totalPages = pdf.numPages;
      overlay.$loader.removeClass('cv-active');

      function checkPdfHasText (cb) {
        var pagesToCheck = Math.min(3, Math.max(1, totalPages));
        var idx = 0;
        function next () {
          if (idx >= pagesToCheck) {
            cb(false); return;
          }
          pdf.getPage(idx + 1).then(function (page) {
            if (typeof page.getTextContent !== 'function') {
              idx++; next(); return;
            }
            var p = page.getTextContent();
            (p && p.then ? p : Promise.resolve(p)).then(function (tc) {
              if (tc && tc.items && tc.items.length > 0) {
                cb(true); return;
              }
              idx++;
              next();
            }).catch(function () {
              idx++; next();
            });
          }).catch(function () {
            idx++; next();
          });
        }
        next();
      }
      if (enableTextLayer && totalPages > 0) {
        checkPdfHasText(function (hasText) {
          if (hasText && $tbExtract && overlay.$toolbar && overlay.$toolbar.length) {
            var $print = overlay.$toolbar.find('.cv-tb-pdf-print');
            if ($print.length) {
              $print.after($tbExtract);
            } else {
              overlay.$toolbar.append($tbExtract);
            }
          }
        });
      }

      function runInitialScaleAndRender () {
        var size  = getStageSize();
        var wrapW = size.w;
        var wrapH = size.h;

        pdf.getPage(1).then(function (fp) {
          var vp = fp.getViewport({ scale: 1 });
          if (useAutoFit && wrapW > 0 && wrapH > 0) {
            var fitScale = twoPageView ?
              Math.min((wrapW - TWO_PAGE_GAP) / (2 * vp.width), wrapH / vp.height) :
              Math.min(wrapW / vp.width, wrapH / vp.height);
            pdfScale = Math.max(minScale, Math.min(fitScale, maxScale));
          } else if (!useAutoFit && wrapW > 0) {
            pdfScale = Math.max(0.25, Math.min(twoPageView ? (wrapW - TWO_PAGE_GAP) / (2 * vp.width) : wrapW / vp.width, maxScale));
          } else {
            pdfScale = Math.min(1, maxScale);
          }
          syncZoomSelect();
          renderAllPages(function () {
            for (var i = 1; i <= totalPages; i++) {
              buildThumbnail(i);
            }
          });
          if (useAutoFit) {
            $(window).on('resize.cv-pdf-autofit', function () {
              clearTimeout(pdfResizeTid);
              pdfResizeTid = setTimeout(applyAutoFitScale, 150);
            });
          }
        });
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(runInitialScaleAndRender);
      });
    }, function () {
      overlay.$loader.removeClass('cv-active');
      if ($container && $container.length) {
        $container.remove();
      }
      U.showError($stage, 'pdf', 'PDF could not be loaded', item);
    });

    $stage.append($container);

    /* ---------- toolbar items ---------- */

    var tipAttr = (inst && inst.opts.canShowTooltip !== false) ? function (k) {
      return ' data-cv-tooltip="' + U.escHtml(U.str(inst, k)) + '"';
    } : function () {
      return '';
    };
    var ariaAttr = (inst && inst.opts.wcag) ? function (k) {
      return ' aria-label="' + U.escHtml(U.str(inst, k)) + '"';
    } : function () {
      return '';
    };
    var toolbarItems = [];
    var $tbThumb = $('<button class="cv-tb-btn"' + tipAttr('thumbnails') + ariaAttr('thumbnails') + '>' + U.Icons.thumbnails + '</button>');
    $tbThumb.on('click', function () {
      $sidebar.toggle(); $tbThumb.toggleClass('cv-active');
    });
    toolbarItems.push($tbThumb[0]);

    var $tbPrev = $('<button class="cv-tb-btn"' + tipAttr('previousPage') + ariaAttr('previousPage') + '>' + U.Icons.prevPage + '</button>');
    $tbPrev.on('click', function () {
      goToPage(pageNum - 1);
    });
    toolbarItems.push($tbPrev[0]);

    $pageInfo = $('<span class="cv-pdf-page-info"><span class="cv-pdf-page-current">1</span> / <span class="cv-pdf-page-total">-</span></span>');
    $pageInfo.on('click', function () {
      if (pageEditing) {
        return;
      }
      pageEditing = true;
      var cur = String(pageNum || 1);
      var $input = $('<input class="cv-pdf-page-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />');
      $input.val(cur);
      $pageInfo.find('.cv-pdf-page-current').replaceWith($input);
      $input[0].focus();

      function restoreDisplay () {
        var $cur = $('<span class="cv-pdf-page-current"></span>').text(pageNum);
        $input.replaceWith($cur);
        $pageInfo.find('.cv-pdf-page-total').text(totalPages || '-');
        pageEditing = false;
      }
      function commit () {
        var raw = String($input.val() || '').trim();
        var n = parseInt(raw);
        if (isNaN(n)) {
          restoreDisplay(); return;
        }
        n = Math.max(1, Math.min(totalPages || 1, n));
        restoreDisplay();
        if (totalPages) {
          goToPage(n);
        }
      }

      $input.on('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault(); commit();
        } else if (e.key === 'Escape') {
          e.preventDefault(); restoreDisplay();
        }
      });
      $input.on('blur', function () {
        commit();
      });
    });
    toolbarItems.push($pageInfo[0]);

    var $tbNext = $('<button class="cv-tb-btn"' + tipAttr('nextPage') + ariaAttr('nextPage') + '>' + U.Icons.nextPage + '</button>');
    $tbNext.on('click', function () {
      goToPage(pageNum + 1);
    });
    toolbarItems.push($tbNext[0]);

    toolbarItems.push('separator');

    var $tbZoomOut = $('<button class="cv-tb-btn cv-tb-pdf-zoom-out"' + tipAttr('zoomOut') + ariaAttr('zoomOut') + '>' + U.Icons.zoomOut + '</button>');
    $tbZoomOut.on('click', function () {
      setPdfScaleManual(pdfScale - 0.25);
    });
    toolbarItems.push($tbZoomOut[0]);

    $zoomSelect = $('<select class="cv-pdf-zoom-select"' + ariaAttr('zoom') + '></select>');
    $zoomSelect.append('<option value="autofit">Auto Fit</option>');
    for (var zi = 0; zi < zoomPresetsPct.length; zi++) {
      var zp = zoomPresetsPct[zi];
      $zoomSelect.append('<option value="' + zp + '">' + zp + '%</option>');
    }
    $zoomSelect.on('change', function () {
      var v = String($(this).val() || '');
      if (v === 'autofit') {
        useAutoFit = true;
        applyAutoFitScale();
        syncZoomSelect();
        return;
      }
      var pct = parseInt(v);
      if (!isNaN(pct) && pct > 0) {
        setPdfScaleManual(pct / 100);
      }
    });
    syncZoomSelect();
    toolbarItems.push($zoomSelect[0]);

    var $tbZoomIn = $('<button class="cv-tb-btn cv-tb-pdf-zoom-in"' + tipAttr('zoomIn') + ariaAttr('zoomIn') + '>' + U.Icons.zoomIn + '</button>');
    $tbZoomIn.on('click', function () {
      setPdfScaleManual(pdfScale + 0.25);
    });
    toolbarItems.push($tbZoomIn[0]);

    var $tbRotate = $('<button class="cv-tb-btn"' + tipAttr('rotate') + ariaAttr('rotate') + '>' + U.Icons.rotateCw + '</button>');
    $tbRotate.on('click', function () {
      rotation = (rotation + 90) % 360; renderAllPages();
    });
    toolbarItems.push($tbRotate[0]);

    if (pdfOpts.twoPageView === true) {
      var $tbTwoPage = $('<button class="cv-tb-btn cv-tb-pdf-twopage"' + tipAttr('twoPageView') + ariaAttr('twoPageView') + '>' + U.Icons.twoPageView + '</button>');
      var updateTwoPageToggleState = function () {
        $tbTwoPage.toggleClass('cv-active', twoPageView);
        var tip = twoPageView ? U.str(inst, 'singlePageView') : U.str(inst, 'twoPageView');
        $tbTwoPage.attr('data-cv-tooltip', tip);
        if (inst.opts.wcag) {
          $tbTwoPage.attr('aria-label', tip);
        }
      };
      $tbTwoPage.on('click', function () {
        twoPageView = !twoPageView;
        updateTwoPageToggleState();
        useAutoFit = true;
        applyAutoFitScale();
      });
      updateTwoPageToggleState();
      toolbarItems.push($tbTwoPage[0]);
    }

    function defaultPrint () {
      var $page = $canvasWrap.find('.cv-pdf-page[data-page="' + pageNum + '"]');
      var canvas = $page.length ? $page.find('canvas')[0] : $canvasWrap.find('canvas')[0];
      if (!canvas) {
        return;
      }
      var win = window.open('');
      var dataUrl = canvas.toDataURL().replace(/"/g, '&quot;');
      win.document.write('<img src="' + dataUrl + '" onload="window.print();window.close();" />');
    }
    var $tbPrint = $('<button class="cv-tb-btn cv-tb-pdf-print"' + tipAttr('print') + ariaAttr('print') + '>' + U.Icons.print + '</button>');
    $tbPrint.on('click', function () {
      if (onPrint) {
        onPrint({ item: item, pdfDoc: pdfDoc, pageNum: pageNum, totalPages: totalPages, $canvasWrap: $canvasWrap, defaultPrint: defaultPrint });
        return;
      }
      defaultPrint();
    });
    toolbarItems.push($tbPrint[0]);

    if (enableTextLayer && pdfOpts.extractText === true) {
      $tbExtract = $('<button class="cv-tb-btn cv-tb-pdf-extract"' + tipAttr('extractText') + ariaAttr('extractText') + '>' + U.Icons.extractText + '</button>');
      $tbExtract.on('click', function () {
        textLayerVisible = !textLayerVisible;
        if (textLayerVisible) {
          renderTextLayerForAllPages();
        } else {
          $canvasWrap.find('.cv-pdf-text-layer').remove();
        }
        $(this).toggleClass('cv-active', textLayerVisible);
      });
    }

    return {
      toolbar: toolbarItems,
      destroy: function () {
        clearTimeout(pdfResizeTid);
        clearTimeout(scrollTid);
        clearTimeout(zoomRenderTid);
        $(window).off('resize.cv-pdf-autofit');
        $main.off('scroll.cv-pdf-page');
        if (pdfDoc) {
          pdfDoc.destroy();
        }
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Register                                                           */
  /* ------------------------------------------------------------------ */

  CV.registerRenderer('pdf', function (item, $stage, inst, overlay) {
    if (typeof window.pdfjsLib !== 'undefined') {
      return builtInPdfRenderer(item, $stage, inst, overlay);
    }
    return builtInPdfIframeRenderer(item, $stage, inst, overlay);
  });

}(jQuery));
