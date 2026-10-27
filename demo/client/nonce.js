// The page's CSP only runs a <style> element that carries the per-response nonce. border-beam renders its own
// <style>, so every <style> created from here on gets the nonce from <meta name="csp-nonce">. Import this first.
const nonce = document.querySelector('meta[name="csp-nonce"]')?.content;
if (nonce) {
  const create = document.createElement.bind(document);
  document.createElement = (tag, options) => {
    const node = create(tag, options);
    if (typeof tag === "string" && tag.toLowerCase() === "style") node.nonce = nonce;
    return node;
  };
}
