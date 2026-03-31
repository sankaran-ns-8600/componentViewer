(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  var jpCounter = 0;

  function builtInAudioNativeRenderer(item, $stage, inst, overlay) {
    var srcUrl = U.getResolvedSrcUrl(item, inst);
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      return null;
    }
    var ext = (item.fileExt || item.title || '').split('.').pop().toUpperCase() || 'AUDIO';
    var $wrap = $(
      '<div class="cv-audio-wrap">' +
        '<div class="cv-audio-artwork">' +
          '<div class="cv-audio-icon"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="cv-audio-title">' + U.escHtml(item.title || 'Audio') + '</div>' +
          '<div class="cv-audio-meta"><span>' + U.escHtml(ext) + '</span></div>' +
        '</div>' +
        '<div class="cv-audio-native-controls"></div>' +
      '</div>'
    );
    $wrap.attr('tabindex', '0');
    var $audio = $('<audio controls preload="metadata"></audio>');
    $audio.one('play', function () {
      if ($wrap[0] && typeof $wrap[0].focus === 'function') {
        $wrap[0].focus();
      }
    });
    $audio.attr('src', srcUrl);
    var audioOpts = (inst && inst.opts && inst.opts.audio) || {};
    var canAutoplayAudio = audioOpts.autoplay !== false;
    if (canAutoplayAudio) {
      $audio.attr('autoplay', 'autoplay');
      $audio.prop('autoplay', true);
    }
    $wrap.find('.cv-audio-native-controls').append($audio);
    $stage.append($wrap);
    if (canAutoplayAudio && $audio[0] && typeof $audio[0].play === 'function') {
      var playPromise = $audio[0].play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    }
    return {};
  }

  function builtInAudioRenderer(item, $stage, inst, overlay) {
    if (typeof $.fn.jPlayer === 'undefined') {
      return builtInAudioNativeRenderer(item, $stage, inst, overlay);
    }
    var srcUrl = U.getResolvedSrcUrl(item, inst);
    if (!srcUrl || !U.isSafeResourceUrl(srcUrl)) {
      return null;
    }

    var id = 'cv-jp-a-' + (++jpCounter);
    var containerId = id + '-ui';
    var supplied = U.getMediaSupplied(item, inst);
    var media = {}; media[supplied] = srcUrl;
    var ext = (item.fileExt || item.title || '').split('.').pop().toUpperCase() || 'AUDIO';

    var aTip = (inst && inst.opts.canShowTooltip !== false);
    var a = function (k) {
      return aTip ? (' data-cv-tooltip="' + U.escHtml(U.str(inst, k)) + '"') : '';
    };
    var $wrap = $(
      '<div class="cv-audio-wrap">' +
        '<div class="cv-audio-artwork">' +
          '<div class="cv-audio-icon"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="cv-audio-title">' + U.escHtml(item.title || 'Audio') + '</div>' +
          '<div class="cv-audio-meta">' +
            (item.fileSize ? '<span>' + U.escHtml(item.fileSize) + '</span>' : '') +
            '<span>' + U.escHtml(ext) + '</span>' +
          '</div>' +
        '</div>' +
        '<div id="' + containerId + '" class="cv-jp-audio-ui">' +
          '<div class="cv-jp-controls">' +
            '<button class="cv-jp-btn cv-jp-btn-lg jp-play" type="button"' + a('play') + '><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></button>' +
            '<button class="cv-jp-btn cv-jp-btn-lg jp-pause" type="button"' + a('pause') + ' style="display:none"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>' +
            '<span class="cv-jp-time jp-current-time">0:00</span>' +
            '<div class="cv-jp-progress jp-seek-bar"><div class="cv-jp-play-bar jp-play-bar"></div></div>' +
            '<span class="cv-jp-time jp-duration">0:00</span>' +
            '<select class="cv-jp-speed"' + a('playbackSpeed') + '>' +
              '<option value="0.5">0.5x</option><option value="0.75">0.75x</option>' +
              '<option value="1" selected>1x</option><option value="1.25">1.25x</option>' +
              '<option value="1.5">1.5x</option><option value="2">2x</option>' +
            '</select>' +
            '<button class="cv-jp-btn jp-mute" type="button"' + a('mute') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>' +
            '<button class="cv-jp-btn jp-unmute" type="button"' + a('unmute') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>' +
            '<div class="cv-jp-volume jp-volume-bar"><div class="cv-jp-volume-val jp-volume-bar-value"></div></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    $wrap.attr('tabindex', '0');

    $stage.append($wrap);

    if (inst && inst.opts.wcag) {
      $wrap.find('.jp-play').attr('aria-label', U.str(inst, 'play'));
      $wrap.find('.jp-pause').attr('aria-label', U.str(inst, 'pause'));
      $wrap.find('.cv-jp-speed').attr('aria-label', U.str(inst, 'playbackSpeed'));
      $wrap.find('.jp-mute').attr('aria-label', U.str(inst, 'mute'));
      $wrap.find('.jp-unmute').attr('aria-label', U.str(inst, 'unmute'));
    }

    var $jp = $();
    var $speed = $wrap.find('.cv-jp-speed');
    var jpInited = false;
    var audioOpts = (inst && inst.opts && inst.opts.audio) || {};
    var canAutoplayAudio = audioOpts.autoplay !== false;
    var shouldFocusOnAutoplayStart = canAutoplayAudio;

    function syncAudioPlayPauseUI(playing) {
      $wrap.find('.jp-play').toggle(!playing);
      $wrap.find('.jp-pause').toggle(Boolean(playing));
    }
    function syncAudioMuteUI(muted) {
      $wrap.find('.jp-mute').toggle(!muted);
      $wrap.find('.jp-unmute').toggle(Boolean(muted));
    }

    function initJPlayerAndPlay() {
      if (jpInited) {
        return;
      }
      jpInited = true;
      if (!$jp.length) {
        var $playerDiv = $('<div id="' + id + '" class="cv-jp-player"></div>');
        $wrap.prepend($playerDiv);
        $jp = $playerDiv;
      }
      $jp.jPlayer({
        ready: function () {
          var $this = $(this);
          $this.jPlayer('setMedia', media);
          if (canAutoplayAudio) {
            $this.jPlayer('play');
            setTimeout(function () {
              $this.jPlayer('play');
            }, 0);
          }
        },
        play: function () {
          if (shouldFocusOnAutoplayStart) {
            shouldFocusOnAutoplayStart = false;
            if ($wrap[0] && typeof $wrap[0].focus === 'function') {
              $wrap[0].focus();
            }
          }
          syncAudioPlayPauseUI(true);
        },
        pause: function () {
          syncAudioPlayPauseUI(false);
        },
        ended: function () {
          syncAudioPlayPauseUI(false);
        },
        volumechange: function (e) {
          var opts = e.jPlayer && e.jPlayer.options;
          var muted = (opts && opts.muted) || (opts && opts.volume === 0);
          syncAudioMuteUI(Boolean(muted));
        },
        supplied: supplied,
        cssSelectorAncestor: '#' + containerId,
        smoothPlayBar: true,
        keyEnabled: false,
        globalVolume: true,
        playbackRate: 1
      });
    }

    function toggleAudioPlay() {
      if (!jpInited) {
        initJPlayerAndPlay();
        return;
      }
      var jpData = $jp.data('jPlayer');
      var status = (jpData && jpData.status) ? jpData.status : {};
      var paused = (status.paused !== undefined) ? status.paused : true;
      if (paused) {
        $jp.jPlayer('play');
      } else {
        $jp.jPlayer('pause');
      }
    }

    $wrap.find('.jp-play').on('click', toggleAudioPlay);
    $wrap.find('.jp-pause').on('click', toggleAudioPlay);

    $speed.on('change', function () {
      if (jpInited) {
        $jp.jPlayer('option', 'playbackRate', parseFloat(this.value));
      }
    });

    if (canAutoplayAudio) {
      initJPlayerAndPlay();
    }

    return {
      destroy: function () {
        if (jpInited && $jp.length) {
          $jp.jPlayer('destroy');
          $jp.remove();
        }
      }
    };
  }

  CV.registerRenderer('audio', function (item, $stage, inst, overlay) {
    return builtInAudioRenderer(item, $stage, inst, overlay);
  });

})(jQuery);
