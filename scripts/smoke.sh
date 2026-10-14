#!/usr/bin/env bash
# End-to-end smoke test against a running Honeydoo (default http://localhost:3000).
# Exercises browse, search, AI search, bag, modifiers validation, quote, idempotent checkout and order privacy.
set -euo pipefail
B=${1:-http://localhost:3000}
J=$(mktemp)
pyj() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }
pass() { printf '  ok  %s\n' "$1"; }

curl -sf -c "$J" -b "$J" "$B/" -o /dev/null && pass "home page renders"
N=$(curl -sf "$B/api/v1/merchants" | pyj "print(len(d['data']))"); [ "$N" -ge 8 ] && pass "$N merchants listed"
curl -sf -X POST "$B/api/v1/search" -H 'content-type: application/json' -d '{"query":"flowers under $40"}' \
  | pyj "assert d['data'] and all(min(v['price'] for v in p['variations'] if v['sellable'])<=4000 for p in d['data'])" && pass "price-filtered keyword search"

CART=$(curl -sf -c "$J" -b "$J" -X POST "$B/api/v1/cart" | pyj "print(d['data']['id'])")
PID=$(curl -sf "$B/api/v1/products?merchant=low-tide-coffee" | pyj "print([x for x in d['data'] if x['name']=='Iced Vanilla Latte'][0]['id'])")
read -r VID MOD < <(curl -sf "$B/api/v1/products/$PID" | pyj "print(d['data']['variations'][1]['id'], [o for l in d['data']['modifierLists'] for o in l['options'] if o['name']=='Oat milk'][0]['id'])")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -X POST "$B/api/v1/cart/$CART/items" -H 'content-type: application/json' -d "{\"variationId\":\"$VID\",\"quantity\":2}")
[ "$CODE" = 400 ] && pass "required modifier enforced"
curl -sf -b "$J" -X POST "$B/api/v1/cart/$CART/items" -H 'content-type: application/json' -d "{\"variationId\":\"$VID\",\"quantity\":2,\"modifierIds\":[\"$MOD\"]}" \
  | pyj "l=d['data']['groups'][0]['lines'][0]; assert l['unitPrice']==670 and l['lineTotal']==1340" && pass "bag prices from catalog (595 + 75 oat) x 2"
MID=$(curl -sf -b "$J" "$B/api/v1/cart/$CART" | pyj "print(d['data']['groups'][0]['merchant']['id'])")
Q=$(curl -sf -b "$J" -X POST "$B/api/v1/checkout/quote" -H 'content-type: application/json' -d "{\"cartId\":\"$CART\",\"merchantId\":\"$MID\"}")
echo "$Q" | pyj "q=d['data']; assert q['grandTotal']==q['merchandiseSubtotal']+q['taxTotal']+q['serviceFee']-q['discountTotal']; assert q['serviceFee']==100" && pass "quote totals add up, \$1 fee shown"
H=$(echo "$Q" | pyj "print(d['data']['quoteHash'])")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/v1/checkout/quote" -H 'content-type: application/json' -H 'cookie: hd_sid=another-shoppers-session-xx' -d "{\"cartId\":\"$CART\",\"merchantId\":\"$MID\"}")
[ "$CODE" = 404 ] && pass "another session cannot use this bag"
BODY="{\"cartId\":\"$CART\",\"merchantId\":\"$MID\",\"quoteHash\":\"$H\",\"contact\":{\"name\":\"Test Shopper\",\"email\":\"test@example.com\"},\"authorize\":true}"
STALE=$(echo "$BODY" | sed "s/$H/0000000000000000deadbeef00000000/")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -X POST "$B/api/v1/checkout/create" -H 'content-type: application/json' -d "$STALE")
[ "$CODE" = 409 ] && pass "stale quote rejected"
O1=$(curl -sf -b "$J" -X POST "$B/api/v1/checkout/create" -H 'content-type: application/json' -d "$BODY" | pyj "print(d['data']['orderId'], d['data']['status'])")
O2=$(curl -sf -b "$J" -X POST "$B/api/v1/checkout/create" -H 'content-type: application/json' -d "$BODY" | pyj "print(d['data']['orderId'], d['data']['status'])")
[ "$O1" = "$O2" ] && pass "duplicate checkout returns the same order ($O1)"
OID=${O1%% *}
[ "${O1##* }" = "payment_not_configured" ] && pass "demo order is never marked paid"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H 'cookie: hd_sid=another-shoppers-session-xx' "$B/api/v1/orders/$OID")
[ "$CODE" = 404 ] && pass "order hidden from other shoppers"
curl -sf -X POST "$B/api/v1/ai/search" -H 'content-type: application/json' -d '{"message":"Find a gift under $40"}' \
  | pyj "r=d['data']['recommendations']; assert r and all(x['product']['availability']!='sold_out' and min(v['price'] for v in x['product']['variations'] if v['sellable'])<=4000 for x in r); print('  ok  AI search ('+d['data']['mode']+'):', ', '.join(x['product']['name'] for x in r))"
rm -f "$J"
echo "All smoke checks passed."
