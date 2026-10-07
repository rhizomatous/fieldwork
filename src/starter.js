export const starter = {
  "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Little things</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <svg class="flower" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M50 78C28 62 28 38 50 14C72 38 72 62 50 78Z"/>
      <path d="M50 78C25 78 12 58 14 34C30 37 42 47 50 62C58 47 70 37 86 34C88 58 75 78 50 78Z"/>
      <path d="M50 78C27 88 9 75 5 55C14 54 24 57 31 62M50 78C73 88 91 75 95 55C86 54 76 57 69 62"/>
    </svg>
    <h1>Make room<br>for little things.</h1>
    <p class="intro">A walk without a destination. A really good song. Something you made just because.</p>
    <form id="joy-form">
      <label for="joy">Save a little joy</label>
      <div class="joy-input">
        <input id="joy" name="joy" placeholder="Something that made you smile..." maxlength="200" required>
        <button type="submit">Save <span aria-hidden="true">↗</span></button>
      </div>
    </form>
    <p id="count" role="status">No rush. Start with one.</p>
    <ul id="joys" aria-label="Saved little joys"></ul>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
  "style.css": `* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: oklch(96% .07 100);
  color: oklch(30% .09 265);
  font-family: system-ui, sans-serif;
}

main {
  max-width: 640px;
  margin: auto;
  padding: 56px 42px 28px;
}

.flower {
  display: block;
  width: 100px;
  height: 100px;
  color: oklch(49% .21 268);
  margin-top: 50px;
}

h1 {
  font-family: Georgia, serif;
  font-weight: 400;
  font-size: clamp(40px, 7vw, 64px);
  line-height: 1.06;
  letter-spacing: -.045em;
  margin: 24px 0;
}

.intro {
  max-width: 340px;
  font-size: 15px;
  line-height: 1.7;
  color: oklch(43% .065 265);
}

form {
  margin-top: 30px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
}

.joy-input {
  display: flex;
  border: 1px solid oklch(40% .18 268);
  border-radius: 6px;
  overflow: hidden;
}

.joy-input:focus-within {
  outline: 2px solid oklch(49% .21 268);
  outline-offset: 3px;
}

input {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 15px 12px;
  background: oklch(98% .035 100);
  color: inherit;
  font: inherit;
  font-size: 13px;
  outline: none;
}

input::placeholder {
  color: oklch(48% .055 265);
}

button {
  flex-shrink: 0;
  border: 0;
  padding: 15px 18px;
  background: oklch(40% .18 268);
  color: oklch(98% .035 100);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

button:hover {
  background: oklch(34% .16 268);
}

button:focus-visible {
  outline: 3px solid oklch(49% .21 268);
  outline-offset: -4px;
}

#count {
  color: oklch(48% .055 265);
  font-size: 12px;
  min-height: 20px;
}

#joys {
  padding-left: 20px;
  font-size: 15px;
  line-height: 1.7;
}

#joys li {
  padding: 4px 0 4px 4px;
  overflow-wrap: anywhere;
}

@media (max-width: 400px) {
  main {
    padding: 32px 24px;
  }
  .flower {
    margin-top: 32px;
  }
}
`,
  "script.js": `const form = document.querySelector('#joy-form');
const joyInput = document.querySelector('#joy');
const joyList = document.querySelector('#joys');
const countLabel = document.querySelector('#count');

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const joy = joyInput.value.trim();
  if (!joy) {
    joyInput.focus();
    return;
  }

  const item = document.createElement('li');
  item.textContent = joy;
  joyList.append(item);

  const count = joyList.children.length;
  countLabel.textContent = count === 1
    ? 'One little joy, saved.'
    : \`\${count} little joys, saved.\`;

  form.reset();
  joyInput.focus();
});
`,
};
