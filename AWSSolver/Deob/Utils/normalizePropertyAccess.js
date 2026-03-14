const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function normalizePropertyAccess(ast) {
  traverse(ast, {
    MemberExpression(path) {
      const { node } = path;

      // ✅ vO203["MizvT"] → vO203.MizvT
      if (
        node.computed &&
        t.isStringLiteral(node.property) &&
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(node.property.value)
      ) {
        node.computed = false;
        node.property = t.identifier(node.property.value);
      }
    }
  });
}

module.exports = normalizePropertyAccess;