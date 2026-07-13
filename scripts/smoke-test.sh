#!/usr/bin/env bash
# End-to-end backend smoke test: books a car trip as the customer, drives it
# through the full lifecycle as driver1, and checks the setup-fee gate.
set -euo pipefail

URL="https://pybxdufrmnhgneupsssi.supabase.co"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5YnhkdWZybW5oZ25ldXBzc3NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MzU0MjMsImV4cCI6MjA5OTQxMTQyM30.GgRA6zHueRJ4yZBGfVJglPMtNkvz52piHHCME8iN-JE"
PASS="Acting123!"

login() {
  curl -s "$URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token'
}

call_fn() { # fn token body
  curl -s "$URL/functions/v1/$1" -H "Authorization: Bearer $2" -H "apikey: $ANON" -H "Content-Type: application/json" -d "$3"
}

rpc() { # name token body
  curl -s "$URL/rest/v1/rpc/$1" -H "Authorization: Bearer $2" -H "apikey: $ANON" -H "Content-Type: application/json" -d "$3"
}

echo "── login"
CUST=$(login customer@acting.dev)
DRV=$(login driver1@acting.dev)
echo "tokens ok: cust=${#CUST} drv=${#DRV}"

echo "── driver1 goes online at T Nagar"
rpc go_online "$DRV" '{"p_lat":13.0418,"p_lng":80.2341}'

echo "── customer sees nearby car drivers"
rpc nearby_drivers "$CUST" '{"p_category":"car","p_lat":13.0827,"p_lng":80.2707,"p_radius_km":15}'
echo

echo "── customer books per-km trip (Central → Airport)"
BOOK=$(call_fn dispatch-trip "$CUST" '{"category_slug":"car","trip_type":"per_km","payment_mode":"cash","pickup":{"lat":13.0827,"lng":80.2707,"address":"Chennai Central"},"destination":{"lat":12.9941,"lng":80.1709,"address":"Chennai Airport"}}')
echo "$BOOK"
TRIP=$(echo "$BOOK" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.id')
echo "trip=$TRIP"

echo "── customer reads start OTP (RLS: trip_secrets)"
OTP=$(curl -s "$URL/rest/v1/trip_secrets?trip_id=eq.$TRIP&select=start_otp" -H "Authorization: Bearer $CUST" -H "apikey: $ANON" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].start_otp')
echo "otp=$OTP"

echo "── driver must NOT see the OTP"
curl -s "$URL/rest/v1/trip_secrets?trip_id=eq.$TRIP&select=start_otp" -H "Authorization: Bearer $DRV" -H "apikey: $ANON"
echo

echo "── driver accepts, arrives, starts with wrong OTP (must fail), then right OTP"
call_fn trip-lifecycle "$DRV" "{\"action\":\"accept\",\"trip_id\":\"$TRIP\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.status'
call_fn trip-lifecycle "$DRV" "{\"action\":\"arrive\",\"trip_id\":\"$TRIP\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.status'
call_fn trip-lifecycle "$DRV" "{\"action\":\"start\",\"trip_id\":\"$TRIP\",\"otp\":\"0000\"}"
echo
call_fn trip-lifecycle "$DRV" "{\"action\":\"start\",\"trip_id\":\"$TRIP\",\"otp\":\"$OTP\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.status'

echo "── driver streams a couple of GPS points"
rpc set_driver_location "$DRV" '{"p_lat":13.05,"p_lng":80.24}'
rpc set_driver_location "$DRV" '{"p_lat":13.02,"p_lng":80.20}'

echo "── driver ends trip → fare from GPS/straight-line distance"
call_fn trip-lifecycle "$DRV" "{\"action\":\"end\",\"trip_id\":\"$TRIP\"}" | node -pe 'const t=JSON.parse(require("fs").readFileSync(0)).trip; `status=${t.status} km=${t.distance_km} fare=₹${t.fare_total}`'

echo "── cash dual-confirmation then close"
call_fn trip-lifecycle "$DRV" "{\"action\":\"cash_collected\",\"trip_id\":\"$TRIP\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.payment_status'
call_fn trip-lifecycle "$CUST" "{\"action\":\"confirm_cash\",\"trip_id\":\"$TRIP\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.status'
call_fn trip-lifecycle "$DRV" "{\"action\":\"close\",\"trip_id\":\"$TRIP\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).trip.status'

echo "── first trip closed → ₹500 setup fee should now exist"
curl -s "$URL/rest/v1/setup_fees?select=amount_inr,status,due_at" -H "Authorization: Bearer $DRV" -H "apikey: $ANON"
echo

echo "── ratings both ways"
curl -s "$URL/rest/v1/ratings" -H "Authorization: Bearer $CUST" -H "apikey: $ANON" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"trip_id\":\"$TRIP\",\"rater_id\":\"10000000-0000-0000-0000-000000000002\",\"ratee_id\":\"10000000-0000-0000-0000-000000000011\",\"stars\":5,\"tags\":[\"Safe driving\",\"Punctual\"]}"
curl -s "$URL/rest/v1/driver_profiles?driver_id=eq.10000000-0000-0000-0000-000000000011&select=rating_avg,trips_completed" -H "Authorization: Bearer $CUST" -H "apikey: $ANON"
echo

echo "── driver pays setup fee (mock UPI), then can keep working"
call_fn trip-lifecycle "$DRV" '{"action":"pay_setup_fee"}'
echo
echo "SMOKE TEST DONE"
