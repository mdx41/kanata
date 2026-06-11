const isImageOnlyParagraph = (node) =>
  node?.type === 'paragraph'
  && Array.isArray(node.children)
  && node.children.length === 1
  && node.children[0]?.type === 'image';

const isCaptionParagraph = (node) =>
  node?.type === 'paragraph'
  && Array.isArray(node.children)
  && node.children.length === 1
  && node.children[0]?.type === 'emphasis'
  && Array.isArray(node.children[0].children)
  && node.children[0].children.length > 0;

const transformChildren = (children) => {
  if (!Array.isArray(children)) return;

  for (let index = 0; index < children.length; index += 1) {
    const current = children[index];
    const next = children[index + 1];

    if (current?.children) transformChildren(current.children);

    if (!isImageOnlyParagraph(current) || !isCaptionParagraph(next)) continue;

    const image = current.children[0];
    const caption = next.children[0];

    children.splice(index, 2, {
      type: 'imageCaptionFigure',
      data: {
        hName: 'figure',
        hProperties: {
          className: ['article-figure']
        }
      },
      children: [
        image,
        {
          type: 'paragraph',
          data: {
            hName: 'figcaption'
          },
          children: caption.children
        }
      ]
    });
  }
};

export default function remarkImageCaption() {
  return (tree) => {
    transformChildren(tree.children);
  };
}
