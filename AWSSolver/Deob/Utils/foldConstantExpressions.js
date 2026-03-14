const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function getNumericValue(node) {
  if (t.isNumericLiteral(node)) return node.value;
  if (
    t.isUnaryExpression(node) &&
    node.operator === '-' &&
    t.isNumericLiteral(node.argument)
  ) return -node.argument.value;
  return null;
}

function foldConstantExpressions(ast) {
  traverse(ast, {
    BinaryExpression: {
      exit(path) {
        const { node } = path;

        const left = getNumericValue(node.left);
        const right = getNumericValue(node.right);

        if (left === null || right === null) return;

        let result;
        switch (node.operator) {
          case '+': result = left + right; break;
          case '-': result = left - right; break;
          case '*': result = left * right; break;
          case '/': result = left / right; break;
          case '%': result = left % right; break;
          case '**': result = left ** right; break;
          case '&': result = left & right; break;
          case '|': result = left | right; break;
          case '^': result = left ^ right; break;
          case '<<': result = left << right; break;
          case '>>': result = left >> right; break;
          case '>>>': result = left >>> right; break;
          default: return;
        }

        if (!isFinite(result)) return;
        path.replaceWith(t.numericLiteral(result));
      }
    }
  });
}

module.exports = foldConstantExpressions;