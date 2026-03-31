/**
 * ComponentViewer v3 — Poll option feature
 *
 * Injects poll-option rendering into the overlay singleton.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  function initPoll (overlay) {

    overlay._updatePollOption = function (inst, item) {
      var opts = inst.opts.pollOption;
      overlay.$pollOption.removeClass('cv-active').empty();
      if (overlay._isHtmlItem) {
        return;
      }
      if (!opts || !opts.enabled || U.isNullish(item.pollOptionLabel) || String(item.pollOptionLabel).trim() === '') {
        return;
      }

      var mode = (opts.mode === 'checkbox') ? 'checkbox' : 'radio';
      var value = (!U.isNullish(item.pollOptionId)) ? String(item.pollOptionId) : ('idx-' + inst.idx);

      if (mode === 'radio') {
        if (inst._pollSelectedValue === undefined) {
          inst._pollSelectedValue = null;
        }
      } else if (!inst._pollSelectedSet) {
        inst._pollSelectedSet = new Set();
      }

      var isSelected = item.pollOptionSelected === true || item.pollOptionSelected === 'true' || item.pollOptionSelected === 1;
      if (isSelected) {
        if (mode === 'radio') {
          inst._pollSelectedValue = value;
        } else {
          inst._pollSelectedSet.add(value);
        }
      }

      var isChecked = mode === 'radio' ?
        (inst._pollSelectedValue === value) :
        inst._pollSelectedSet.has(value);

      var radioName = 'cv-poll-' + inst.id;
      var inputId = 'cv-poll-input-' + inst.id + '-' + value.replace(/[^a-z0-9-]/gi, '-');
      var inputHtml = mode === 'radio' ?
        '<input type="radio" name="' + U.escHtml(radioName) + '" value="' + U.escHtml(value) + '" id="' + U.escHtml(inputId) + '"' + (isChecked ? ' checked' : '') + '>' :
        '<input type="checkbox" id="' + U.escHtml(inputId) + '" value="' + U.escHtml(value) + '"' + (isChecked ? ' checked' : '') + '>';

      var updatedText = U.str(inst, 'pollUpdated');
      var $wrap = $(
        '<div class="cv-poll-option-inner">' +
          '<label class="cv-poll-option-label-wrap">' + inputHtml +
          '<span class="cv-poll-option-label">' + U.escHtml(String(item.pollOptionLabel)) + '</span></label>' +
          '<span class="cv-poll-option-updated cv-hidden" aria-live="polite">' + U.escHtml(updatedText) + '</span>' +
        '</div>'
      );
      overlay.$pollOption.append($wrap).addClass('cv-active');

      var $updatedSpan = $wrap.find('.cv-poll-option-updated');
      $wrap.find('input').on('change', function () {
        var checked = this.checked;
        if (mode === 'radio') {
          inst._pollSelectedValue = checked ? value : null;
        } else if (checked) {
          inst._pollSelectedSet.add(value);
        } else {
          inst._pollSelectedSet.delete(value);
        }
        if (typeof opts.onSelect === 'function') {
          opts.onSelect(item, checked, inst, item.$el ? item.$el[0] : null);
        }
        $updatedSpan.removeClass('cv-hidden');
        clearTimeout(inst._pollUpdatedTimer);
        inst._pollUpdatedTimer = setTimeout(function () {
          $updatedSpan.addClass('cv-hidden');
        }, 3000);
      });
    };
  }

  CV.registerFeature('poll', initPoll);

}(jQuery));
