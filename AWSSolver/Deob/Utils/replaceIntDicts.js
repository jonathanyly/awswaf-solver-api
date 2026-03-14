const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function replaceIntDicts(ast) {
    const dictVars = new Map();

    traverse(ast, {
        VariableDeclarator(path) {
            const { node } = path;
            if (!t.isIdentifier(node.id)) return;
            if (!t.isObjectExpression(node.init)) return;

            const binding = path.scope.getBinding(node.id.name);
            if (!binding || !binding.constant) return;

            const map = new Map();
            let allNumeric = true;

            for (const prop of node.init.properties) {
                if (!t.isObjectProperty(prop)) { allNumeric = false; break; }
                if (!t.isNumericLiteral(prop.value)) { allNumeric = false; break; }

                const key = t.isIdentifier(prop.key)
                    ? prop.key.name
                    : String(prop.key.value);

                map.set(key, prop.value.value);
            }

            if (allNumeric && map.size > 0) {
                dictVars.set(node.id.name, map);
            }
        }
    });

    traverse(ast, {
        MemberExpression(path) {
            const { node } = path;
            if (!t.isIdentifier(node.object)) return;
            if (!dictVars.has(node.object.name)) return;

            const map = dictVars.get(node.object.name);

            const key = node.computed
                ? t.isStringLiteral(node.property) ? node.property.value : null
                : node.property.name;

            if (key === null || !map.has(key)) return;

            path.replaceWith(t.numericLiteral(map.get(key)));
            path.skip();
        }
    });

    traverse(ast, {
        VariableDeclarator(path) {
            const { node } = path;
            if (!t.isIdentifier(node.id)) return;
            if (!dictVars.has(node.id.name)) return;

            const declPath = path.parentPath;
            if (declPath.node.declarations.length === 1) {
                declPath.remove();
            } else {
                path.remove();
            }
        }
    });
}

module.exports =  replaceIntDicts;