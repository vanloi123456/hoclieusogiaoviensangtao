const PUBLIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/gioi-thieu', priority: '0.8', changefreq: 'weekly' },
  { path: '/khong-gian-ao-3d', priority: '0.9', changefreq: 'weekly' },
  { path: '/kho-ung-dung', priority: '0.9', changefreq: 'weekly' },
  { path: '/hoc-lieu-so', priority: '0.9', changefreq: 'weekly' },
  { path: '/thi-nghiem-mo-phong', priority: '0.9', changefreq: 'weekly' },
  { path: '/ung-dung-tien-ich', priority: '0.8', changefreq: 'weekly' },
  { path: '/huong-dan', priority: '0.7', changefreq: 'weekly' },
  { path: '/ve-tac-gia', priority: '0.7', changefreq: 'monthly' },
];

export default function handler(req: any, res: any) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'hoclieuso.vercel.app')
    .split(',')[0]
    .trim();
  const origin = `${proto}://${host}`;
  const lastmod = new Date().toISOString().slice(0, 10);

  const urlsXml = PUBLIC_PATHS.map(
    (entry) => `  <url>
    <loc>${origin}${entry.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>
`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(xml);
}
