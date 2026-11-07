// Adds loading="lazy" to every image in Markdown/MDX pages, so long write-ups only download the
// pictures the reader actually scrolls to.
export default function rehypeLazyImages() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'element' && node.tagName === 'img') {
        node.properties ??= {};
        node.properties.loading ??= 'lazy';
        node.properties.decoding ??= 'async';
      }
      if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === 'img') {
        for (const [name, value] of [['loading', 'lazy'], ['decoding', 'async']]) {
          if (!node.attributes.some((a) => a.name === name)) node.attributes.push({ type: 'mdxJsxAttribute', name, value });
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
