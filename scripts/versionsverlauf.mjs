import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const destination = new URL('versionsverlauf/index.html', root);
const canonical = 'https://notechas.github.io/gh-losscontrol-datenschutz/';
const newline = '\n';

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function formatInline(value) {
  if (value.includes('[') || value.includes(']') || value.includes('`')) {
    throw new Error('Der Versionsverlauf verwendet Fließtext, Listen und Fettungen.');
  }
  const parts = value.split('**');
  if (parts.length % 2 === 0) throw new Error('Unvollständige Fettung im Versionsverlauf.');
  return parts.map((part, index) => index % 2 ? '<strong>' + escapeHtml(part) + '</strong>' : escapeHtml(part)).join('');
}

function paragraphs(text) {
  return text.trim().split(/\n\s*\n/u).map(block => {
    if (block.startsWith('- ')) {
      const items = block.split(newline).map(line => {
        if (!line.startsWith('- ') || !line.slice(2).trim()) throw new Error('Ungültiger Listenpunkt.');
        return '          <li>' + formatInline(line.slice(2)) + '</li>';
      });
      return '        <ul>\n' + items.join(newline) + '\n        </ul>';
    }
    if (/^\s*(?:#|>|-|\d+\.)\s/mu.test(block)) throw new Error('Unerwartetes Markdown-Element.');
    return '        <p>' + formatInline(block.replaceAll(newline, ' ')) + '</p>';
  }).join(newline);
}

function entryFor(block) {
  const [title, date, ...rest] = block.trim().split(/\n\s*\n/u);
  if (!title || !date || !rest.length || title.includes(newline) || date.includes(newline)) {
    throw new Error('Ein Versionsabschnitt benötigt Überschrift, Datum und Beschreibung.');
  }
  const shortTitle = title.split(' · ')[0];
  const id = 'version-' + shortTitle.toLocaleLowerCase('de-DE').replaceAll(/[^a-z0-9]+/gu, '-').replace(/-$/u, '');
  return { title, date, shortTitle, id, html: paragraphs(rest.join('\n\n')) };
}

function sharedHead(privacyHtml) {
  const marker = '\n    <main class="page" id="datenschutzerklaerung">';
  const index = privacyHtml.indexOf(marker);
  if (index < 0) throw new Error('Gemeinsamer Seitenkopf nicht gefunden.');
  const head = privacyHtml.slice(0, index);
  return head
    .replace(/<title>[^<]+<\/title>/u, '<title>Versionsverlauf · GH-LossControl</title>')
    .replace(/<meta name="description" content="[^"]+">/u,
      '<meta name="description" content="Entwicklung und geschlossene Testversionen von GH-LossControl, von der ersten Projektfassung bis zur aktuellen Test-App.">')
    .replace('href="#datenschutzerklaerung">Zur Datenschutzerklärung', 'href="#versionsverlauf">Zum Versionsverlauf')
    .replace('<span class="masthead-label">Daten und Datenschutz</span>', '<a class="masthead-label" href="' + canonical + '">Datenschutzerklärung</a>')
    .replace(/^[ \t]*<\/style>/mu, versionStyles.trimEnd() + '\n    </style>');
}

const versionStyles = `
      .masthead .masthead-label { color: #d9e8f3; text-decoration: underline; text-underline-offset: .18em; }
      .versions-index { margin: 1.5rem 0; padding: 0 1rem; color: var(--navy); border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); }
      .versions-index summary { min-height: 44px; align-content: center; cursor: pointer; font-weight: 650; }
      .versions-index ol { list-style: none; padding: .4rem 0 .9rem; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); column-gap: 1rem; }
      .versions-index li { margin: 0; }
      .versions-index a { display: block; align-content: center; min-height: 44px; color: var(--blue); }
      .releases { scroll-margin-top: 1rem; }
      .releases section { scroll-margin-top: 1rem; }
      .releases .release-date { margin: .2rem 0 .9rem; color: var(--muted); font-size: .92rem; }
      .releases h2 { margin-bottom: .15rem; overflow-wrap: anywhere; font-size: clamp(1.125rem, 2.6vw, 1.5rem); }
      .releases ul { margin: .6rem 0 0; padding-inline-start: 1.35rem; }
      .releases li + li { margin-top: .8rem; }
      @media print { .versions-index, .masthead .masthead-label { display: none; } }
`;

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Aufruf: node scripts/versionsverlauf.mjs [--check]');
}
const markdown = (await readFile(new URL('CHANGELOG.md', root), 'utf8')).replaceAll('\r\n', '\n');
const [intro, ...blocks] = markdown.trim().split(/^## /mu);
if (!intro.startsWith('# Versionsverlauf\n\n') || !blocks.length) throw new Error('Titel oder Versionsabschnitte fehlen.');
const entries = blocks.map(entryFor);
if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Versionsanker sind nicht eindeutig.');
const head = sharedHead((await readFile(new URL('index.html', root), 'utf8')).replaceAll('\r\n', '\n'));
const links = entries.map(({ id, shortTitle }) => '          <li><a href="#' + id + '">' + escapeHtml(shortTitle) + '</a></li>').join(newline);
const timeline = entries.map(({ id, title, date, html }) =>
  '      <section id="' + id + '" aria-labelledby="' + id + '-titel">\n' +
  '        <h2 id="' + id + '-titel">' + escapeHtml(title) + '</h2>\n' +
  '        <p class="release-date">' + escapeHtml(date) + '</p>\n' +
  html + '\n      </section>'
).join(newline);
const page = head + '\n    <main class="page" id="versionsverlauf">\n' +
  '      <h1>Versionsverlauf</h1>\n' +
  '      <p class="intro">' + formatInline(intro.slice('# Versionsverlauf\n\n'.length).trim().replaceAll(newline,' ')) + '</p>\n' +
  '      <nav aria-label="Version auswählen">\n        <details class="versions-index">\n' +
  '          <summary>Zu einer Version springen</summary>\n        <ol>\n' + links + '\n        </ol>\n' +
  '        </details>\n      </nav>\n      <article class="releases" aria-label="Entwicklung von GH-LossControl">\n' + timeline +
  '\n      </article>\n    </main>\n    <footer class="page"><p>GH-LossControl · <a href="' + canonical +
  '">Datenschutzerklärung</a></p></footer>\n  </body>\n</html>\n';

if (args[0] === '--check') {
  const existing = (await readFile(destination, 'utf8')).replaceAll('\r\n', '\n');
  if (existing !== page) throw new Error('versionsverlauf/index.html weicht von CHANGELOG.md oder der gemeinsamen Seitengestaltung ab.');
} else {
  await writeFile(destination, page, 'utf8');
}
console.log(entries.length + ' Versionsabschnitte ' + (args[0] === '--check' ? 'bestätigt.' : 'geschrieben.'));
