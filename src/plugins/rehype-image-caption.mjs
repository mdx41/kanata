const isWhitespaceText = (node) => node?.type === 'text' && !String(node.value ?? '').trim();

const meaningfulChildren = (node) =>
  Array.isArray(node?.children) ? node.children.filter((child) => !isWhitespaceText(child)) : [];

const isElement = (node, tagName) => node?.type === 'element' && node.tagName === tagName;

const isImageOnlyParagraph = (node) => {
  if (!isElement(node, 'p')) return false;
  const children = meaningfulChildren(node);
  return children.length === 1 && isElement(children[0], 'img');
};

const isCaptionOnlyParagraph = (node) => {
  if (!isElement(node, 'p')) return false;
  const children = meaningfulChildren(node);
  return children.length === 1 && isElement(children[0], 'em') && meaningfulChildren(children[0]).length > 0;
};

const isCombinedImageCaptionParagraph = (node) => {
  if (!isElement(node, 'p')) return false;
  const children = meaningfulChildren(node);
  return children.length === 2
    && isElement(children[0], 'img')
    && isElement(children[1], 'em')
    && meaningfulChildren(children[1]).length > 0;
};

const createFigure = (image, caption) => ({
  type: 'element',
  tagName: 'figure',
  properties: {
    className: ['article-figure']
  },
  children: [
    image,
    {
      type: 'element',
      tagName: 'figcaption',
      properties: {},
      children: caption.children ?? []
    }
  ]
});

const transformChildren = (children) => {
  if (!Array.isArray(children)) return;

  for (let index = 0; index < children.length; index += 1) {
    const current = children[index];
    if (current?.children) transformChildren(current.children);

    if (isCombinedImageCaptionParagraph(current)) {
      const [image, caption] = meaningfulChildren(current);
      children[index] = createFigure(image, caption);
      continue;
    }

    const next = children[index + 1];
    if (!isImageOnlyParagraph(current) || !isCaptionOnlyParagraph(next)) continue;

    const [image] = meaningfulChildren(current);
    const [caption] = meaningfulChildren(next);
    children.splice(index, 2, createFigure(image, caption));
  }
};

export default function rehypeImageCaption() {
  return (tree) => {
    transformChildren(tree.children);
  };
}
