const SUPABASE_URL = "https://glufuwoyxbyljnnthmbq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWZ1d295eGJ5bGpubnRobWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTg4MjUsImV4cCI6MjEwNzI5NDgyNX0.Zi64NJ2qr07oZMCA8acwmD8f1fEP6NJN_DyO5IvrIUc";

document.addEventListener('DOMContentLoaded', async () => {
  await loadLists();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractUniversalMeta,
  }, (results) => {
    if (!results || !results[0]?.result) {
      document.getElementById('status').innerText = "❌ Échec de la lecture de la page.";
      return;
    }

    const data = results[0].result;
    document.getElementById('title').value = data.title || tab.title;
    document.getElementById('price').value = data.price || "Voir site";
    document.getElementById('store').value = data.store || new URL(tab.url).hostname.replace('www.', '');
    document.getElementById('image').value = data.image || '';
    document.getElementById('url').value = tab.url;
    document.getElementById('status').innerText = "✅ Infos extraites. Prêt !";
  });
});

async function loadLists() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lists?select=*&order=id.asc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const lists = await res.json();
    const select = document.getElementById('listSelect');
    select.innerHTML = '';
    lists.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id; opt.innerText = l.name;
      select.appendChild(opt);
    });
  } catch (err) {
    document.getElementById('status').innerText = "❌ Erreur de chargement des listes.";
  }
}

// STRATÉGIE UNIVERSELLE D'EXTRACTION DE PRIX & INFOS
function extractUniversalMeta() {
  let title = '', image = '', price = '', store = '';
  const hostname = window.location.hostname;

  const getMeta = (prop) => 
    document.querySelector(`meta[property="${prop}"]`)?.content || 
    document.querySelector(`meta[name="${prop}"]`)?.content;

  // -------------------------------------------------------------
  // STRATÉGIE 1 : DONNÉES STRUCTURÉES JSON-LD (Ultra fiable)
  // -------------------------------------------------------------
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.innerText);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Recherche du schéma Product
        if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
          if (!title && item.name) title = item.name;
          if (!image && item.image) {
            image = Array.isArray(item.image) ? item.image[0] : item.image;
            if (typeof image === 'object') image = image.url;
          }

          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            const p = offer.price || offer.lowPrice;
            if (p) {
              price = `${parseFloat(p).toFixed(2).replace('.', ',')} €`;
            }
          }
        }
      }
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // STRATÉGIE 2 : SÉLECTEURS DE SECOURS PAR ENSEIGNE
  // -------------------------------------------------------------
  if (hostname.includes('fnac')) {
    store = 'Fnac';
    // Prix principal Fnac (évite les mensualités / occasion)
    const fnacPrice = document.querySelector('.f-priceBox__price') || 
                      document.querySelector('.f-buyBox-availabilityOffer .price') ||
                      document.querySelector('.priceText');
    if (fnacPrice && !price) {
      price = fnacPrice.innerText.replace(/[^\d,\.]/g, '').trim() + ' €';
    }
  } else if (hostname.includes('amazon')) {
    store = 'Amazon.fr';
    const amazonPrice = document.querySelector('.apexPriceToPay .a-offscreen') || 
                        document.querySelector('#corePrice_feature_div .a-offscreen');
    if (amazonPrice) price = amazonPrice.innerText.trim();

    const amazonImg = document.getElementById('landingImage') || document.getElementById('imgBlkFront');
    if (amazonImg && !image) image = amazonImg.getAttribute('data-old-hires') || amazonImg.src;
  }

  // -------------------------------------------------------------
  // STRATÉGIE 3 : MÉTA-DONNÉES GLOBALES (OpenGraph)
  // -------------------------------------------------------------
  if (!title) title = getMeta('og:title') || document.title;
  if (!image) image = getMeta('og:image') || getMeta('twitter:image') || '';
  if (!store) store = getMeta('og:site_name') || hostname.replace('www.', '');

  if (!price) {
    const metaPrice = getMeta('product:price:amount') || getMeta('og:price:amount');
    if (metaPrice) {
      price = `${parseFloat(metaPrice).toFixed(2).replace('.', ',')} €`;
    }
  }

  return { title, image, store, price };
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const listId = document.getElementById('listSelect').value;
  const url = document.getElementById('url').value;

  if (!listId) return status.innerText = "⚠️ Choisis une liste.";

  status.innerText = "⏳ Vérification doublon...";

  try {
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/products?list_id=eq.${listId}&url=eq.${encodeURIComponent(url)}&select=id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const existingProducts = await checkRes.json();

    if (existingProducts && existingProducts.length > 0) {
      status.innerText = "⚠️ Cet article est déjà dans la liste !";
      return;
    }

    status.innerText = "⏳ Enregistrement...";
    const payload = {
      title: document.getElementById('title').value,
      url: url,
      image_url: document.getElementById('image').value || 'https://via.placeholder.com/300',
      store_name: document.getElementById('store').value || 'Boutique',
      price: document.getElementById('price').value || 'Non renseigné',
      list_id: parseInt(listId),
      is_bought: false
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      status.innerText = "🎉 Ajouté à la liste !";
      setTimeout(() => window.close(), 1200);
    }
  } catch (err) {
    status.innerText = "❌ Erreur d'enregistrement.";
  }
});
