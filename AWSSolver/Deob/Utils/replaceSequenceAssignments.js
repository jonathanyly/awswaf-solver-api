const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

function replaceSequenceAssignments(ast) {
  traverse(ast, {
    SequenceExpression(path) {
      const { node } = path;
      const last = node.expressions[node.expressions.length - 1];

      if (!t.isCallExpression(last) && !t.isBinaryExpression(last))
        return;

      const assignments = node.expressions.slice(0, node.expressions.length - 1);
      const values_to_replace = new Map();

      // 1. Werte sammeln
      for (const assignment of assignments) {
        if (
          t.isAssignmentExpression(assignment) &&
          assignment.operator === '='
        ) {
          if (t.isNumericLiteral(assignment.right)) {
            values_to_replace.set(assignment.left.name, assignment.right.value);
          } else if (t.isUnaryExpression(assignment.right)) {
            const operator = assignment.right.operator;
            const value = assignment.right.argument.value;
            const result = eval(`${operator}${value}`);
            values_to_replace.set(assignment.left.name, result);
          }
        }
      }

      if (values_to_replace.size === 0) return;
      path.traverse({
        Identifier(innerPath) {
          if (!values_to_replace.has(innerPath.node.name)) 
            return;
          // Nicht die Assignments selbst ersetzen
          if (innerPath.parentPath.isAssignmentExpression({ left: innerPath.node })) 
            return;

          innerPath.replaceWith(t.numericLiteral(values_to_replace.get(innerPath.node.name)));
        }
      });

      // 3. Assignments aus der SequenceExpression entfernen
      //    Nur den letzten CallExpression behalten
      const assignmentNames = new Set(values_to_replace.keys());
      node.expressions = node.expressions.filter(expr => {
        if (t.isAssignmentExpression(expr) && assignmentNames.has(expr.left.name)) {
          return false; // entfernen
        }
        return true;
      });

      // 4. Falls nur noch ein Ausdruck übrig → SequenceExpression auflösen
      if (node.expressions.length === 1) {
        path.replaceWith(node.expressions[0]);
      }
    }
  });
}

module.exports = replaceSequenceAssignments;