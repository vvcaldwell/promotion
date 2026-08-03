'use strict';
/* ==========================================================================
Dr. Vladislav D. Veksler - Faculty Advancement Portfolio
SPA JavaScript — YAML-driven content renderer with marked.js
========================================================================== */

(function () {

  /* ---------- State ---------- */
  var state = {
    data: null,
    sectionIndex: 0,
    sections: [],
    marked: null,
  };

  /* ---------- Load marked.js (ESM) ---------- */
  function loadMarked() {
    return import('./marked.esm.min.js').then(function (mod) {
      state.marked = mod.marked;
      /* Links: external links open in a new tab; internal (hash) links stay in same tab */
      var renderer = new mod.marked.Renderer();
      var originalLink = renderer.link.bind(renderer);
      renderer.link = function (href, title, text) {
        var html = originalLink(href, title, text);
        var link = (typeof href === 'string') ? href : (href && href.href) || '';
        if (link.charAt(0) === '#') return html;
        return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
      };
      mod.marked.setOptions({ renderer: renderer });
    });
  }

  /* ---------- Config Helpers ---------- */
  function getConfig() {
    return state.data || {};
  }

  function getLabel(key) {
    var labels = state.data.Labels || {};
    return labels[key] || '';
  }

  /* ---------- Apply Config to Page ---------- */
  function applyConfig() {
    var cfg = getConfig();

    /* Tab title */
    document.title = cfg['site name'] || cfg['site-name'] || cfg.title || 'Faculty Advancement Portfolio';

    /* Meta description */
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', cfg['site description'] || cfg['site-description'] || document.title);
    }

    /* Site Header */
    var logo = document.querySelector('.sidebar-logo');
    if (logo && cfg.logo) {
      logo.src = cfg.logo;
      logo.alt = cfg['logo alt'] || cfg['logo-alt'] || '';
    }
    var titleEl = document.querySelector('[data-bind="title"]');
    if (titleEl && cfg.title) {
      titleEl.textContent = escHtml(cfg.title);
    }
    var subtitleEl = document.querySelector('[data-bind="subtitle"]');
    if (subtitleEl && cfg.subtitle) {
      subtitleEl.innerHTML = escHtml(cfg.subtitle);
    }

    /* Footer (rendered from Footer field as markdown) */
    var footerContainer = document.getElementById('footer-content');
    var footerEl = document.getElementById('site-footer');
    if (cfg.footer) {
      footerContainer.innerHTML = renderMarkdown(cfg.footer);
      footerEl.style.display = '';
    } else {
      footerContainer.innerHTML = '';
      footerEl.style.display = 'none';
    }

    /* Loading label */
    var loadingEl = document.querySelector('[data-bind="loading"]');
    if (loadingEl) {
      loadingEl.textContent = getLabel('loading') || 'Loading portfolio…';
    }
  }

  /* ---------- YAML Filename (configurable via ?yaml=file.yaml) ---------- */
  function getYamlFilename() {
    var params = new URLSearchParams(window.location.search);
    var yamlFile = params.get('yaml');
    if (yamlFile) return yamlFile;
    return 'content.yaml';
  }

  /* ---------- YAML Fetch & Parse ---------- */
  function loadYAML() {
    return fetch(getYamlFilename())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        state.data = jsyaml.load(text);
        applyConfig();
        state.sections = state.data.sections || [];
        buildSidebar();
        var initIdx = indexFromHash();
        if (initIdx < 0) initIdx = 0;
        renderSection(initIdx);
        var loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
      })
      .catch(function (err) {
        var loading = document.getElementById('loading');
        if (loading) {
          loading.innerHTML =
            '<p style="color:var(--caldwell-red)">' + escHtml(getLabel('loadError') || 'Failed to load portfolio data.') + '</p>' +
            '<p style="font-size:0.85rem;color:var(--text-muted)">' + escHtml(err.message) + '</p>';
        } else {
          console.error('Failed to load portfolio data:', err.message);
        }
      });
  }

  /* ---------- Hash Helpers ---------- */
  function hashFromIndex(idx) {
    return '#' + encodeURIComponent(state.sections[idx].name);
  }

  function indexFromHash() {
    var hash = location.hash;
    if (!hash) return -1;
    var name = decodeURIComponent(hash.slice(1));
    for (var i = 0; i < state.sections.length; i++) {
      if (state.sections[i].name === name) return i;
    }
    return -1;
  }

  /* ---------- Navigation Bar ---------- */
  function buildSidebar() {
    var nav = document.getElementById('nav-bar');
    if (!nav) return;
    var wrapper = nav.parentElement;
    nav.innerHTML = '';
    state.sections.forEach(function (sec, idx) {
      var a = document.createElement('a');
      a.href = hashFromIndex(idx);
      a.textContent = sec.name;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        /* Scroll nav bar so clicked link is centered */
        var ulRect = nav.getBoundingClientRect();
        var linkRect = a.getBoundingClientRect();
        var linkLeft = linkRect.left - ulRect.left;
        var linkWidth = linkRect.width;
        var visibleWidth = ulRect.width;
        var desiredScroll = nav.scrollLeft + (linkLeft - (visibleWidth - linkWidth) / 2);
        var maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
        desiredScroll = Math.max(0, Math.min(desiredScroll, maxScroll));
        nav.scrollTo({ left: desiredScroll, behavior: 'smooth' });
        /* Push history entry and navigate */
        history.pushState(null, '', hashFromIndex(idx));
        renderSection(idx, idx);
        window.scrollTo(0, 0);
      });
      nav.appendChild(a);
    });
    /* Scroll fade listeners */
    if (nav.scrollWidth > nav.clientWidth) {
      wrapper.classList.add('has-scroll');
    }
    nav.addEventListener('scroll', function () {
      var s = nav.scrollLeft;
      var max = nav.scrollWidth - nav.clientWidth;
      if (max <= 0) return;
      wrapper.classList.toggle('show-left', s > 4);
      wrapper.classList.toggle('show-right', s < max - 4);
    });
    nav.dispatchEvent(new Event('scroll'));
  }

  function updateActiveNav(clickedIdx) {
    var links = document.querySelectorAll('#nav-bar a');
    links.forEach(function (a, idx) {
      a.classList.toggle('active', idx === state.sectionIndex);
    });
    /* Scroll the next link into view (browser queues smooth scrolls sequentially) */
    if (clickedIdx !== undefined && clickedIdx < links.length - 1) {
      var nextLink = links[clickedIdx];
      if (nextLink) {
        nextLink.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }

  /* ---------- Content Rendering ---------- */
  function renderSection(index, clickedIdx) {
    state.sectionIndex = index;
    updateActiveNav(clickedIdx);

    var sec = state.sections[index];
    var content = document.getElementById('content');
    if (!content) return;

    var html = '';

    /* 1. Banner (title + subtitle) */
    if (sec.title) {
      html += '<div class="page-banner"><h1>' + escHtml(sec.title) + '</h1>';
      if (sec.subtitle) {
        html += '<div class="subtitle">' + renderMarkdown(sec.subtitle) + '</div>';
      }
      html += '</div>';
    }

    /* 2. Content blocks (typed array) */
    if (sec.content && sec.content.length > 0) {
      for (var i = 0; i < sec.content.length; i++) {
        var block = sec.content[i];
        switch (block.type) {
          case 'photos':   html += buildSlideshow(block.content, block.randomize); break;
          case 'badges':   html += renderBadges(block.content); break;
          case 'highlights': html += renderHighlights(block.content); break;
          case 'markdown': html += renderMarkdownBlock(block); break;
          case 'buttons':  html += renderButtons(block); break;
          case 'links':    html += renderLinks(block); break;
          case 'quotes':   html += renderQuotes(block); break;
          case 'timeline': html += renderTimeline(block.content); break;
        }
      }
    }

    content.innerHTML = html;

    /* Initialize all slideshows */
    var slideshows = content.querySelectorAll('.slideshow');
    for (var i = 0; i < slideshows.length; i++) {
      initSlideshow(slideshows[i]);
    }

    /* Initialize auto-scroll on all scrollable content blocks */
    var scrollContainers = content.querySelectorAll('[data-auto-scroll]');
    for (var i = 0; i < scrollContainers.length; i++) {
      initAutoScroll(scrollContainers[i]);
    }
  }

  /* ---------- Slideshow ---------- */
  function buildSlideshow(photoPaths, randomize) {
    if (randomize) {
      for (var i = photoPaths.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = photoPaths[i];
        photoPaths[i] = photoPaths[j];
        photoPaths[j] = tmp;
      }
    }
    var html = '<div class="slideshow">';
    html += '<div class="slideshow-track">';
    photoPaths.forEach(function (path) {
      html += '<div class="slideshow-frame">';
      html += '<div class="slideshow-bar slideshow-bar-left"></div>';
      html += '<img class="slideshow-photo" src="' + escHtml(path) + '" alt="">';
      html += '<div class="slideshow-bar slideshow-bar-right"></div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="slideshow-dots">';
    let first=true;
    photoPaths.forEach(function () {
      html += `<button class="slideshow-dot${first?' active':''}" aria-label="Go to photo"></button>`;
      first = false;
    });
    html += '</div></div>';
    return html;
  }

  function initPhotoBars(frame) {
    var img = frame.querySelector('.slideshow-photo');
    if (!img) return;
    /* If image is already loaded and cached, check immediately */
    if (img.complete && img.naturalWidth > 0) {
      applyPhotoBars(frame, img);
    } else {
      img.addEventListener('load', function () {
        applyPhotoBars(frame, img);
      });
    }
    /* Also handle error state (broken image = no bars) */
    img.addEventListener('error', function () {
      frame.classList.remove('portrait');
    });
  }

  function applyPhotoBars(frame, img) {
    if (img.naturalHeight > img.naturalWidth) {
      frame.classList.add('portrait');
    } else {
      frame.classList.remove('portrait');
    }
  }

  function initSlideshow(slideshow) {
    var track = slideshow.querySelector('.slideshow-track');
    var dots = slideshow.querySelectorAll('.slideshow-dot');
    var total = dots.length;
    if (total === 0) return;

    /* Detect portrait vs landscape for each image */
    var frames = track.querySelectorAll('.slideshow-frame');
    frames.forEach(function (frame) {
      initPhotoBars(frame);
    });

    var current = 0;

    function goTo(index) {
      current = (index + total) % total;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === current);
      });
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goTo(i); });
    });

    /* Auto-advance every 5 seconds */
    setInterval(function () { goTo(current + 1); }, 5000);
  }

  /* ---------- Auto-Scroll Quote Container ---------- */
  function initAutoScroll(container) {
    var speed = parseFloat(container.getAttribute('data-auto-scroll'));
    if (isNaN(speed) || speed <= 0) return;

    var speedPx = speed; /* will convert to px on first frame */
    var rafId = null;
    var pauseStart = performance.now();
    var baseOffset = 0; /* scroll position saved when paused */
    var pauseAt = 0; /* pauseStart value when we entered mouse pause */
    var endPauseStart = 0; /* rAF timestamp when bottom was reached (0 = not end-pausing) */

    function tick(ts) {
      /* Convert em to px once */
      if (speedPx === speed) {
        var em = parseFloat(getComputedStyle(container).fontSize);
        speedPx = speed * em;
      }

      var scrollDist = container.scrollHeight - container.clientHeight;
      if (scrollDist <= 0) return;

      /* If end-pausing at bottom, wait for 1 second */
      if (endPauseStart) {
        /* If user scrolled away from bottom, cancel end-pause */
        if (container.scrollTop < scrollDist - 1) {
          endPauseStart = 0;
        } else if (ts - endPauseStart >= 1000) {
          /* Done waiting — jump to top and resume scrolling */
          container.scrollTop = 0;
          pauseStart = ts;
          baseOffset = 0;
          endPauseStart = 0;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      /* Normal scrolling: elapsed time since last start/resume */
      var elapsed = ts - pauseStart;
      var autoScrollDist = (elapsed / 1000) * speedPx;
      var nextPos = baseOffset + autoScrollDist;

      /* Detect crossing the bottom (handles high speeds that skip over it) */
      var wrapped = Math.floor(nextPos / scrollDist) > Math.floor(baseOffset / scrollDist);
      if (wrapped) {
        /* Jumped past the bottom — trigger end-pause */
        container.scrollTop = scrollDist;
        endPauseStart = ts;
        /* Keep rAF alive so end-pause logic takes over */
        rafId = requestAnimationFrame(tick);
        return;
      }

      container.scrollTop = Math.floor(nextPos % scrollDist);

      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      if (!rafId) return;
      cancelAnimationFrame(rafId);
      rafId = null;
      pauseAt = pauseStart; /* remember when the pause began */
      baseOffset = container.scrollTop; /* save current scroll position */
    }

    function start() {
      if (!rafId) {
        /* Always resume from wherever the container actually is */
        baseOffset = container.scrollTop;
        var pausedFor = performance.now() - pauseAt;
        pauseStart = pauseStart + pausedFor;
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);

    container.addEventListener('mouseenter', stop);
    container.addEventListener('mouseleave', start);
    container.addEventListener('wheel', function () {
      baseOffset = container.scrollTop; /* update anchor so scroll position is remembered */
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
    });
  }

  /* ---------- Badge Chips ---------- */
  function renderBadges(labels) {
    var html = '<div class="badges">';
    for (var i = 0; i < labels.length; i++) {
      html += '<span class="badge">' + escHtml(labels[i]) + '</span>';
    }
    return html + '</div>';
  }

  /* ---------- Stat Cards (Highlights) ---------- */
  function renderHighlights(items) {
    var html = '<div class="metrics-grid">';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="metric-card">' +
        '<div class="metric-number">' + escHtml(items[i].title) + '</div>' +
        '<div class="metric-label">' + renderMarkdown(items[i].text) + '</div>' +
        '</div>';
    }
    return html + '</div>';
  }

  /* ---------- Markdown Block (with optional title) ---------- */
  function renderMarkdownBlock(block) {
    var html = '<div class="content-section">';
    if (block.title) {
      html += '<h2 class="block-title">' + escHtml(block.title) + '</h2>';
    }
    var maxHeight = block['max-height'];
    var autoScroll = block['auto-scroll'];
    if (maxHeight) {
      var attrs = 'class="content-text" style="max-height:' + escHtml(String(maxHeight)) + 'em"';
      if (autoScroll) {
        attrs += ' data-auto-scroll="' + escHtml(String(Number(autoScroll))) + '"';
      }
      html += '<div ' + attrs + '>' + renderMarkdown(block.content) + '</div>';
    } else {
      html += '<div class="content-text">' + renderMarkdown(block.content) + '</div>';
    }
    return html + '</div>';
  }

  /* ---------- Buttons ---------- */
  function renderButtons(block) {
    var html = '<div class="content-section">';
    if (block.title) {
      html += '<h2 class="block-title">' + escHtml(block.title) + '</h2>';
    }
    html += '<div class="link-cards">';
    var links = block.content;
    for (var i = 0; i < links.length; i++) {
      var link = links[i].link;
      var isPreviewable = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(link);
      var attrs = 'class="btn btn-primary" href="' + escHtml(link) + '" rel="noopener"';
      if (isPreviewable) {
        attrs += ' data-preview="1"';
      } else {
        attrs += ' target="_blank"';
      }
      html += '<a ' + attrs + '>' + escHtml(links[i].text || links[i].title) + '</a>';
    }
    return html + '</div></div>';
  }

  /* ---------- Vertical Link List ---------- */
  function renderLinks(block) {
    var html = '<div class="content-section">';
    if (block.title) {
      html += '<h2 class="block-title">' + escHtml(block.title) + '</h2>';
    }
    html += '<ul class="link-list">';
    var links = block.content;
    for (var i = 0; i < links.length; i++) {
      var link = links[i].link;
      var isPreviewable = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(link);
      var attrs = 'href="' + escHtml(link) + '" rel="noopener"';
      if (isPreviewable) {
        attrs += ' class="link-list-item" data-preview="1"';
      } else {
        attrs += ' class="link-list-item" target="_blank"';
      }
      html += '<li><a ' + attrs + '>' + escHtml(links[i].title) + '</a></li>';
    }
    return html + '</ul></div>';
  }

  /* ---------- Preview Modal ---------- */
  var _modalHref = '';

  function openModal(href, title) {
    var modal = document.getElementById('preview-modal');
    var preview = document.getElementById('modal-preview');

    _modalHref = href;

    /* Build preview based on file type */
    var isPdf = /\.pdf$/i.test(href);
    if (isPdf) {
      preview.innerHTML = '<iframe src="' + escHtml(href) + '#toolbar=0&navpanes=0" title="' + escHtml(title) + '"></iframe>';
    } else {
      preview.innerHTML = '<img src="' + escHtml(href) + '" alt="' + escHtml(title) + '">';
    }

    modal.style.display = 'flex';
  }

  function downloadFile() {
    fetch(_modalHref)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var name = _modalHref.split('/').pop();
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  }

  function closeModal() {
    var modal = document.getElementById('preview-modal');
    document.getElementById('modal-preview').innerHTML = '';
    modal.style.display = 'none';
  }

  /* ---------- Event Delegation ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.link-cards .btn-primary, .link-list-item[data-preview="1"]');
    if (btn && btn.getAttribute('data-preview') === '1') {
      e.preventDefault();
      e.stopPropagation();
      openModal(btn.getAttribute('href'), btn.textContent);
    }
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('modal-download').addEventListener('click', downloadFile);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  /* ---------- Quote Cards ---------- */
  function renderQuotes(block) {
    var html = '<div class="content-section">';
    html += '<h2 class="block-title">' + escHtml(block.title) + '</h2>';
    var maxHeight = block['max-height'];
    var autoScroll = block['auto-scroll'];
    if (maxHeight) {
      var attrs = 'class="quote-scroll" style="max-height:' + escHtml(String(maxHeight)) + 'em"';
      if (autoScroll) {
        attrs += ' data-auto-scroll="' + escHtml(String(Number(autoScroll))) + '"';
      }
      html += '<div ' + attrs + '>';
      html += '<div class="quote-grid">';
      for (var i = 0; i < block.content.length; i++) {
        html += '<div class="quote-card">' + renderMarkdown(block.content[i]) + '</div>';
      }
      html += '</div></div>';
    } else {
      html += '<div class="quote-grid">';
      for (var i = 0; i < block.content.length; i++) {
        html += '<div class="quote-card">' + renderMarkdown(block.content[i]) + '</div>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ---------- Timeline ---------- */
  function renderTimeline(items) {
    var html = '<div class="content-section timeline"><h2>' +
      escHtml(getLabel('careerTimeline') || 'Career Timeline') + '</h2><ul class="timeline-list">';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      html += '<li class="timeline-item">';
      if (item.date)  html += '<span class="date">' + escHtml(item.date) + '</span>';
      if (item.title) html += '<div class="title">' + escHtml(item.title) + '</div>';
      if (item.subtitle) html += '<div class="subtitle">' + renderMarkdown(item.subtitle) + '</div>';
      html += '</li>';
    }
    return html + '</ul></div>';
  }

  /* ---------- Markdown Renderer (marked.js) ---------- */
  function renderMarkdown(text) {
    if (!text) return '';
    return state.marked.parse(text);
  }

  /* ---------- HTML Escaper ---------- */
  function escHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- Initialize ---------- */
  loadMarked()
    .then(function () {
      loadYAML();
      /* Handle browser back/forward */
      window.addEventListener('hashchange', function () {
        var idx = indexFromHash();
        if (idx < 0) idx = 0;
        renderSection(idx);
        window.scrollTo(0, 0);
      });
    });

})();
