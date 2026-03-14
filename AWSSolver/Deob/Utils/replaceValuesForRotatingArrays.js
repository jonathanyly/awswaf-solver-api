const vm = require('vm');
const parser   = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t        = require("@babel/types");

function evalConstantExpr(node, localVars = new Map()) {
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isStringLiteral(node)) return node.value;

  if (t.isIdentifier(node)) {
    return localVars.has(node.name) ? localVars.get(node.name) : null;
  }

  if (t.isUnaryExpression(node) && node.operator === '-') {
    const v = evalConstantExpr(node.argument, localVars);
    return v !== null ? -v : null;
  }

  if (t.isBinaryExpression(node)) {
    const l = evalConstantExpr(node.left, localVars);
    const r = evalConstantExpr(node.right, localVars);
    if (l === null || r === null) return null;
    switch (node.operator) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return l / r;
      case '%': return l % r;
    }
  }

  // AssignmentExpression: z.B. v1964 = 739
  if (t.isAssignmentExpression(node) && node.operator === '=') {
    const val = evalConstantExpr(node.right, localVars);
    if (val !== null && t.isIdentifier(node.left)) {
      localVars.set(node.left.name, val);
    }
    return val;
  }

  // SequenceExpression: z.B. (v1964 = 739, v1964 - 132)
  if (t.isSequenceExpression(node)) {
    let last = null;
    for (const expr of node.expressions) {
      last = evalConstantExpr(expr, localVars);
      if (last === null) return null;
    }
    return last;
  }

  return null;
}

function getDecodingArrays(ast) {
  const decodingArrays = new Map()
  traverse(ast, {
    FunctionDeclaration(path) {
      const {node} = path
      if(node.body.body.length === 2 && t.isVariableDeclaration(node.body.body[0]) && t.isReturnStatement(node.body.body[1])) {
        const arrayExpression = node.body.body[0].declarations[0].init;
        if(!t.isArrayExpression(arrayExpression)) return;
        const code = generate(node).code
        decodingArrays.set(node.id.name, code)
        console.log(`Found Decoding Array -> ${node.id.name}`)
      }
    }
  })
  return decodingArrays;
}

function getRotateFunctions(ast, decodingArrays) {
  const rotateFunctions = new Map();
  traverse(ast, {
    ExpressionStatement(path) {
      const { node } = path;
      const expr = node.expression;
      if (!t.isCallExpression(expr)) return;
      if (!t.isFunctionExpression(expr.callee)) return;
      const args = expr.arguments;
      if (!args.length || !t.isIdentifier(args[0])) return;
      const arrayFnName = args[0].name;
      if (!decodingArrays.has(arrayFnName)) return;
      console.log(`Found rotate IIFE for array -> ${arrayFnName}`);
      const fn = expr.callee;
      let arrayVar = null;
      for (const stmt of fn.body.body) {
        if (!t.isVariableDeclaration(stmt)) continue;
        const decl = stmt.declarations[0];
        if (
          t.isCallExpression(decl.init) &&
          t.isIdentifier(decl.init.callee) &&
          decl.init.callee.name === fn.params[0].name
        ) {
          arrayVar = decl.id.name;
          break;
        }
      }
      if (arrayVar) {
        fn.body.body.push(t.returnStatement(t.identifier(arrayVar)));
      }
      const iifeSrc = generate(node).code;
      rotateFunctions.set(arrayFnName, { node, code: iifeSrc });
      path.remove();
    }
  });
  return rotateFunctions;
}

function getDecodingFunctions(ast, rotateFunctions) {
  const decodingFunctions = new Map();
  const arrayFnNames = new Set(rotateFunctions.keys());
  traverse(ast, {
    FunctionDeclaration(path) {
      const { node } = path;
      let callsArrayFn = false;
      path.traverse({
        CallExpression(innerPath) {
          const callee = innerPath.node.callee;
          if (t.isIdentifier(callee) && arrayFnNames.has(callee.name)) {
            callsArrayFn = true;
            innerPath.stop();
          }
        }
      });
      if (!callsArrayFn) return;
      const fnName = node.id?.name;
      if (!fnName) return;
      console.log(`Found decoding function -> ${fnName}`);
      decodingFunctions.set(fnName, { node, code: generate(node).code });
    }
  });
  return decodingFunctions;
}

