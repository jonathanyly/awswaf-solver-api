const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function concatStrings(ast) {
  let changed = true;

  while (changed) {
    changed = false;

    traverse(ast, {
      BinaryExpression(path) {
        const { node } = path;

        if (node.operator !== '+') return;
        if (!t.isStringLiteral(node.left) || !t.isStringLiteral(node.right)) return;

        const result = node.left.value + node.right.value;
        path.replaceWith(t.stringLiteral(result));
        changed = true;
      }
    });
  }
}

module.exports = concatStrings;