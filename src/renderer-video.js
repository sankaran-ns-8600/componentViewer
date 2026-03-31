(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U = CV.Utils;

  var jpCounter = 0;

  function builtInVideoNativeRenderer (item, $stage, inst, overlay) {
    var srcUrl = U.getResolvedSrcUrl(item, inst);
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      return null;
    }
    var $wrap = $('<div class="cv-video-wrap"></div>');
    $wrap.attr('tabindex', '0');
    var posterUrl = U.getResolvedUrl(item, inst, 'thumbnailUrl') || item.thumbnailUrl;
    var poster = (posterUrl && U.isSafeResourceUrl(posterUrl)) ? posterUrl : '';
    /* preload="none" so thumbnail (poster) is visible immediately; video loads on play */
    var $video = $('<video class="cv-native-video" controls playsinline preload="none"></video>');
    $video.one('play', function () {
      if ($wrap[0] && typeof $wrap[0].focus === 'function') {
        $wrap[0].focus();
      }
    });
    $video.attr('src', srcUrl);
    var canAutoplayVideo = !(inst && inst.opts && inst.opts.video && inst.opts.video.autoplay === false);
    if (canAutoplayVideo) {
      $video.attr('autoplay', 'autoplay');
      $video.prop('autoplay', true);
    }
    if (poster) {
      $video.attr('poster', poster);
    }
    $wrap.append($video);
    $stage.append($wrap);
    if (canAutoplayVideo && $video[0] && typeof $video[0].play === 'function') {
      var playPromise = $video[0].play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    }
    return {};
  }

  function builtInVideoRenderer (item, $stage, inst, overlay) {
    var srcUrl = U.getResolvedSrcUrl(item, inst);
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      return null;
    }

    var id = 'cv-jp-v-' + (++jpCounter);
    var containerId = id + '-ui';
    var supplied = U.getMediaSupplied(item, inst);
    var media = {}; media[supplied] = srcUrl;
    var posterUrl = U.getResolvedUrl(item, inst, 'thumbnailUrl') || item.thumbnailUrl;
    if (posterUrl && U.isSafeResourceUrl(posterUrl)) {
      media.poster = posterUrl;
    }

    var vTip = (inst && inst.opts.canShowTooltip !== false);
    var v = function (k) {
      return vTip ? (' data-cv-tooltip="' + U.escHtml(U.str(inst, k)) + '"') : '';
    };
    var videoOpts = (inst && inst.opts.video) || {};
    var canAutoplayVideo = videoOpts.autoplay !== false;
    var hdUrlFromItem = item.hdUrl && U.isSafeResourceUrl(item.hdUrl);
    var hasHdCallback = videoOpts.onGetHdUrl && typeof videoOpts.onGetHdUrl === 'function';
    var canShowHdFn = videoOpts.canShowHDButton && typeof videoOpts.canShowHDButton === 'function';
    var showHd = (hdUrlFromItem ? (!canShowHdFn || Boolean(videoOpts.canShowHDButton(item, inst))) : false) ||
      (Boolean(hasHdCallback) && !hdUrlFromItem);
    var hdBtnHtml = showHd ? ('<button class="cv-jp-btn cv-jp-hd" type="button"' + v('hd') + '>HD</button>') : '';
    var posterUrlForPoster = (posterUrl && U.isSafeResourceUrl(posterUrl)) ? posterUrl : '';
    var $wrap = $(
      '<div class="cv-video-wrap">' +
        '<div id="' + containerId + '" class="cv-jp-video-ui">' +
          (posterUrlForPoster ? '<div class="cv-jp-poster" aria-hidden="true"></div>' : '') +
          '<div class="cv-jp-video-screen"></div>' +
          (showHd ? '<span class="cv-jp-hd-badge" aria-hidden="true">HD</span>' : '') +
          '<div class="cv-jp-big-play"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><g transform="translate(12 12) scale(0.65) translate(-12 -12)"><polygon points="5 3 19 12 5 21" transform="translate(2.33 0)"/></g></svg></div>' +
          '<div class="cv-jp-controls">' +
            '<button class="cv-jp-btn jp-play" type="button"' + v('play') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></button>' +
            '<button class="cv-jp-btn jp-pause" type="button"' + v('pause') + ' style="display:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>' +
            '<span class="cv-jp-time jp-current-time">0:00</span>' +
            '<div class="cv-jp-progress jp-seek-bar"><div class="cv-jp-play-bar jp-play-bar"></div></div>' +
            '<span class="cv-jp-time jp-duration">0:00</span>' +
            '<select class="cv-jp-speed"' + v('playbackSpeed') + '>' +
              '<option value="0.5">0.5x</option><option value="0.75">0.75x</option>' +
              '<option value="1" selected>1x</option><option value="1.25">1.25x</option>' +
              '<option value="1.5">1.5x</option><option value="2">2x</option>' +
            '</select>' +
            hdBtnHtml +
            '<button class="cv-jp-btn jp-mute" type="button"' + v('mute') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>' +
            '<button class="cv-jp-btn jp-unmute" type="button"' + v('unmute') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>' +
            '<div class="cv-jp-volume jp-volume-bar"><div class="cv-jp-volume-val jp-volume-bar-value"></div></div>' +
            '<button class="cv-jp-btn jp-full-screen" type="button"' + v('fullscreen') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
            '<button class="cv-jp-btn jp-restore-screen" type="button"' + v('exitFullscreen') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    $wrap.attr('tabindex', '0');
    if (posterUrlForPoster) {
      $wrap.find('.cv-jp-poster').css('background-image', 'url("' + posterUrlForPoster.replace(/"/g, '%22') + '")');
    }

    $stage.append($wrap);

    if (inst && inst.opts.wcag) {
      $wrap.find('.jp-play').attr('aria-label', U.str(inst, 'play'));
      $wrap.find('.jp-pause').attr('aria-label', U.str(inst, 'pause'));
      $wrap.find('.cv-jp-speed').attr('aria-label', U.str(inst, 'playbackSpeed'));
      $wrap.find('.cv-jp-hd').attr('aria-label', U.str(inst, 'hd'));
      $wrap.find('.jp-mute').attr('aria-label', U.str(inst, 'mute'));
      $wrap.find('.jp-unmute').attr('aria-label', U.str(inst, 'unmute'));
      $wrap.find('.jp-full-screen').attr('aria-label', U.str(inst, 'fullscreen'));
      $wrap.find('.jp-restore-screen').attr('aria-label', U.str(inst, 'exitFullscreen'));
    }

    var $jp = $();
    var $bigPlay = $wrap.find('.cv-jp-big-play');
    var $screen = $wrap.find('.cv-jp-video-screen');
    var $speed = $wrap.find('.cv-jp-speed');
    var isPlaying = false;
    var shouldFocusOnAutoplayStart = canAutoplayVideo;
    var jpInited = false;
    var videoGateActive = false;
    var beforeVideoPlayFn = (typeof videoOpts.beforeVideoPlay === 'function') ? videoOpts.beforeVideoPlay : null;

    function doJPlayerInitAndPlay () {
      if (jpInited) {
        return;
      }
      jpInited = true;
      videoGateActive = false;
      $wrap.find('.cv-jp-poster').addClass('cv-hidden');
      if (!$jp.length) {
        var $playerDiv = $('<div id="' + id + '" class="cv-jp-player"></div>');
        $wrap.prepend($playerDiv);
        $jp = $playerDiv;
      }
      $jp.jPlayer({
        ready: function () {
          $(this).jPlayer('setMedia', media);
          if (canAutoplayVideo) {
            $(this).jPlayer('play');
          }
        },
        play: function () {
          if (shouldFocusOnAutoplayStart) {
            shouldFocusOnAutoplayStart = false;
            if ($wrap[0] && typeof $wrap[0].focus === 'function') {
              $wrap[0].focus();
            }
          }
          isPlaying = true;
          syncPlayPauseUI(true);
        },
        pause: function () {
          isPlaying = false;
          syncPlayPauseUI(false);
        },
        ended: function () {
          isPlaying = false;
          syncPlayPauseUI(false);
        },
        volumechange: function (e) {
          var opts = e.jPlayer && e.jPlayer.options;
          var muted = (opts && opts.muted) || (opts && opts.volume === 0);
          syncMuteUI(Boolean(muted));
        },
        supplied: supplied,
        cssSelectorAncestor: '#' + containerId,
        size: { width: '100%', height: '100%', cssClass: 'cv-jp-video-size' },
        sizeFull: { width: '100%', height: '100%', cssClass: 'cv-jp-video-size-full' },
        smoothPlayBar: true,
        keyEnabled: false,
        globalVolume: true,
        playbackRate: 1
      });
    }

    function initJPlayerAndPlay () {
      if (jpInited) {
        return;
      }
      if (videoGateActive) {
        return;
      }
      if (beforeVideoPlayFn) {
        beforeVideoPlayFn(item, inst, function videoPlayNext (arg) {
          if (jpInited) {
            return;
          }
          if (arg && arg.gateContent && arg.gateContent.html) {
            videoGateActive = true;
            var gate = arg.gateContent;
            var $gate = $('<div class="cv-video-gate"></div>');
            var gh = gate.html;
            if (typeof gh === 'string') {
              $gate.html(gh);
            } else if (gh && gh.jquery) {
              $gate.append(gh);
            } else if (gh && gh.nodeType) {
              $gate.append(gh);
            } else {
              $gate.html(String(gh));
            }
            $wrap.append($gate);
            var $proceed = $gate.find('[data-cv-gate-proceed]');
            $proceed.off('click.cv-videoplay-gate').on('click.cv-videoplay-gate', function (e) {
              e.preventDefault();
              var ctx = (typeof gate.onProceed === 'function') ? gate.onProceed() : {};
              if (inst) {
                inst._videoBeforePlayContext = ctx || {};
              }
              $proceed.off('click.cv-videoplay-gate');
              $gate.remove();
              videoGateActive = false;
              if (!jpInited) {
                doJPlayerInitAndPlay();
              }
            });
            return;
          }
          doJPlayerInitAndPlay();
        }, $stage);
        return;
      }
      doJPlayerInitAndPlay();
    }

    function togglePlay () {
      if (isPlaying) {
        $jp.jPlayer('pause');
      } else if (!jpInited) {
        initJPlayerAndPlay();
      } else {
        $jp.jPlayer('play');
      }
    }

    $bigPlay.on('click', togglePlay);
    $screen.on('click', togglePlay);
    $wrap.find('.jp-play').on('click', togglePlay);
    $wrap.find('.jp-pause').on('click', togglePlay);

    $speed.on('change', function () {
      if (jpInited) {
      $jp.jPlayer('option', 'playbackRate', parseFloat(this.value));
      }
    });

    var $hdBtn = $wrap.find('.cv-jp-hd');
    var originalMedia = media;
    var isHdCurrentlyPlaying = false;
    if ($hdBtn.length) {
      var setHdButtonActive = function (active) {
        isHdCurrentlyPlaying = Boolean(active);
        $hdBtn.toggleClass('cv-jp-hd-active', isHdCurrentlyPlaying);
        var label = U.str(inst, 'hd') + (isHdCurrentlyPlaying ? ' (on)' : '');
        if (inst && inst.opts.canShowTooltip !== false) {
          $hdBtn.attr('data-cv-tooltip', label);
        }
        if (inst && inst.opts.wcag) {
          $hdBtn.attr('aria-label', label);
        }
        var $badge = $wrap.find('.cv-jp-hd-badge');
        if ($badge.length) {
          $badge.toggle(isHdCurrentlyPlaying);
        }
      };
      var doHdToggle = function () {
        if (!jpInited) {
          return;
        }
        var jpData = $jp.data('jPlayer');
        var currentTime = (jpData && jpData.status && typeof jpData.status.currentTime === 'number') ? jpData.status.currentTime : 0;
        var wasPlaying = isPlaying;
        $jp.jPlayer('pause');
        var didSeek = false;
        var seekFallbackTimer;
        var seekAndResume = function () {
          if (didSeek) {
            return;
          }
          didSeek = true;
          clearTimeout(seekFallbackTimer);
          $jp.jPlayer('pause', currentTime);
          if (wasPlaying) {
            $jp.jPlayer('play');
          }
        };
        if (isHdCurrentlyPlaying) {
          $jp.one('jPlayer_loadeddata', function () {
            seekAndResume();
            setHdButtonActive(false);
          });
          seekFallbackTimer = setTimeout(function () {
            seekAndResume();
            setHdButtonActive(false);
          }, 1200);
          $jp.jPlayer('setMedia', originalMedia);
          return;
        }
        var hdUrl = (hdUrlFromItem ? item.hdUrl : null) || (hasHdCallback ? videoOpts.onGetHdUrl(item, inst) : null);
        if (!hdUrl || !U.isSafeResourceUrl(hdUrl)) {
          return;
        }
        var newMedia = {}; newMedia[supplied] = hdUrl;
        if (originalMedia.poster) {
          newMedia.poster = originalMedia.poster;
        }
        $jp.one('jPlayer_loadeddata', function () {
          seekAndResume();
          setHdButtonActive(true);
        });
        seekFallbackTimer = setTimeout(function () {
          seekAndResume();
          setHdButtonActive(true);
        }, 1200);
        $jp.jPlayer('setMedia', newMedia);
      };
      $hdBtn.on('click', function () {
        if (!jpInited) {
          return;
        }
        if (isHdCurrentlyPlaying) {
          doHdToggle();
          return;
        }
        var hdUrl = (hdUrlFromItem ? item.hdUrl : null) || (hasHdCallback ? videoOpts.onGetHdUrl(item, inst) : null);
        if (!hdUrl || !U.isSafeResourceUrl(hdUrl)) {
          return;
        }
        doHdToggle();
      });
    }

    var $fullscreenBtn = $wrap.find('.jp-full-screen');
    var $restoreBtn = $wrap.find('.jp-restore-screen');
    var wrapEl = $wrap[0];

    function onFullscreenChange () {
      var fsEl = U.getFullscreenElement();
      var isVideoFullscreen = (fsEl === wrapEl);
      $fullscreenBtn.toggle(!isVideoFullscreen);
      $restoreBtn.toggle(isVideoFullscreen);
      if (inst && inst.opts.canShowTooltip !== false) {
        $fullscreenBtn.attr('data-cv-tooltip', U.str(inst, 'fullscreen'));
        $restoreBtn.attr('data-cv-tooltip', U.str(inst, 'exitFullscreen'));
      }
      if (inst && inst.opts.wcag) {
        $fullscreenBtn.attr('aria-label', U.str(inst, 'fullscreen'));
        $restoreBtn.attr('aria-label', U.str(inst, 'exitFullscreen'));
      }
      /* Move tooltip into video wrapper when video is fullscreen so it appears above video layer */
      if (overlay.$tooltip && overlay.$tooltip.length) {
        if (isVideoFullscreen) {
          if (overlay.$tooltip.parent()[0] !== wrapEl) {
            $wrap.append(overlay.$tooltip);
          }
        } else {
          var overlayEl = overlay.$el && overlay.$el[0];
          if (fsEl === overlayEl) {
            if (overlay.$tooltip.parent()[0] !== overlayEl) {
              overlay.$el.append(overlay.$tooltip);
            }
          } else if (overlay.$tooltip.parent()[0] !== document.body) {
            $('body').append(overlay.$tooltip);
          }
        }
      }
    }

    $fullscreenBtn.on('click', function () {
      if (wrapEl.requestFullscreen) {
        wrapEl.requestFullscreen();
      } else if (wrapEl.webkitRequestFullscreen) {
        wrapEl.webkitRequestFullscreen();
      } else if (wrapEl.mozRequestFullScreen) {
        wrapEl.mozRequestFullScreen();
      } else if (wrapEl.msRequestFullscreen) {
        wrapEl.msRequestFullscreen();
      }
    });
    $restoreBtn.on('click', function () {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    });

    $(document).on('fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange.cv-video', function () {
      onFullscreenChange();
    });
    onFullscreenChange();

    function syncPlayPauseUI (playing) {
      $bigPlay.toggleClass('cv-hidden', Boolean(playing));
      $wrap.find('.jp-play').toggle(!playing);
      $wrap.find('.jp-pause').toggle(Boolean(playing));
    }
    function syncMuteUI (muted) {
      $wrap.find('.jp-mute').toggle(!muted);
      $wrap.find('.jp-unmute').toggle(Boolean(muted));
    }

    if (canAutoplayVideo) {
      initJPlayerAndPlay();
    }

    return {
      destroy: function () {
        $(document).off('fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange.cv-video');
        $wrap.find('.cv-video-gate').remove();
        videoGateActive = false;
        if (jpInited && $jp.length) {
        $jp.jPlayer('destroy');
          $jp.remove();
        }
      }
    };
  }

  CV.registerRenderer('video', function (item, $stage, inst, overlay) {
    if (typeof $.fn.jPlayer === 'undefined') {
      return builtInVideoNativeRenderer(item, $stage, inst, overlay);
    }
    return builtInVideoRenderer(item, $stage, inst, overlay);
  });

})(jQuery);
