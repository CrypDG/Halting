#!/usr/bin/env bash
# Driver identity assurance e2e: risk assessment, the trip-start gate,
# fail-closed behaviour for high-risk vehicles, and the audit trail.
set -uo pipefail

URL="https://actingapi.loankard.com"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg1MzA0Mjk2LCJleHAiOjIxMDA2NjQyOTZ9.EJjmH_WlJSji56r-wBZ_68pAjdGbvrfXB0cIYyeGWwM"
PASS="Acting123!"
D1="10000000-0000-0000-0000-000000000011"   # car driver (LMV)
D2="10000000-0000-0000-0000-000000000012"   # heavy driver (HMV/HTV/PSV)

login() {
  curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token'
}
fn() { curl -s "$URL/functions/v1/$1" -H "Authorization: Bearer $2" -H "apikey: $ANON" -H "Content-Type: application/json" -d "$3"; }
sql() { ssh -o BatchMode=yes root@94.136.189.234 "docker exec -i supabase-db psql -U postgres -d postgres -tAc \"$1\"" 2>/dev/null; }

# Reset ONLY the two seeded dev drivers — never a blanket wipe, so real
# verification history and other drivers' audit trails are untouched.
echo "── reset identity state for the two seeded test drivers"
sql "update driver_profiles set last_verified_at=null, identity_hold=false, identity_hold_reason=null where driver_id in ('$D1','$D2'); delete from verification_events where driver_id in ('$D1','$D2'); delete from driver_devices where driver_id in ('$D1','$D2');" >/dev/null
# Close any trip left mid-flight by an earlier run, or the driver stays 'busy'
# and won't appear in nearby_drivers. Scoped to the seeded test drivers.
sql "update trips set status='closed', closed_at=now() where driver_id in ('$D1','$D2') and status not in ('closed','cancelled_by_customer','cancelled_by_driver','expired'); update driver_presence set status='offline' where driver_id in ('$D1','$D2');" >/dev/null

DRV=$(login driver1@acting.dev); DRV2=$(login driver2@acting.dev)
echo "tokens: car=${#DRV} heavy=${#DRV2}"

echo
echo "── 1. never verified + car -> should CHALLENGE"
fn verify-identity "$DRV" '{"action":"assess","category":"car","device_id":"pixel-aaa"}' \
  | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); `action=${d.action} fail_closed=${d.fail_closed} · ${d.message??""}`'

echo "── 2. school bus -> CHALLENGE and FAIL-CLOSED"
fn verify-identity "$DRV2" '{"action":"assess","category":"school_bus","device_id":"pixel-bbb"}' \
  | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); `action=${d.action} fail_closed=${d.fail_closed} risk=${d.category_risk}`'

echo
echo "── 3. submit a selfie -> passes, records event, sets last_verified_at"
fn verify-identity "$DRV" '{"action":"submit","category":"car","device_id":"pixel-aaa","selfie_base64":"aGVsbG8="}' \
  | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); `passed=${d.passed}`'
echo -n "   last_verified_at set: "; sql "select last_verified_at is not null from driver_profiles where driver_id='$D1';"
echo -n "   device now trusted:   "; sql "select count(*)>0 from driver_devices where driver_id='$D1' and device_id='pixel-aaa';"

echo
echo "── 4. same driver, same device, just verified -> should now PASS silently"
fn verify-identity "$DRV" '{"action":"assess","category":"car","device_id":"pixel-aaa"}' \
  | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); `action=${d.action}`'

echo "── 5. same driver, DIFFERENT device -> back to CHALLENGE"
fn verify-identity "$DRV" '{"action":"assess","category":"car","device_id":"someone-elses-phone"}' \
  | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); `action=${d.action} · ${d.message??""}`'

echo
echo "── 6. THE GATE: heavy driver books+accepts a crane trip, tries to start WITHOUT verifying"
CUST=$(login customer@acting.dev)
curl -s "$URL/rest/v1/rpc/go_online" -H "Authorization: Bearer $DRV2" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"p_lat":13.0067,"p_lng":80.2206}' >/dev/null
BOOK=$(fn dispatch-trip "$CUST" '{"category_slug":"crane","trip_type":"per_day","days":1,"payment_mode":"cash","radius_km":25,"pickup":{"lat":13.0827,"lng":80.2707,"address":"Site A"}}')
TRIP=$(echo "$BOOK" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); d.trip?d.trip.id:""')
if [ -z "$TRIP" ]; then echo "   booking failed: $BOOK"; else
  fn trip-lifecycle "$DRV2" "{\"action\":\"accept\",\"trip_id\":\"$TRIP\"}" >/dev/null
  fn trip-lifecycle "$DRV2" "{\"action\":\"arrive\",\"trip_id\":\"$TRIP\"}" >/dev/null
  OTP=$(curl -s "$URL/rest/v1/trip_secrets?trip_id=eq.$TRIP&select=start_otp" -H "Authorization: Bearer $CUST" -H "apikey: $ANON" | node -pe 'const a=JSON.parse(require("fs").readFileSync(0)); a[0]?a[0].start_otp:""')
  echo -n "   start with correct OTP but no face check: "
  fn trip-lifecycle "$DRV2" "{\"action\":\"start\",\"trip_id\":\"$TRIP\",\"otp\":\"$OTP\"}" \
    | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); d.error ? "BLOCKED ✓ — "+d.error : "STARTED ✗ (gate failed!)"'

  echo -n "   now verify, then start: "
  fn verify-identity "$DRV2" "{\"action\":\"submit\",\"trip_id\":\"$TRIP\",\"device_id\":\"pixel-bbb\",\"selfie_base64\":\"aGVsbG8=\"}" >/dev/null
  fn trip-lifecycle "$DRV2" "{\"action\":\"start\",\"trip_id\":\"$TRIP\",\"otp\":\"$OTP\"}" \
    | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); d.trip ? "status="+d.trip.status+" ✓" : "error: "+d.error'

  # Leave no trip mid-flight: end -> pay -> close so the driver frees up.
  fn trip-lifecycle "$DRV2" "{\"action\":\"end\",\"trip_id\":\"$TRIP\"}" >/dev/null 2>&1
  fn trip-lifecycle "$DRV2" "{\"action\":\"cash_collected\",\"trip_id\":\"$TRIP\"}" >/dev/null 2>&1
  fn trip-lifecycle "$CUST" "{\"action\":\"confirm_cash\",\"trip_id\":\"$TRIP\"}" >/dev/null 2>&1
  fn trip-lifecycle "$DRV2" "{\"action\":\"close\",\"trip_id\":\"$TRIP\"}" >/dev/null 2>&1
fi

echo
echo "── 7. audit trail (drivers can read their own, never write)"
echo -n "   events recorded: "; sql "select count(*) from verification_events where driver_id in ('$D1','$D2');"
echo -n "   driver1 sees only own: "; curl -s "$URL/rest/v1/verification_events?select=driver_id" -H "Authorization: Bearer $DRV" -H "apikey: $ANON" | node -pe 'const a=JSON.parse(require("fs").readFileSync(0)); a.every(e=>e.driver_id==="'"$D1"'") ? "yes ✓" : "LEAK ✗"'
echo -n "   driver cannot forge a pass: "
curl -s -o /dev/null -w "HTTP %{http_code} (expect 40x)\n" -X POST "$URL/rest/v1/verification_events" \
  -H "Authorization: Bearer $DRV" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"driver_id\":\"$D1\",\"kind\":\"trip_start\",\"result\":\"passed\"}"

echo
echo "IDENTITY TEST DONE"
