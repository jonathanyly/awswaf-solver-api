const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function removeUnusedVariables(ast) {
  traverse(ast, {
    Program: {
      exit(path) {
        let changed = true;

        while (changed) {
          changed = false;
          path.scope.crawl();

          path.traverse({
            VariableDeclarator(varPath) {
              const { id } = varPath.node;
              if (!t.isIdentifier(id)) return;

              const declPath = varPath.parentPath;
              if (!declPath || !declPath.isVariableDeclaration()) return;

              // for...in / for...of Guard
              const declParent = declPath.parentPath;
              if (
                declParent &&
                (declParent.isForInStatement() || declParent.isForOfStatement()) &&
                declParent.get('left') === declPath
              ) {
                return;
              }

              const binding = varPath.scope.getBinding(id.name);
              if (!binding) return;
              if (binding.referencePaths.length > 0) return;

              const init = varPath.node.init;
              if (init && couldHaveSideEffects(init)) return;

              changed = true;

              // ✅ Fix: isOnlyDeclarator VOR dem Remove prüfen
              const isOnlyDeclarator = declPath.node.declarations.length === 1;

              if (isOnlyDeclarator) {
                // Gleich die ganze VariableDeclaration entfernen
                declPath.remove();
              } else {
                // Nur diesen einzelnen Declarator entfernen
                varPath.remove();
              }
            }
          });
        }
      }
    }
  });
}

function couldHaveSideEffects(node) {
  if (
    t.isLiteral(node) ||
    t.isIdentifier(node) ||
    t.isUnaryExpression(node) ||
    t.isBinaryExpression(node) ||
    t.isTemplateLiteral(node)
  ) {
    return false;
  }
  return true;
}

module.exports = removeUnusedVariables;