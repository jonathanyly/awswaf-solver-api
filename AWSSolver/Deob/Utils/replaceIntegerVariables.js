const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function replaceIntegerVariables(ast) {
    
    const intVars = new Map();
    traverse(ast, {
        VariableDeclarator(path) {
            const { node } = path;
            if (
                t.isIdentifier(node.id) &&
                t.isNumericLiteral(node.init)
            ) {
                const binding = path.scope.getBinding(node.id.name);
                if (
                    binding &&
                    binding.constant &&
                    binding.references > 0
                ) {
                    intVars.set(node.id.name, node.init.value);
                }
            }
        }
    });
    traverse(ast, {
        UnaryExpression(path) {
            const { node } = path;
            if (!t.isIdentifier(node.argument)) return;
            if (!intVars.has(node.argument.name)) return;

            const value = intVars.get(node.argument.name);

            let result;
            switch (node.operator) {
                case '-': result = -value; break;
                case '+': result = +value; break;
                case '~': result = ~value; break;
                case '!': result = !value; break;
                default: return; // z.B. typeof, void – nicht anfassen
            }

            path.replaceWith(
                typeof result === 'boolean'
                    ? t.booleanLiteral(result)
                    : t.numericLiteral(result)
            );
            path.skip();
        },
        Identifier(path) {
            if (
                t.isVariableDeclarator(path.parent) &&
                path.parent.id === path.node
            ) return;

            if (
                t.isAssignmentExpression(path.parent) &&
                path.parent.left === path.node
            ) return;

            if (intVars.has(path.node.name)) {
                path.replaceWith(t.numericLiteral(intVars.get(path.node.name)));
            }
        }
    });

    // Pass 3: Remove now-unused variable declarations
    traverse(ast, {
        VariableDeclarator(path) {
            const { node } = path;
            if (
                t.isIdentifier(node.id) &&
                intVars.has(node.id.name)
            ) {
                const declPath = path.parentPath;
                if (declPath.node.declarations.length === 1) {
                    declPath.remove();
                } else {
                    path.remove();
                }
            }
        }
    });
}

module.exports =  replaceIntegerVariables;