export const starter = {
  "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Little things</title><link rel="stylesheet" href="style.css"></head>
<body>
  <main>
    <p class="eyebrow">A SMALL SPACE FOR GOOD IDEAS</p>
    <div class="flower" aria-hidden="true">✳</div>
    <h1>Make room<br>for little things.</h1>
    <p class="intro">A walk without a destination. A really good song. Something you made just because.</p>
    <button id="save">Save a little joy <span>↗</span></button>
    <p id="count" aria-live="polite">No rush. Start with one.</p>
    <footer>YOUR NEXT IDEA STARTS HERE <span>01 / ∞</span></footer>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
  "style.css": `* { box-sizing: border-box; }
body { margin: 0; background: #f2eee5; color: #303b2c; font-family: system-ui, sans-serif; }
main { max-width: 640px; margin: auto; padding: 56px 42px 28px; }
.eyebrow { font-size: 10px; letter-spacing: .18em; font-weight: 650; }
.flower { color: #bc563c; font-size: 100px; line-height: 1; margin-top: 50px; }
h1 { font-family: Georgia, serif; font-weight: 400; font-size: clamp(40px, 7vw, 64px); line-height: 1.06; letter-spacing: -.045em; margin: 24px 0; }
.intro { max-width: 340px; font-size: 15px; line-height: 1.7; color: #686e5e; }
button { display: flex; gap: 38px; align-items: center; border: 0; border-radius: 6px; padding: 15px 20px; margin-top: 30px; background: #364631; color: #f5f2e9; font: inherit; font-size: 13px; cursor: pointer; }
button:hover { background: #4b6143; }
button:focus-visible { outline: 3px solid #bc563c; outline-offset: 4px; }
#count { color: #74796c; font-size: 12px; min-height: 20px; }
footer { display: flex; justify-content: space-between; border-top: 1px solid #d8d9cc; padding-top: 20px; margin-top: 62px; font-size: 9px; letter-spacing: .12em; color: #777e6e; }
@media (max-width: 400px) { main { padding: 32px 24px; } .flower { margin-top: 32px; } }
`,
  "script.js": `let joys = 0;
document.querySelector('#save').addEventListener('click', () => {
  joys += 1;
  document.querySelector('#count').textContent = joys === 1 ? 'One little joy, saved.' : joys + ' little joys, saved.';
});
`,
};
