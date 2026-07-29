#!/usr/bin/env bash
# Documents & insurance e2e: driver uploads -> RLS isolation -> admin verifies.
set -uo pipefail

URL="https://actingapi.loankard.com"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg1MzA0Mjk2LCJleHAiOjIxMDA2NjQyOTZ9.EJjmH_WlJSji56r-wBZ_68pAjdGbvrfXB0cIYyeGWwM"
PASS="Acting123!"
D1="10000000-0000-0000-0000-000000000011"

login() {
  curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token'
}

echo "── login"
DRV=$(login driver1@acting.dev); DRV2=$(login driver2@acting.dev); ADM=$(login admin@acting.dev)
echo "tokens: drv=${#DRV} drv2=${#DRV2} adm=${#ADM}"

echo "── catalogue visible to driver"
curl -s "$URL/rest/v1/document_types?applies_to=eq.driver&select=slug,name,required,heavy_only&order=sort" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).map(d=>d.slug+(d.required?"*":"")+(d.heavy_only?"(heavy)":"")).join(", ")'

echo "── driver uploads a rider-insurance image to private storage"
printf '\x89PNG\r\n\x1a\n test document' > /tmp/doc.png
curl -s -o /dev/null -w "storage upload: HTTP %{http_code}\n" -X POST \
  "$URL/storage/v1/object/documents/$D1/rider_insurance.png" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON" -H "Content-Type: image/png" \
  -H "x-upsert: true" --data-binary @/tmp/doc.png

echo "── driver records the document row"
curl -s -o /dev/null -w "insert row: HTTP %{http_code}\n" -X POST "$URL/rest/v1/user_documents" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{\"owner_id\":\"$D1\",\"doc_type\":\"rider_insurance\",\"file_path\":\"$D1/rider_insurance.png\",\"provider\":\"Acme General\",\"doc_number\":\"POL-99881\",\"expires_on\":\"2027-06-30\",\"status\":\"pending\"}"

echo "── driver sees own doc:"
curl -s "$URL/rest/v1/user_documents?owner_id=eq.$D1&select=doc_type,status,provider,expires_on" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON"
echo
echo "── RLS: another driver must NOT see it:"
OTHER=$(curl -s "$URL/rest/v1/user_documents?select=doc_type,owner_id" -H "Authorization: Bearer $DRV2" -H "apikey: $ANON")
echo "$OTHER" | grep -q "rider_insurance" && echo "  LEAK! visible to driver2 ✗" || echo "  correctly hidden ✓"

echo "── admin reviews the queue:"
DOCID=$(curl -s "$URL/rest/v1/user_documents?status=eq.pending&select=id,doc_type&limit=1" \
  -H "Authorization: Bearer $ADM" -H "apikey: $ANON" | node -pe 'const a=JSON.parse(require("fs").readFileSync(0)); a[0]?a[0].id:""')
echo "  pending doc id: ${DOCID:-none}"

echo "── admin gets a signed preview URL"
curl -s "$URL/functions/v1/admin-actions" -H "Authorization: Bearer $ADM" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"action\":\"document_url\",\"file_path\":\"$D1/rider_insurance.png\"}" | head -c 80; echo "..."

echo "── admin verifies it"
curl -s "$URL/functions/v1/admin-actions" -H "Authorization: Bearer $ADM" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"action\":\"verify_document\",\"document_id\":\"$DOCID\"}" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); d.document?("status -> "+d.document.status):JSON.stringify(d)'

echo "── driver must NOT be able to self-verify (RLS)"
curl -s -o /dev/null -w "  driver self-verify attempt: HTTP %{http_code} (expect 40x/0 rows)\n" -X PATCH \
  "$URL/rest/v1/user_documents?owner_id=eq.$D1&doc_type=eq.rider_insurance" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"status":"verified"}'
echo "  final status seen by driver:"
curl -s "$URL/rest/v1/user_documents?owner_id=eq.$D1&doc_type=eq.rider_insurance&select=status,reviewed_at" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON"
echo
echo "DOCUMENTS TEST DONE"
