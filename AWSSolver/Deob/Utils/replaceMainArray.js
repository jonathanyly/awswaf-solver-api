const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function replaceMainArray(ast) {
  const arrayFunctions = new Map();

  traverse(ast, {
    FunctionDeclaration(path) {
      const { node } = path;
      const body = node.body.body;

      if (
        node.params.length !== 0 ||
        body.length !== 3 ||
        !t.isVariableDeclaration(body[0]) ||
        !t.isExpressionStatement(body[1]) ||
        !t.isReturnStatement(body[2])
      ) return;

      const declarator = body[0].declarations[0];
      if (!t.isArrayExpression(declarator?.init)) return;

      const values = declarator.init.elements.map(el =>
        t.isStringLiteral(el) || t.isNumericLiteral(el) ? el.value : null
      );

      arrayFunctions.set(node.id?.name, values);
      //path.remove();
    }
  });

  traverse(ast, {
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (!t.isIdentifier(callee)) return;

      const arr = arrayFunctions.get(callee.name);
      if (!arr || args.length !== 0) return;

      path.replaceWith(t.arrayExpression(arr.map(v => t.valueToNode(v))));
    }
  });
}

module.exports = replaceMainArray;