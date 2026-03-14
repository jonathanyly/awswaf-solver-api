const fs = require('fs');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;

const replaceMainArray = require('./Utils/replaceMainArray.js');
const replaceArrayValues = require('./Utils/replaceArrayValues.js');
const deobfuscateDecodingFunction = require('./Utils/runDecodingFunction.js');
const replaceIntegerVariables = require('./Utils/replaceIntegerVariables.js');
const replaceIntDicts = require('./Utils/replaceIntDicts.js');
const replaceSequenceAssignments = require('./Utils/replaceSequenceAssignments.js');
const foldConstantExpressions = require('./Utils/foldConstantExpressions.js');
const concatStrings = require('./Utils/concatStrings.js');
const replaceValuesForRotatingArrays = require('./Utils/replaceValuesForRotatingArrays.js');
const normalizePropertyAccess = require('./Utils/normalizePropertyAccess.js');

const inputFile = 'Deob/in.js';
const outputFile = 'Deob/out.js';

function readFile(path) {
  try {
    const code = fs.readFileSync(path, 'utf8');
    console.log(`Read ${path} (${code.length} bytes)`);
    return code;
  } catch (e) {
    console.error(`Error reading ${path}:`, e.message);
    process.exit(1);
  }
}

function deobfuscate(code) {
  console.log('Parsing AST...');
  const ast = parser.parse(code, { sourceType: 'script' });
  const rotatingArrays = new Map()
  console.log('Pass 1: replaceMainArray');
  replaceMainArray(ast);
  deobfuscateDecodingFunction(ast);
  replaceArrayValues(ast);
  replaceIntegerVariables(ast);
  replaceIntDicts(ast);
  replaceSequenceAssignments(ast);
  foldConstantExpressions(ast);
  replaceValuesForRotatingArrays(ast, rotatingArrays)
  concatStrings(ast)
  normalizePropertyAccess(ast)
  //inlineWrapperFunctions(ast)
  return generate(ast, { retainLines: false, compact: false, comments: true }).code;
}

const obfuscatedCode = readFile(inputFile);
console.log('\nStarting deobfuscation...');
const result = deobfuscate(obfuscatedCode);

fs.writeFileSync(outputFile, result, 'utf8');
console.log('\n✓ Done!');
console.log(`  Input:     ${obfuscatedCode.length} bytes`);
console.log(`  Output:    ${result.length} bytes`);
console.log(`  Reduction: ${((1 - result.length / obfuscatedCode.length) * 100).toFixed(1)}%`);