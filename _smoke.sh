#!/usr/bin/env bash
# End-to-end smoke test: boots the server, generates a package, verifies the
# ZIP holds 3 PNGs at the exact spec dimensions, then checks history + cleanup.
set -uo pipefail
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd "$(dirname "$0")"

PORT=3199
TMP="$(mktemp -d)"
TESTIMG="references/ABCN - Desktop - sport-Uke26mandag.png"
fail() { echo "❌ FAIL: $1"; cleanup; exit 1; }
cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -rf "$TMP"; }

echo "→ starting server on :$PORT"
PORT=$PORT node server.js > "$TMP/server.log" 2>&1 &
SRV=$!

# wait for health
for i in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -fsS "http://localhost:$PORT/api/health" || { cat "$TMP/server.log"; fail "server did not start"; }
echo "  health OK"

echo "→ POST /api/generate (Vikinglotto)"
HTTP=$(curl -s -o "$TMP/out.zip" -w "%{http_code}" \
  -F "image=@${TESTIMG};type=image/png" \
  -F "headline=Jonny vant 42 millioner – slik har han brukt pengene" \
  -F "subtitle=Slik har han brukt pengene" \
  -F "brandLabel=NORSK TIPPING" \
  -F "vinnersjanse=Vinnersjanse 1.premie 1:61 mill. per rekke" \
  -F "imagePositionX=40" -F "imagePositionY=30" \
  -F "filename=Test Banner Æ Ø Å!!" -F "jpegQuality=92" \
  "http://localhost:$PORT/api/generate")
[ "$HTTP" = "200" ] || { cat "$TMP/server.log"; fail "generate returned $HTTP"; }

unzip -o "$TMP/out.zip" -d "$TMP/zip" >/dev/null || fail "zip is invalid"
echo "  zip contents:"; ls -1 "$TMP/zip"
N=$(ls -1 "$TMP/zip"/*.png 2>/dev/null | wc -l | tr -d ' ')
[ "$N" = "3" ] || fail "expected 3 PNGs, got $N"

check_dim() {
  local f="$1" ew="$2" eh="$3"
  local w h
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  [ "$w" = "$ew" ] && [ "$h" = "$eh" ] || fail "$(basename "$f") is ${w}x${h}, expected ${ew}x${eh}"
  echo "  ✓ $(basename "$f") = ${w}x${h}"
}
check_dim "$(ls "$TMP/zip"/*readpeak*.png)" 308 380
check_dim "$(ls "$TMP/zip"/*desktop*.png)" 580 500
check_dim "$(ls "$TMP/zip"/*mobile*.png)" 320 400

echo "→ filename sanitized?"
ls "$TMP/zip" | grep -q "test-banner-ae-o-a" || fail "filename not sanitized as expected"
echo "  ✓ sanitized to test-banner-ae-o-a-*"

echo "→ GET /api/history"
HID=$(curl -fsS "http://localhost:$PORT/api/history" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);if(!a.length)process.exit(2);console.log(a[0].id)})") || fail "history empty"
echo "  newest id: $HID"

echo "→ Sport hides vinnersjanse (visual sanity via render error check only)"
HTTP2=$(curl -s -o "$TMP/sport.zip" -w "%{http_code}" \
  -F "image=@${TESTIMG};type=image/png" \
  -F "headline=Sport test" -F "vinnersjanse=" \
  -F "imagePositionX=50" -F "imagePositionY=50" \
  -F "filename=sport-test" -F "jpegQuality=92" \
  "http://localhost:$PORT/api/generate")
[ "$HTTP2" = "200" ] || fail "sport generate returned $HTTP2"
echo "  ✓ sport package generated"

echo "→ re-download history zip"
curl -fsS "http://localhost:$PORT/api/history/$HID/download" -o "$TMP/re.zip" && unzip -t "$TMP/re.zip" >/dev/null && echo "  ✓ re-download OK" || fail "history re-download failed"

echo "→ delete history entry"
curl -fsS -X DELETE "http://localhost:$PORT/api/history/$HID" >/dev/null && echo "  ✓ delete OK" || fail "delete failed"

echo "→ server log (browser reuse?)"
grep -iE "launched via|browser ready" "$TMP/server.log" >/dev/null || fail "browser never launched"
LAUNCHES=$(grep -c "launched via" "$TMP/server.log" 2>/dev/null || echo 0)
[ "$LAUNCHES" -le 1 ] || fail "browser launched $LAUNCHES times — not reused"
echo "  ✓ single browser launched once and reused across $((2)) generations"

echo ""
echo "✅ ALL SMOKE TESTS PASSED"
cleanup
