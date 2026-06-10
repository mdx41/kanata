import { visit } from 'unist-util-visit';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getHostName = (url, fallback) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
};

const getStringAttr = (attrs, name) => {
  const value = attrs?.[name];
  return typeof value === 'string' ? value.trim() : '';
};

export default function remarkLinkCard() {
  return (tree) => {
    visit(tree, 'leafDirective', (node, index, parent) => {
      if (node.name !== 'link-card' || !parent || typeof index !== 'number') return;

      const url = getStringAttr(node.attributes, 'url');
      const title = getStringAttr(node.attributes, 'title');
      const description = getStringAttr(node.attributes, 'description');
      const siteName = getStringAttr(node.attributes, 'siteName');
      const image = getStringAttr(node.attributes, 'image');
      if (!url) return;

      const hostname = getHostName(url, siteName);
      const displaySite = siteName || hostname;
      const displayTitle = title || url;
      const noImageClass = image ? '' : ' link-card--no-image';
      const imageHtml = image
        ? `<span class="link-card__media" aria-hidden="true"><img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"></span>`
        : '';

      parent.children[index] = {
        type: 'html',
        value: [
          `<a class="link-card${noImageClass}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">`,
          '<span class="link-card__body">',
          `<span class="link-card__site">${escapeHtml(displaySite)}</span>`,
          `<span class="link-card__title">${escapeHtml(displayTitle)}</span>`,
          description ? `<span class="link-card__description">${escapeHtml(description)}</span>` : '',
          `<span class="link-card__url">${escapeHtml(hostname)}</span>`,
          '</span>',
          imageHtml,
          '</a>'
        ].join('')
      };
    });
  };
}
