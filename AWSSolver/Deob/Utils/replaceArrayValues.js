const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function replaceArrayValues(ast) {
  const allArrays = new Map(); // name → Node[]

  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (t.isIdentifier(id) && t.isArrayExpression(init)) {
        allArrays.set(id.name, init.elements);
      }
    }
  });

  traverse(ast, {
    MemberExpression(path) {
      const { object, property, computed } = path.node;
      if (!computed || !t.isIdentifier(object) || !t.isNumericLiteral(property)) return;
      if (path.parentPath.isAssignmentExpression({ left: path.node })) return;
      if (path.parentPath.isUpdateExpression()) return;

      const elements = allArrays.get(object.name);
      if (!elements) return;

      const node = elements[property.value];
      if (!node) return; // Index out of bounds

      // Node direkt einsetzen (egal ob String, Number, CallExpression, ...)
      path.replaceWith(t.cloneNode(node, true));
    }
  });
}

module.exports = replaceArrayValues;