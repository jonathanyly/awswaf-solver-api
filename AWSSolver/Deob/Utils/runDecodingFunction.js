const vm = require('vm');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');


function deobfuscateDecodingFunction(ast, decoderName = 'f2') {
  // 1. Decoder-Funktion finden
  let decoderNode = null;
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id?.name === decoderName) {
        decoderNode = path.node;
        path.stop();
      }
    }
  });

  if (!decoderNode) {
    console.warn(`Decoder function "${decoderName}" not found – skipping pass`);
    return;
  }

  // 2. Sicher in Sandbox ausführen
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(generate(decoderNode).code, sandbox);
  const decoder = sandbox[decoderName];

  if (typeof decoder !== 'function') {
    console.warn(`"${decoderName}" is not a function – skipping pass`);
    return;
  }

  // 3. Aliases sammeln + die Declarator-Paths merken für späteres Löschen
  const aliases = new Set([decoderName]);
  const aliasDeclaratorPaths = []; // <-- Paths die wir später entfernen

  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (t.isIdentifier(init) && aliases.has(init.name)) {
        aliases.add(id.name);
        aliasDeclaratorPaths.push(path); // <-- merken
      }
    },
    AssignmentExpression(path) {
      const { left, right } = path.node;
      if (t.isIdentifier(right) && aliases.has(right.name) && t.isIdentifier(left)) {
        aliases.add(left.name);
      }
    }
  });

  console.log(`  Decoder aliases: ${[...aliases].join(', ')}`);

  // 4. Alle Decoder-Calls ersetzen
  let replaced = 0;
  traverse(ast, {
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (!t.isIdentifier(callee) || !aliases.has(callee.name)) return;
      if (!args.length || !t.isNumericLiteral(args[0])) return;

      try {
        const value = decoder(args[0].value);
        if (typeof value === 'string') {
          path.replaceWith(t.stringLiteral(value));
          replaced++;
        }
      } catch {
        // ignore decode errors
      }
    }
  });

  console.log(`  Replaced ${replaced} decoder calls`);

  // 5. Alias-Declarations entfernen
  // z.B. var vVF21872 = vF2187; -> weg
  for (const declaratorPath of aliasDeclaratorPaths) {
    const parentPath = declaratorPath.parentPath; // VariableDeclaration

    if (parentPath.node.declarations.length === 1) {
      // Einzige Deklaration -> ganzes Statement entfernen
      parentPath.remove();
    } else {
      // Mehrere Deklaratoren -> nur diesen einen entfernen
      declaratorPath.remove();
    }
  }

  console.log(`  Removed ${aliasDeclaratorPaths.length} alias declarations`);
}

module.exports = deobfuscateDecodingFunction;