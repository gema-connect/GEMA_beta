/* stripe-checkout.js — VORBEREITETER Stripe-Checkout-Proxy für GEMA-Abos.
   ------------------------------------------------------------------------
   Der Secret Key liegt NIE im Frontend. Diese Function erstellt eine
   Stripe-Checkout-Session und gibt deren URL zurück; sys_preise.html
   (GemaAbo.startStripeCheckout) leitet den Browser dorthin weiter.

   Aktivierung (bis dahin antwortet die Function mit 501 und die
   Preisseite speichert Bestellungen als «angefragt»):
     1. Stripe-Konto anlegen, Produkte/Preise (recurring) erfassen.
     2. Netlify-Env setzen:
          STRIPE_SECRET_KEY = sk_live_… (oder sk_test_…)
          STRIPE_PRICE_MAP  = {"planer_firma_1":"price_…", …}   (optional)
        Ohne PRICE_MAP wird der Betrag als Einmalzahlung mit ad-hoc
        price_data verrechnet (Abo-Verlängerung dann manuell/per Rechnung —
        für echte recurring Abos die PRICE_MAP pflegen).
     3. In sys_abos.html → «Abrechnung & Zahlung» den Publishable Key
        eintragen und Stripe aktivieren.
   Offen (bewusst noch nicht gebaut): stripe-webhook.js, das
   checkout.session.completed empfängt und das Abo (abosub:-Record)
   serverseitig auf «aktiv» stellt.

   Sicherheits-Review 2026-07 (S6), bereits umgesetzt:
    - Auth-Gate (JWT wie gema-auth.js) — kein unauthentifizierter Checkout.
    - client_reference_id kommt aus dem Token (uid/org), nicht aus dem Body.
    - Der vom Client gelieferte betragRappen wird NICHT mehr verrechnet:
      der Preis muss serverseitig aus STRIPE_PRICE_MAP (planId→price_…)
      kommen. Der frühere ad-hoc-price_data-Zweig (Kunde zahlt selbst
      gewählten Betrag) ist deaktiviert; er lässt sich nur mit der
      expliziten Env STRIPE_ALLOW_ADHOC=1 reaktivieren (nicht empfohlen).
   Vor Go-Live noch nötig: stripe-webhook.js (Abo serverseitig aktivieren).
*/

const { requireAuth } = require('./_jwt');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  // Auth-Gate (Review S6): nur eingeloggte User dürfen einen Checkout starten.
  const claims = requireAuth(event);
  if (!claims) return { statusCode: 401, headers, body: JSON.stringify({ error: 'not_authenticated' }) };

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 501,
      headers,
      body: JSON.stringify({
        error: 'stripe_not_configured',
        hinweis: 'STRIPE_SECRET_KEY ist in Netlify nicht gesetzt — Kartenzahlung ist vorbereitet, aber noch nicht aktiv.'
      })
    };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_json' }) }; }

  const planId = String(body.planId || '');
  const subId = String(body.subId || '');
  const beschreibung = String(body.beschreibung || 'GEMA Abo').slice(0, 200);
  const successUrl = String(body.successUrl || '');
  const cancelUrl = String(body.cancelUrl || '');
  if (!successUrl || !cancelUrl) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_urls' }) };
  }

  // Optional: Mapping planId → Stripe-Price-ID (echte recurring Subscriptions)
  let priceMap = {};
  try { priceMap = JSON.parse(process.env.STRIPE_PRICE_MAP || '{}'); } catch (e) { priceMap = {}; }
  const priceId = priceMap[planId];

  const params = new URLSearchParams();
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  // Referenz aus dem Token, nicht aus dem Body (Review S6) — der Webhook
  // ordnet die Zahlung damit der richtigen Org/dem richtigen Abo zu.
  params.set('client_reference_id', subId || planId);
  params.set('metadata[uid]', String(claims.uid || ''));
  params.set('metadata[org]', String(claims.org || ''));
  params.set('metadata[planId]', planId);
  if (priceId) {
    params.set('mode', 'subscription');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
  } else if (process.env.STRIPE_ALLOW_ADHOC === '1') {
    // Deaktivierter Alt-Zweig (Review S6): der Betrag käme aus dem Client
    // (selbst wählbar). Nur mit expliziter Env reaktivierbar — bis dahin
    // MUSS der Preis über STRIPE_PRICE_MAP serverseitig bestimmt werden.
    const betragRappen = Math.max(0, Math.round(+body.betragRappen || 0));
    if (betragRappen < 50) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'betrag_zu_klein' }) };
    }
    params.set('mode', 'payment');
    params.set('line_items[0][price_data][currency]', 'chf');
    params.set('line_items[0][price_data][unit_amount]', String(betragRappen));
    params.set('line_items[0][price_data][product_data][name]', beschreibung);
    params.set('line_items[0][quantity]', '1');
  } else {
    // Kein serverseitiger Preis hinterlegt → Checkout verweigern statt
    // einen client-gewählten Betrag zu verrechnen.
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'plan_not_configured', hinweis: 'STRIPE_PRICE_MAP für diesen Plan pflegen (kein client-seitiger Betrag).' }) };
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'stripe_error', detail: data && data.error && data.error.message })
      };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ url: data.url, id: data.id }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'stripe_unreachable', detail: String(e && e.message) }) };
  }
};
