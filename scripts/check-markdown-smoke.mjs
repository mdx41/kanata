import { readSmokeFixtureHtml, reportSmokeCheckResult } from './smoke-utils.mjs';

const hasClass = (html, className) => {
  const pattern = new RegExp(`class="[^"]*\\b${className}\\b`, 'i');
  return pattern.test(html);
};

const getTagsByClass = (html, tag, className) => {
  const pattern = new RegExp(`<${tag}[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'gi');
  return Array.from(html.matchAll(pattern)).map((match) => match[0]);
};

const getFigureBlock = (html) => {
  const match = html.match(
    /<figure[^>]*\bclass="[^"]*\bfigure\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/i
  );
  return match ? match[1] : '';
};

const getGalleryBlock = (html) => {
  const match = html.match(
    /<ul[^>]*\bclass="[^"]*\bgallery\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i
  );
  return match ? match[1] : '';
};

const getArticleFigureBlock = (html) => {
  const match = html.match(
    /<figure[^>]*\bclass="[^"]*\barticle-figure\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/i
  );
  return match ? match[1] : '';
};

const checkGroups = [
  {
    label: 'Callout check',
    checks: [
      {
        id: 'callout.tip',
        test: (html) => /class="[^"]*\bcallout\b[^"]*\btip\b/.test(html)
      },
      {
        id: 'callout-title',
        test: (html) => /class="[^"]*\bcallout-title\b/.test(html)
      }
    ]
  },
  {
    label: 'Code block check',
    checks: [
      {
        id: 'code-block.wrapper',
        test: (html) => hasClass(html, 'code-block')
      },
      {
        id: 'code-block.toolbar',
        test: (html) => hasClass(html, 'code-toolbar')
      },
      {
        id: 'code-block.data-attrs',
        test: (html) => {
          const blocks = getTagsByClass(html, 'div', 'code-block');
          return blocks.some((tag) => /data-lines\s*=/.test(tag) && /data-lang\s*=/.test(tag));
        }
      },
      {
        id: 'code-copy.button',
        test: (html) => {
          const buttons = getTagsByClass(html, 'button', 'code-copy');
          return buttons.some((tag) => /aria-label\s*=/.test(tag) && /data-state\s*=/.test(tag));
        }
      },
      {
        id: 'code-lines.class',
        test: (html) => hasClass(html, 'line')
      }
    ]
  },
  {
    label: 'Figure check',
    checks: [
      {
        id: 'figure.wrapper',
        test: (html) => /<figure[^>]*\bclass="[^"]*\bfigure\b/.test(html)
      },
      {
        id: 'figure.media',
        test: (html) => /<(img|picture)\b/i.test(getFigureBlock(html))
      },
      {
        id: 'figure.caption',
        test: (html) => /<figcaption[^>]*\bclass="[^"]*\bfigure-caption\b/.test(getFigureBlock(html))
      }
    ]
  },
  {
    label: 'Image caption check',
    checks: [
      {
        id: 'image-caption.wrapper',
        test: (html) => /<figure[^>]*\bclass="[^"]*\barticle-figure\b/.test(html)
      },
      {
        id: 'image-caption.media',
        test: (html) => /<img\b/i.test(getArticleFigureBlock(html))
      },
      {
        id: 'image-caption.caption',
        test: (html) => /<figcaption[\s>][\s\S]*Smoke fixture caption/.test(getArticleFigureBlock(html))
      },
      {
        id: 'image-caption.inline-markdown',
        test: (html) => /<code>code<\/code>/.test(getArticleFigureBlock(html)) && /<a href="https:\/\/example.com"/.test(getArticleFigureBlock(html))
      },
      {
        id: 'image-caption.normal-emphasis',
        test: (html) => /This paragraph keeps <em>normal emphasis<\/em> inline\./.test(html)
      }
    ]
  },
  {
    label: 'Gallery check',
    checks: [
      {
        id: 'gallery.list',
        test: (html) => /<ul[^>]*\bclass="[^"]*\bgallery\b/.test(html)
      },
      {
        id: 'gallery.item',
        test: (html) => /<li[\s>]/i.test(getGalleryBlock(html))
      },
      {
        id: 'gallery.figure',
        test: (html) => /<figure[\s>]/i.test(getGalleryBlock(html))
      },
      {
        id: 'gallery.media',
        test: (html) => /<(img|picture)\b/i.test(getGalleryBlock(html))
      }
    ]
  }
];

const html = await readSmokeFixtureHtml('Markdown smoke check');
const failedIds = [];

for (const group of checkGroups) {
  const groupFailedIds = group.checks
    .filter((item) => !item.test(html))
    .map((item) => item.id);

  if (groupFailedIds.length === 0) {
    console.log(`${group.label} passed.`);
  } else {
    failedIds.push(...groupFailedIds);
  }
}

reportSmokeCheckResult('Markdown smoke check', failedIds);
