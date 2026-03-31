/**
 * ComponentViewer v3 — Inline (code / text) renderer
 *
 * Registers the "inline" built-in renderer.
 * Depends on: utils.js, core.js
 */
(function ($) {
  'use strict';

  var CV = $.fn.componentViewer._cv;
  var U  = CV.Utils;

  /* Extension → Highlight.js language name */
  var INLINE_EXT_TO_LANG = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
    ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript',
    java: 'java', jsp: 'jsp',
    py: 'python', pyw: 'python', pyi: 'python',
    html: 'html', htm: 'html', xhtml: 'xml',
    css: 'css', scss: 'scss', less: 'less', sass: 'scss', styl: 'stylus',
    xml: 'xml', xsd: 'xml', xsl: 'xml', rss: 'xml', atom: 'xml', svg: 'xml', plist: 'xml',
    json: 'json', jsonc: 'json',
    php: 'php', phtml: 'php',
    rb: 'ruby', gemspec: 'ruby', rake: 'ruby',
    go: 'go', golang: 'go',
    rs: 'rust',
    cs: 'csharp',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
    kt: 'kotlin', kts: 'kotlin',
    swift: 'swift',
    scala: 'scala', sc: 'scala',
    clj: 'clojure', cljs: 'clojure', cljc: 'clojure',
    hs: 'haskell', lhs: 'haskell',
    lua: 'lua',
    r: 'r', rdata: 'r', rds: 'r',
    dart: 'dart',
    ex: 'elixir', exs: 'elixir',
    erl: 'erlang', hrl: 'erlang',
    pl: 'perl', pm: 'perl',
    sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', mkdown: 'markdown', mkd: 'markdown',
    toml: 'ini', ini: 'ini', cfg: 'ini',
    dockerfile: 'dockerfile', docker: 'dockerfile',
    makefile: 'makefile', mk: 'makefile', mak: 'makefile',
    gradle: 'gradle',
    groovy: 'groovy', gvy: 'groovy',
    graphql: 'graphql', gql: 'graphql',
    handlebars: 'handlebars', hbs: 'handlebars',
    haml: 'haml',
    coffeescript: 'coffeescript', coffee: 'coffeescript', cson: 'coffeescript',
    diff: 'diff', patch: 'diff',
    proto: 'protobuf', protobuf: 'protobuf',
    vb: 'vbnet', vbs: 'vbscript',
    ps1: 'powershell', ps: 'powershell', psm1: 'powershell',
    fs: 'fsharp', fsx: 'fsharp', fsi: 'fsharp',
    nim: 'nim', nimrod: 'nim',
    cr: 'crystal',
    v: 'verilog', sv: 'verilog', svh: 'verilog',
    jl: 'julia',
    elm: 'elm',
    vue: 'xml',
    svelte: 'svelte',
    tf: 'terraform', hcl: 'terraform',
    sol: 'solidity',
    adoc: 'asciidoc', asciidoc: 'asciidoc',
    nginx: 'nginx', nginxconf: 'nginx',
    apache: 'apache', apacheconf: 'apache',
    env: 'ini',
    csv: 'plaintext'
  };

  function inlineRawToHtml (text) {
    var lines = (U.isNullish(text) ? '' : String(text)).split(/\r\n|\n|\r/);
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += '<div class="cv-inline-line">' +
        '<span class="cv-inline-num">' + (i + 1) + '</span>' +
        '<span class="cv-inline-code">' + U.escHtml(lines[i]) + '</span>' +
        '</div>';
    }
    return html;
  }

  function getInlineLanguage (item, inst) {
    if (inst && inst.opts && inst.opts.inline && typeof inst.opts.inline.getLanguage === 'function') {
      var lang = inst.opts.inline.getLanguage(item);
      if (lang && typeof lang === 'string') {
        return lang.trim().toLowerCase();
      }
    }
    var ext = (item.fileExt || (item.title || '').split('.').pop() || '').toLowerCase();
    return INLINE_EXT_TO_LANG[ext] || ext || null;
  }

  function getInlineBodyHtml (content, item, inst) {
    var raw = U.isNullish(content) ? '' : String(content);
    if (inst && inst.opts && typeof inst.opts.onInlineHtml === 'function') {
      return inst.opts.onInlineHtml(raw, item, inst);
    }
    var useHljs = inst && inst.opts && inst.opts.inline && inst.opts.inline.syntaxHighlight &&
      typeof window !== 'undefined' && window.hljs && typeof window.hljs.highlight === 'function';
    if (!useHljs) {
      return inlineRawToHtml(raw);
    }
    /* highlight.js v9 API: highlight(languageName, code, ignore_illegals) */
    var lang = getInlineLanguage(item, inst) || 'plaintext';
    if (typeof window.hljs.getLanguage === 'function' && !window.hljs.getLanguage(lang)) {
      lang = 'plaintext';
    }
    var hl;
    try {
      hl = window.hljs.highlight(lang, raw, true);
    } catch (e) {
      hl = { value: U.escHtml(raw) };
    }
    var lineParts = hl.value.split(/\r\n|\n|\r/);
    var html = '';
    for (var i = 0; i < lineParts.length; i++) {
      html += '<div class="cv-inline-line">' +
        '<span class="cv-inline-num">' + (i + 1) + '</span>' +
        '<span class="cv-inline-code">' + lineParts[i] + '</span>' +
        '</div>';
    }
    return html;
  }

  function builtInInlineRenderer (item, $stage, inst) {
    function showInline (content) {
      var bodyHtml = getInlineBodyHtml(content, item, inst);
      var $wrap = $(
        '<div class="cv-inline-wrap">' +
          '<div class="cv-inline-body">' + bodyHtml + '</div>' +
        '</div>'
      );
      $stage.append($wrap);
    }

    if (!U.isNullish(item.content) && typeof item.content === 'string') {
      showInline(item.content);
      return { inlineContent: item.content };
    }
    var inlineSrcUrl = U.getResolvedSrcUrl(item, inst) || item.src;
    if (inlineSrcUrl && U.isSafeResourceUrl(inlineSrcUrl)) {
      var $placeholder = $('<div class="cv-inline-wrap"><div class="cv-inline-loading"><div class="cv-inline-spinner"></div></div></div>');
      $stage.append($placeholder);
      fetch(inlineSrcUrl, { method: 'GET', credentials: 'include' })
        .then(function (r) {
          return r.text();
        })
        .then(function (text) {
          if (inst) {
            inst._inlineContent = text;
          }
          $placeholder.find('.cv-inline-loading').replaceWith($('<div class="cv-inline-body">').html(getInlineBodyHtml(text, item, inst)));
        })
        .catch(function () {
          $placeholder.remove();
          U.showError($stage, 'inline', 'Could not load file for inline view', item);
        });
      return {};
    }
    U.showError($stage, 'inline', 'No content or invalid URL for inline view', item);
    return null;
  }

  /* Expose getInlineBodyHtml on Utils — core needs it for toggle-source */
  U.getInlineBodyHtml = getInlineBodyHtml;

  CV.registerRenderer('inline', builtInInlineRenderer);

}(jQuery));
