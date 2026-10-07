import assert from "node:assert/strict";
import test from "node:test";

import { buildPreview } from "../src/preview.ts";
import { starter } from "../src/starter.js";

test("preview uses actual CSS and JS while safely encoding closing script tags", () => {
  const html = buildPreview(
    {
      ...starter,
      "script.js": 'document.title = "</script><h1>unexpected</h1>";',
    },
    "test",
  );

  assert.ok(!html.includes('src="script.js"'));
  assert.ok(!html.includes('href="style.css"'));
  assert.ok(!html.includes("</script><h1>unexpected"));
  assert.ok(html.includes("\\u003c/script>"));
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /const channel="test"/);
});

test("missing workspace files fail visibly instead of substituting starter content", () => {
  assert.throws(
    () => buildPreview({ "index.html": "<p>Broken</p>" }),
    /Missing style.css/,
  );
});
