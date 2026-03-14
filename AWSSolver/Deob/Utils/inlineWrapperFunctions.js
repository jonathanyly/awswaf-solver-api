const traverse = require('@babel/traverse').default;
const t        = require('@babel/types');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Statically fold a numeric constant expression node into a JS number.
 * Returns null if the expression cannot be fully resolved statically.
 */
function tryFoldNumeric(node) {
    if (t.isNumericLiteral(node)) return node.value;

    if (t.isUnaryExpression(node)) {
        const arg = tryFoldNumeric(node.argument);
        if (arg === null) return null;
        switch (node.operator) {
            case '-': return -arg;
            case '+': return +arg;
            case '~': return ~arg;
            default:  return null;
        }
    }

    if (t.isBinaryExpression(node)) {
        const left  = tryFoldNumeric(node.left);
        const right = tryFoldNumeric(node.right);
        if (left === null || right === null) return null;
        switch (node.operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            case '%': return left % right;
            default:  return null;
        }
    }

    return null;
}

/**
 * Build a { paramName -> index } map from a FunctionDeclaration node.
 */
function buildParamIndexMap(funcNode) {
    const map = {};
    funcNode.params.forEach((p, i) => {
        if (t.isIdentifier(p)) map[p.name] = i;
    });
    return map;
}

/**
 * Recursively clone an expression node, replacing every Identifier
 * that matches a parameter name with the corresponding call-site argument.
 */
function substituteParams(exprNode, paramMap, callArgs) {
    if (t.isIdentifier(exprNode)) {
        const idx = paramMap[exprNode.name];
        return idx !== undefined ? callArgs[idx] : exprNode;
    }

    if (t.isNumericLiteral(exprNode)) return exprNode;

    if (t.isUnaryExpression(exprNode)) {
        return t.unaryExpression(
            exprNode.operator,
            substituteParams(exprNode.argument, paramMap, callArgs),
            exprNode.prefix
        );
    }

    if (t.isBinaryExpression(exprNode)) {
        return t.binaryExpression(
            exprNode.operator,
            substituteParams(exprNode.left,  paramMap, callArgs),
            substituteParams(exprNode.right, paramMap, callArgs)
        );
    }

    if (t.isCallExpression(exprNode)) {
        return t.callExpression(
            exprNode.callee,
            exprNode.arguments.map(a => substituteParams(a, paramMap, callArgs))
        );
    }

    return exprNode;
}

// ─── Pass ─────────────────────────────────────────────────────────────────────

/**
 * Inline single-return wrapper functions and fold their arithmetic.
 *
 * Transforms:
 *   vO146[0] = f315(294, 326, 323, 287);
 *   function f315(p2293, p2294, p2295, p2296) { return f316(p2293 - -258, p2295); }
 *
 * Into:
 *   vO146[0] = f316(552, 323);
 */
function inlineWrapperFunctions(ast) {

    // Pass 1: collect all FunctionDeclarations that are single-return forwarders
    const wrappers = new Map(); // name -> FunctionDeclaration node

    traverse(ast, {
        FunctionDeclaration(path) {
            const { node } = path;
            const body = node.body.body;

            if (
                body.length === 1 &&
                t.isReturnStatement(body[0]) &&
                t.isCallExpression(body[0].argument)
            ) {
                wrappers.set(node.id.name, node);
            }
        }
    });

    if (wrappers.size === 0) return;

    // Pass 2: replace every call to a wrapper with the inlined forwarding call
    traverse(ast, {
        CallExpression(path) {
            if (!t.isIdentifier(path.node.callee)) return;

            const calleeName = path.node.callee.name;
            const funcNode   = wrappers.get(calleeName);
            if (!funcNode) return;

            // Only inline when every argument is a plain integer literal
            if (!path.node.arguments.every(a => t.isNumericLiteral(a))) return;

            const returnExpr = funcNode.body.body[0].argument;
            const paramMap   = buildParamIndexMap(funcNode);
            const callArgs   = path.node.arguments;

            // Substitute params with concrete args throughout the return expression
            const substituted = substituteParams(returnExpr, paramMap, callArgs);

            // Constant-fold each argument of the resulting call
            const resolvedArgs = substituted.arguments.map(arg => {
                const val = tryFoldNumeric(arg);
                return val !== null ? t.numericLiteral(val) : arg;
            });

            path.replaceWith(t.callExpression(substituted.callee, resolvedArgs));
        }
    });

    // Pass 3: remove the now-inlined wrapper function declarations
    traverse(ast, {
        FunctionDeclaration(path) {
            if (wrappers.has(path.node.id.name)) {
                path.remove();
            }
        }
    });
}

module.exports = inlineWrapperFunctions;