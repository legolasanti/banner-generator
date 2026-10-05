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
  -F "resolution=1" \
  -F "filename=Test Banner Æ Ø Å!!" -F "jpegQuality=92" \
  -F "downloadSet=core" \
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

echo "→ JPEG + 2× resolution"
HTTP3=$(curl -s -o "$TMP/hq.zip" -w "%{http_code}" \
  -F "image=@${TESTIMG};type=image/png" \
  -F "headline=HQ test" -F "vinnersjanse=" \
  -F "imagePositionX=50" -F "imagePositionY=50" \
  -F "resolution=2" -F "format=jpeg" \
  -F "filename=hq-test" \
  "http://localhost:$PORT/api/generate")
[ "$HTTP3" = "200" ] || fail "hq generate returned $HTTP3"
unzip -o "$TMP/hq.zip" -d "$TMP/hq" >/dev/null || fail "hq zip invalid"
ls "$TMP/hq"/*.jpg >/dev/null 2>&1 || fail "expected .jpg files for JPEG format"
DW=$(sips -g pixelWidth "$(ls "$TMP/hq"/*desktop*.jpg)" | awk '/pixelWidth/{print $2}')
[ "$DW" = "1160" ] || fail "2× desktop width is $DW, expected 1160"
echo "  ✓ JPEG output, desktop = ${DW}px wide (2×)"

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

echo "→ Wallpaper: upload an image"
ASSET=$(curl -fsS -F "file=@${TESTIMG};type=image/png" "http://localhost:$PORT/api/wallpaper/assets" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))") || fail "wallpaper upload failed"
echo "  ✓ asset $ASSET"
WPDOC=$(node -e '
const Doc = require("./public/wallpaper/doc.js");
const d = Doc.emptyDoc();
d.name = "Smoke wallpaper";
d.artboards.background.elements = [
  Doc.createElement("image", { asset: process.argv[1], natW: 580, natH: 500, x: 320, y: 40, w: 140, h: 120 }),
  Doc.createElement("text", { x: 320, y: 200, w: 140, text: "Tilbud nå", style: { font: "Montserrat", weight: 800, size: 22 } }),
];
d.artboards.topbanner.elements = [Doc.createElement("shape", { x: 40, y: 100, w: 220, h: 60, radius: 999, text: "Bestill ›" })];
process.stdout.write(JSON.stringify(d));' "$ASSET")

echo "→ Wallpaper: estimate (image, 100 KB each)"
EST=$(curl -fsS -H "Content-Type: application/json" -d "{\"doc\":$WPDOC,\"options\":{}}" "http://localhost:$PORT/api/wallpaper/estimate") || fail "estimate failed"
echo "$EST" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).results;if(r.length!==2)process.exit(2);for(const x of r){if(x.bytes>x.limitBytes)process.exit(3);console.log('  ✓ '+x.key+' '+Math.round(x.bytes/1024)+' KB ≤ '+x.limitBytes/1024+' KB')}})" || fail "estimate over budget or incomplete"

echo "→ Wallpaper: export images"
HTTPW=$(curl -s -o "$TMP/wp.zip" -w "%{http_code}" -H "Content-Type: application/json" \
  -d "{\"doc\":$WPDOC,\"options\":{\"format\":\"jpg\"}}" "http://localhost:$PORT/api/wallpaper/export")
[ "$HTTPW" = "200" ] || fail "wallpaper export returned $HTTPW"
unzip -o "$TMP/wp.zip" -d "$TMP/wp" >/dev/null || fail "wallpaper zip invalid"
check_dim "$(ls "$TMP/wp"/*bakgrunn*.jpg)" 1920 850
check_dim "$(ls "$TMP/wp"/*toppbanner*.jpg)" 1000 300

echo "→ Wallpaper: export HTML5"
HTTPH=$(curl -s -o "$TMP/wph.zip" -w "%{http_code}" -H "Content-Type: application/json" \
  -d "{\"doc\":$WPDOC,\"options\":{\"outputType\":\"html\",\"clickUrl\":\"https://example.com/\"}}" "http://localhost:$PORT/api/wallpaper/export")
[ "$HTTPH" = "200" ] || fail "wallpaper html export returned $HTTPH"
unzip -o "$TMP/wph.zip" -d "$TMP/wph" >/dev/null || fail "wallpaper html zip invalid"
unzip -o "$(ls "$TMP/wph"/*bakgrunn*.zip)" -d "$TMP/wph/bg" >/dev/null || fail "inner creative zip invalid"
grep -q 'content="width=1920,height=850"' "$TMP/wph/bg/index.html" || fail "ad.size missing"
grep -q 'var clickTag = "https://example.com/"' "$TMP/wph/bg/index.html" || fail "clickTag missing"
ls "$TMP/wph/bg/fonts/"*.woff2 >/dev/null 2>&1 || fail "subset font missing"
echo "  ✓ HTML5 creative: index.html + ad.size + clickTag + subset fonts"

echo "→ server log (browser reuse?)"
grep -iE "launched via|browser ready" "$TMP/server.log" >/dev/null || fail "browser never launched"
LAUNCHES=$(grep -c "launched via" "$TMP/server.log" 2>/dev/null || echo 0)
[ "$LAUNCHES" -le 1 ] || fail "browser launched $LAUNCHES times — not reused"
echo "  ✓ single browser launched once and reused across $((2)) generations"

echo ""
echo "✅ ALL SMOKE TESTS PASSED"
cleanup
