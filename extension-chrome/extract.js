/*
 * extract.js : extraction universelle (prix, titre, image, marchand) d'une page produit.
 *
 * Un seul fichier pour les deux usages :
 *  - iPhone : à coller tel quel dans « Exécuter JavaScript sur la page web » (Raccourcis).
 *             Il renvoie {"url": "..."} via completion().
 *  - PC     : injecté par l'extension avec
 *             chrome.scripting.executeScript({ target: { tabId }, files: ['extract.js'] })
 *             Il renvoie directement l'objet {price, title, image, store, src}.
 */
(function () {
  var BASE = 'https://frodotitto.github.io/listes_cadeaux/';

  function extractProduct() {
    var src = {};
    var hostname = location.hostname;
    var isAmazon = /(^|\.)amazon\./i.test(hostname);
    var isFnac = /(^|\.)fnac\./i.test(hostname);
    var junk = /(sprite|logo|icon|loader|spinner|placeholder|blank|pixel|spacer|avatar|badge|flag|\.svg(\?|$))/i;

    function clean(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
    function meta(sel) {
      var e = document.querySelector(sel);
      return e ? (e.getAttribute('content') || '').trim() : '';
    }
    function txt(sel) {
      var e = document.querySelector(sel);
      return e ? clean(e.textContent) : '';
    }
    function abs(u) {
      if (!u || typeof u !== 'string') return '';
      u = u.trim();
      if (!u || /^data:/i.test(u)) return '';
      try { return new URL(u, location.href).href; } catch (e) { return ''; }
    }
    function visible(e) {
      return !!(e && e.getClientRects && e.getClientRects().length);
    }
    function decode(s) {
      var t = document.createElement('textarea');
      t.innerHTML = s;
      return t.value;
    }
    function isType(n, t) {
      var ty = n['@type'];
      return ty === t || (Array.isArray(ty) && ty.indexOf(t) > -1);
    }
    function fmt(p, c) {
      var cur = String(c || 'EUR').toUpperCase();
      var sym = { EUR: '€', USD: '$', GBP: '£' }[cur] || cur;
      var s = String(p).trim();
      if (cur === 'EUR') s = s.replace('.', ',');
      return s + ' ' + sym;
    }
    function fmtRaw(v, c) {
      v = clean(v);
      return /^\d[\d.,\s]*$/.test(v) ? fmt(v, c) : v;
    }
    function run(steps, key) {
      for (var i = 0; i < steps.length; i++) {
        try {
          var v = steps[i][1]();
          if (v) { src[key] = steps[i][0]; return v; }
        } catch (e) {}
      }
      return '';
    }

    function struck(e) {
      for (var n = e, d = 0; n && d < 6; n = n.parentElement, d++) {
        if (/^(DEL|S|STRIKE)$/.test(n.tagName)) return true;
        if (/(^|[\s_-])(old|was|before|strike|strikethrough|crossed|compare)([\s_-]|$)/i.test(n.getAttribute('class') || '')) return true;
      }
      return false;
    }

    function firstPrice(sels) {
      for (var i = 0; i < sels.length; i++) {
        var list = document.querySelectorAll(sels[i]);
        for (var j = 0; j < list.length; j++) {
          var e = list[j];
          var t = e.getAttribute('content') || e.textContent;
          if (t && /\d/.test(t) && t.length < 60 && !struck(e)) return clean(t);
        }
      }
      return '';
    }

    var ldNodes = [];
    var ldRaw = [];
    var byId = {};
    function parseLd(raw) {
      try { return JSON.parse(raw); } catch (e) {}
      try { return JSON.parse(raw.replace(/[\u0000-\u001F]+/g, ' ')); } catch (e) {}
      return null;
    }
    function collect(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(collect); return; }
      ldNodes.push(node);
      var id = node['@id'];
      if (id && (!byId[id] || Object.keys(node).length > Object.keys(byId[id]).length)) {
        byId[id] = node;
      }
      Object.keys(node).forEach(function (k) {
        if (node[k] && typeof node[k] === 'object') collect(node[k]);
      });
    }
    try {
      var scs = document.querySelectorAll('script[type="application/ld+json"]');
      for (var s = 0; s < scs.length; s++) {
        var raw = scs[s].textContent || '';
        ldRaw.push(raw);
        var parsed = parseLd(raw);
        if (parsed) collect(parsed);
      }
    } catch (e) {}

    function priceFromOffer(o) {
      if (!o) return null;
      if (Array.isArray(o)) {
        for (var i = 0; i < o.length; i++) {
          var r = priceFromOffer(o[i]);
          if (r) return r;
        }
        return null;
      }
      if (typeof o !== 'object') return null;
      var p = o.price || o.lowPrice;
      if (p !== undefined && p !== null && p !== '') return { p: String(p), c: o.priceCurrency || '' };
      if (o['@id'] && byId[o['@id']] && byId[o['@id']] !== o) {
        var rr = priceFromOffer(byId[o['@id']]);
        if (rr) return rr;
      }
      return priceFromOffer(o.priceSpecification) || priceFromOffer(o.offers);
    }

    function resolveImg(im) {
      if (!im) return '';
      if (Array.isArray(im)) {
        for (var i = 0; i < im.length; i++) {
          var r = resolveImg(im[i]);
          if (r) return r;
        }
        return '';
      }
      if (typeof im === 'string') return abs(im);
      if (typeof im === 'object') {
        if (!im.url && !im.contentUrl && im['@id'] && byId[im['@id']]) im = byId[im['@id']];
        return abs(im.url || im.contentUrl);
      }
      return '';
    }

    function bestFromSrcset(ss) {
      if (!ss) return '';
      var best = '', bw = -1;
      ss.split(/,\s+/).forEach(function (part) {
        var m = part.trim().split(/\s+/);
        if (!m[0]) return;
        var w = m[1] ? parseFloat(m[1]) : 1;
        if (w > bw) { bw = w; best = m[0]; }
      });
      return best;
    }
    function pickSrc(img) {
      var attrs = ['data-old-hires', 'data-large_image', 'data-zoom-image', 'data-full', 'data-original-src'];
      for (var i = 0; i < attrs.length; i++) {
        var u = abs(img.getAttribute(attrs[i]));
        if (u) return u;
      }
      var u2 = abs(bestFromSrcset(img.getAttribute('srcset') || img.getAttribute('data-srcset')));
      if (u2) return u2;
      return abs(img.getAttribute('data-src')) ||
             abs(img.getAttribute('data-lazy-src')) ||
             abs(img.getAttribute('data-original')) ||
             abs(img.currentSrc) ||
             abs(img.getAttribute('src'));
    }

    var price = run([
      ['known', function () {
        if (isFnac) {
          var fnacEl = document.querySelector('.f-priceBox__price') ||
                       document.querySelector('.f-buyBox-availabilityOffer .price') ||
                       document.querySelector('.priceText');
          if (fnacEl) {
            var rawT = fnacEl.innerText.replace(/[^\d,\.]/g, '').trim();
            if (rawT) return rawT.replace('.', ',') + ' €';
          }
        }
        return firstPrice([
          '#apex-pricetopay-accessibility-label',
          '.apexPriceToPay .a-offscreen',
          '#corePrice_feature_div .a-offscreen',
          '#corePriceDisplay_desktop_feature_div .a-offscreen',
          '#corePriceDisplay_mobile_feature_div .a-offscreen',
          '#price_inside_buybox',
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '.f-priceBox__price',
          '[data-automation-id="product-price"]'
        ]);
      }],
      ['ld', function () {
        for (var i = 0; i < ldNodes.length; i++) {
          if (ldNodes[i].offers) {
            var r = priceFromOffer(ldNodes[i].offers);
            if (r) return fmt(r.p, r.c);
          }
        }
        return '';
      }],
      ['ld-regex', function () {
        for (var i = 0; i < ldRaw.length; i++) {
          var m = ldRaw[i].match(/"(?:price|lowPrice)"\s*:\s*"?(\d[\d.,]*)"?/);
          if (m) {
            var c = ldRaw[i].match(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/);
            return fmt(m[1], c ? c[1] : '');
          }
        }
        return '';
      }],
      ['meta', function () {
        var v = meta('meta[property="product:price:amount"]') ||
                meta('meta[property="og:price:amount"]') ||
                meta('meta[itemprop="price"]');
        if (!v) return '';
        var c = meta('meta[property="product:price:currency"]') ||
                meta('meta[property="og:price:currency"]') ||
                meta('meta[itemprop="priceCurrency"]');
        return fmtRaw(v, c);
      }],
      ['microdata', function () {
        var e = document.querySelector('[itemprop="price"]');
        if (!e) return '';
        var v = e.getAttribute('content') || e.textContent;
        if (!v || !clean(v)) return '';
        var ce = document.querySelector('[itemprop="priceCurrency"]');
        var c = ce ? clean(ce.getAttribute('content') || ce.textContent) : '';
        return fmtRaw(v, c);
      }],
      ['cms', function () {
        return firstPrice([
          '.summary .woocommerce-Price-amount',
          '.entry-summary .woocommerce-Price-amount',
          'p.price .woocommerce-Price-amount',
          '.price .woocommerce-Price-amount',
          '.price-item--sale',
          '.price__current .price-item',
          '.price-item--regular',
          '[data-product-price]',
          '.product__price',
          '.current-price-value',
          '.product-price',
          '[data-price-type="finalPrice"] .price',
          '.price-final_price .price',
          '.special-price .price'
        ]);
      }],
      ['heuristic', function () {
        var re = /^\s*(?:(?:dès|à partir de|from)\s*)?(?:[€$£]\s?\d[\d\s\u00a0.,]*|\d[\d\s\u00a0.,]*\s?(?:€|EUR|\$|£))\s*(?:TTC|HT)?\s*$/i;
        var all = document.body.getElementsByTagName('*');
        var h1 = document.querySelector('h1');
        var h1i = -1, best = '', bestD = 1e9, i;
        for (i = 0; i < all.length; i++) {
          if (all[i] === h1) { h1i = i; break; }
        }
        for (i = 0; i < all.length; i++) {
          var e = all[i];
          if (e.children.length > 3) continue;
          var t = e.textContent;
          if (!t || t.length > 30 || !re.test(t) || !visible(e) || struck(e)) continue;
          var dist = h1i < 0 ? i : Math.abs(i - h1i);
          if (dist < bestD) { bestD = dist; best = clean(t); }
        }
        return best;
      }]
    ], 'price');

    var image = run([
      ['amazon', function () {
        if (!isAmazon) return '';
        var img = document.querySelector('#landingImage') ||
                  document.querySelector('#imgBlkFront') ||
                  document.querySelector('#main-image') ||
                  document.querySelector('#imgTagWrapperId img') ||
                  document.querySelector('#imageBlock img.a-dynamic-image') ||
                  document.querySelector('img.a-dynamic-image');
        return img ? pickSrc(img) : '';
      }],
      ['ld', function () {
        var i, r, n;
        for (i = 0; i < ldNodes.length; i++) {
          n = ldNodes[i];
          if ((isType(n, 'Product') || isType(n, 'ProductGroup')) && n.image) {
            r = resolveImg(n.image);
            if (r) return r;
          }
        }
        for (i = 0; i < ldNodes.length; i++) {
          if (ldNodes[i].primaryImageOfPage) {
            r = resolveImg(ldNodes[i].primaryImageOfPage);
            if (r) return r;
          }
        }
        return '';
      }],
      ['meta', function () {
        var lk = document.querySelector('link[rel="image_src"]');
        return abs(meta('meta[property="og:image:secure_url"]')) ||
               abs(meta('meta[property="og:image"]')) ||
               abs(meta('meta[name="twitter:image"]')) ||
               abs(meta('meta[name="twitter:image:src"]')) ||
               abs(meta('meta[itemprop="image"]')) ||
               abs(lk && lk.getAttribute('href'));
      }],
      ['gallery', function () {
        var sel = [
          '.woocommerce-product-gallery__image img',
          '.woocommerce-product-gallery img',
          '.product__media img',
          '.product-single__photo',
          '.product-gallery img',
          '.product-main-image img',
          '.product-cover img',
          '.js-qv-product-cover',
          '#bigpic',
          '#image-block img',
          '.gallery-placeholder img',
          '.fotorama__img',
          '.pdp-image img',
          'img[itemprop="image"]'
        ];
        for (var i = 0; i < sel.length; i++) {
          var list = document.querySelectorAll(sel[i]);
          for (var j = 0; j < list.length; j++) {
            if (list[j].tagName !== 'IMG') continue;
            var u = pickSrc(list[j]);
            if (u && !junk.test(u)) return u;
          }
        }
        return '';
      }],
      ['biggest', function () {
        var imgs = document.images, best = '', bestA = 0, n, d;
        var skipAnc = /related|similar|recommend|upsell|cross-?sell|recent|viewed/i;
        for (var i = 0; i < imgs.length; i++) {
          var im = imgs[i];
          var r = im.getBoundingClientRect();
          if (r.width < 150 || r.height < 150 || !visible(im)) continue;
          if (im.closest && im.closest('nav, footer, header')) continue;
          var skip = false;
          for (n = im, d = 0; n && d < 8; n = n.parentElement, d++) {
            if (skipAnc.test((n.getAttribute && n.getAttribute('class')) || '') || skipAnc.test(n.id || '')) {
              skip = true;
              break;
            }
          }
          if (skip) continue;
          var u = pickSrc(im);
          if (!u || junk.test(u)) continue;
          var a = r.width * r.height;
          if (a > bestA) { bestA = a; best = u; }
        }
        return best;
      }]
    ], 'image');

    var rawTitle = run([
      ['amazon', function () {
        return isAmazon ? (txt('#productTitle') || txt('#title')) : '';
      }],
      ['ld', function () {
        for (var i = 0; i < ldNodes.length; i++) {
          var n = ldNodes[i];
          if ((isType(n, 'Product') || isType(n, 'ProductGroup')) && n.name) {
            return clean(decode(String(n.name)));
          }
        }
        return '';
      }],
      ['h1', function () {
        var hs = document.querySelectorAll('h1');
        for (var i = 0; i < hs.length; i++) {
          var t = clean(hs[i].textContent);
          if (t.length > 2 && visible(hs[i])) return t;
        }
        return '';
      }],
      ['og', function () { return clean(meta('meta[property="og:title"]')); }],
      ['doc', function () {
        return clean(document.title.replace(/^Amazon\.[a-z.]+\s*:\s*/i, ''));
      }]
    ], 'title') || clean(document.title);

    var title = rawTitle.replace(/\s*[\-\|]\s*(Amazon|Fnac|Darty|Cdiscount|Boulanger|Vinted).*$/i, '').trim();

    var store = clean(meta('meta[property="og:site_name"]')) || hostname.replace(/^www\./, '');
    if (isAmazon) {
      store = hostname.replace(/^www\./, '');
      store = store.charAt(0).toUpperCase() + store.slice(1);
    } else if (isFnac) {
      store = 'Fnac';
    }

    return {
      price: price || 'Non renseigné',
      title: title || 'Produit sans titre',
      image: image,
      store: store,
      src: src
    };
  }

  var data = extractProduct();

  if (typeof completion === 'function') {
    // Mode iOS Raccourci : Redirection vers le mode Quick Add sans passer par la partie visiteur
    completion(JSON.stringify({
      url: BASE + '?quick_add=true&add_url=' + encodeURIComponent(location.href) +
           '&js_data=' + encodeURIComponent(JSON.stringify(data))
    }));
    return;
  }

  return data;
})();
