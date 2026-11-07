import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { marked } from 'marked';

const origin = 'https://www.matrixter.com';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

// The CMS accepts Markdown from authenticated site editors.
const posts = [];
for (const file of (await readdir('_posts')).filter(name => name.endsWith('.md'))) {
  const source = (await readFile('_posts/' + file, 'utf8')).trimStart().replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Invalid front matter in ' + file);
  const {title, summary, category, date} = parse(match[1]);
  if (!title || !summary || !category || !Number.isFinite(Date.parse(date))) throw new Error('Missing post metadata in ' + file);
  const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  if (!/^[a-z0-9-]+$/.test(slug) || posts.some(post => post.slug === slug)) throw new Error('Invalid or duplicate slug: ' + slug);
  posts.push({slug, title: title.trim(), summary: summary.trim().split(/\n\s*\n/)[0], category, date, body: marked.parse(match[2]), path: '/journal/' + slug + '/'});
}
posts.sort((a,b) => Date.parse(b.date) - Date.parse(a.date) || a.slug.localeCompare(b.slug));

for (const post of posts) {
  const title = escape(post.title);
  const description = escape(post.summary);
  const related = posts.find(other => other.slug !== post.slug);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Matrixter Journal</title><meta name="description" content="${description}">
<link rel="canonical" href="${origin}${post.path}"><meta property="og:type" content="article">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:url" content="${origin}${post.path}"><meta property="og:image" content="${origin}/og-image.jpg">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/icons/matrixter-icon.svg">
<link rel="stylesheet" href="/journal/reading.css"></head><body>
<header><a class="brand" href="/#home"><img src="/icons/matrixter-icon.svg" alt="" width="36" height="36">Matrixter</a><a href="/#blog">Journal</a></header>
<main><article><p class="category">${escape(post.category)} · <time datetime="${escape(post.date)}">${new Intl.DateTimeFormat('en-ZA',{dateStyle:'long',timeZone:'Africa/Johannesburg'}).format(new Date(post.date))}</time></p>
<h1>${title}</h1>${post.body}</article>
<nav aria-label="Continue exploring"><a href="/#pulse">Explore questions on Pulse</a>${related ? '<a href="' + related.path + '">Read ' + escape(related.title) + '</a>' : ''}</nav></main>
<footer><a href="/#about">Our philosophy</a> · <a href="/participation/">Privacy enquiries</a> · <a href="https://www.facebook.com/profile.php?id=61591276046195">Matrixter on Facebook</a></footer></body></html>`;
  const directory = 'journal/' + post.slug;
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/index.html', html);
}
const cards = posts.map(post => `      <a class="blog-card" href="${post.path}"><span class="blog-card-category">${escape(post.category)}</span><h2 class="blog-card-title">${escape(post.title)}</h2><p class="blog-card-body">${escape(post.summary)}</p></a>`);
const home = await readFile('index.html', 'utf8');
const markers = /<!-- Journal cards begin -->[\s\S]*?<!-- Journal cards end -->/;
if (!markers.test(home)) throw new Error('Missing journal index markers');
await writeFile('index.html', home.replace(markers, () => '<!-- Journal cards begin -->\n    <div class="blog-grid">\n' + cards.join('\n') + '\n    </div>\n    <!-- Journal cards end -->'));
const paths = ['/', '/humanity/', '/participation/', ...posts.map(post => post.path)];
await writeFile('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + paths.map(path => '  <url><loc>' + origin + path + '</loc></url>').join('\n') + '\n</urlset>\n');