function getWrapperFunctions(ast, decodingFunctions) {
  const wrapperFunctions = new Map();
  const knownDecodingNames = new Set(decodingFunctions.keys());

  const topLevelFunctions = new Set();
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.parentPath.isProgram() || path.parentPath.isBlockStatement()) {
        const name = path.node.id?.name;
        if (name) topLevelFunctions.add(name);
      }
    }
  });

  let changed = true;
  while (changed) {
    changed = false;

    traverse(ast, {
      FunctionDeclaration(path) {
        const { node } = path;
        const fnName = node.id?.name;
        if (!fnName) return;
        if (knownDecodingNames.has(fnName)) return;
        if (wrapperFunctions.has(fnName)) return;

        let callsKnown = false;
        let hasFreeVars = false;

        const paramNames = new Set(node.params.map(p => t.isIdentifier(p) ? p.name : null).filter(Boolean));

        path.traverse({
          CallExpression(innerPath) {
            const callee = innerPath.node.callee;
            if (t.isIdentifier(callee) && knownDecodingNames.has(callee.name)) {
              callsKnown = true;
            }
          },
          Identifier(innerPath) {
            if (innerPath.parentPath.isMemberExpression({ computed: false }) && !innerPath.parentPath.get('object').node === innerPath.node) return;
            if (innerPath.parentPath.isVariableDeclarator() && innerPath.parentPath.get('id').node === innerPath.node) return;
            if (innerPath.parentPath.isFunctionDeclaration() && innerPath.parentPath.get('id').node === innerPath.node) return;
            if (innerPath.parentPath.isObjectProperty({ computed: false }) && innerPath.parentPath.get('key').node === innerPath.node) return;

            const name = innerPath.node.name;
            if (paramNames.has(name)) return;
            if (knownDecodingNames.has(name)) return;
            if (topLevelFunctions.has(name)) return;

            const binding = innerPath.scope.getBinding(name);
            if (binding) return;

            hasFreeVars = true;
            innerPath.stop();
          }
        });

        if (callsKnown && !hasFreeVars) {
          console.log(`Found wrapper function -> ${fnName}`);
          wrapperFunctions.set(fnName, { node, code: generate(node).code });
          knownDecodingNames.add(fnName);
          changed = true;
        } else if (callsKnown && hasFreeVars) {
          console.log(`Skipping wrapper function (has free vars) -> ${fnName}`);
        }
      }
    });
  }

  return wrapperFunctions;
}

function removeDecodingInfrastructure(ast, decodingArrays, rotateFunctions, decodingFunctions, wrapperFunctions) {
  const allNamesToRemove = new Set([
    ...decodingArrays.keys(),
    ...rotateFunctions.keys(),
    ...decodingFunctions.keys(),
    ...wrapperFunctions.keys(),
  ]);

  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;
      if (!allNamesToRemove.has(name)) return;

      console.log(`Removing function -> ${name}`);

      // Wenn die Funktion das einzige Statement in einem Block ist → ganzen Block nicht entfernen
      // Aber die Declaration selbst schon
      path.remove();
    }
  });
}

function runSandbox(decodingArrays, rotateFunctions, decodingFunctions, wrapperFunctions) {
  const parts = [];

  for (const [, code] of decodingArrays) parts.push(code);
  for (const [, { node }] of decodingFunctions) parts.push(generate(node).code);
  for (const [, { node }] of wrapperFunctions) parts.push(generate(node).code);

  const resultVars = new Map();
  for (const [arrayFnName, { node }] of rotateFunctions) {
    const fnExpr = generate(node.expression.callee).code;
    const resultVar = `__result_${arrayFnName}`;
    resultVars.set(arrayFnName, resultVar);
    parts.push(`var ${resultVar} = (${fnExpr})(${arrayFnName});`);
  }

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(parts.join('\n\n'), sandbox);

  const results = new Map();
  for (const [arrayFnName, resultVar] of resultVars) {
    const arr = sandbox[resultVar];
    results.set(arrayFnName, arr);
    console.log(`Rotated array for ${arrayFnName}: [${arr.slice(0, 3).join(', ')}, ...]`);
  }
  return { results, sandbox };
}

function replaceDecodingCalls(ast, allWrapperNames, sandbox) {
  let replaced = 0;

  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      const callee = node.callee;

      if (!t.isIdentifier(callee)) return;
      if (!allWrapperNames.has(callee.name)) return;

      // ✅ localVars pro Call — Assignments zwischen Args teilen sich den State
      const localVars = new Map();
      const allLiteral = node.arguments.every(a => evalConstantExpr(a, localVars) !== null);
      if (!allLiteral) return;

      // ✅ Nochmal mit frischem State für die gefoldeten Werte
      const localVars2 = new Map();
      const foldedArgs = node.arguments.map(a => {
        const v = evalConstantExpr(a, localVars2);
        return typeof v === 'string' ? t.stringLiteral(v) : t.numericLiteral(v);
      });

      try {
        const callCode = `${callee.name}(${foldedArgs.map(a => generate(a).code).join(', ')})`;
        const result = vm.runInContext(callCode, sandbox);

        if (typeof result === 'string') {
          path.replaceWith(t.stringLiteral(result));
          replaced++;
        } else if (typeof result === 'number') {
          path.replaceWith(t.numericLiteral(result));
          replaced++;
        }
      } catch (e) {
        // freie Variablen oder andere Fehler → überspringen
      }
    }
  });

  console.log(`Replaced ${replaced} decoding calls with their literal values`);
}

function replaceValuesForRotatingArrays(ast, allDecodingArrays) {
  const decodingArrays    = getDecodingArrays(ast);
  const rotateFunctions   = getRotateFunctions(ast, decodingArrays);
  const decodingFunctions = getDecodingFunctions(ast, rotateFunctions);
  const wrapperFunctions  = getWrapperFunctions(ast, decodingFunctions);

  const { results, sandbox } = runSandbox(decodingArrays, rotateFunctions, decodingFunctions, wrapperFunctions);

  for (const [name, arr] of results) {
    allDecodingArrays.set(name, arr);
  }

  const allWrapperNames = new Set([
    ...decodingFunctions.keys(),
    ...wrapperFunctions.keys(),
  ]);

  replaceDecodingCalls(ast, allWrapperNames, sandbox);
  //removeDecodingInfrastructure(ast, decodingArrays, rotateFunctions, decodingFunctions, wrapperFunctions);

  return allDecodingArrays;
}

module.exports = replaceValuesForRotatingArrays;