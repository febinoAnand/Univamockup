"""Checks a downloaded backup (.sql) with PostgreSQL's own parser.

    python validate_sql.py backup-sample.sql

The tests page checks the contents of the script (tables, rows, escaping) but a
browser can't run PostgreSQL's grammar over it. This does: it parses the file,
and checks that it is one transaction and that every table has a CREATE TABLE
and an INSERT whose rows match the columns. Get the file from "Files produced"
on the tests page, or from Settings > Backup > Download SQL.

Needs:  pip install pglast
Prints PASS / FAIL lines and exits non-zero if anything fails.
"""
import sys
from collections import Counter

import pglast

ok = True


def check(name, cond, detail=''):
    global ok
    ok = ok and bool(cond)
    print(('PASS' if cond else 'FAIL') + ' - ' + name + (('  ::  ' + str(detail)) if detail != '' else ''))


if len(sys.argv) != 2:
    sys.exit(__doc__)

sql = open(sys.argv[1], encoding='utf-8').read()

try:
    stmts = pglast.parse_sql(sql)
except pglast.parser.ParseError as err:
    check('parses as PostgreSQL', False, str(err))
    sys.exit(1)

check('parses as PostgreSQL', True, dict(Counter(type(s.stmt).__name__ for s in stmts)))
check('is one transaction (BEGIN ... COMMIT)',
      type(stmts[0].stmt).__name__ == 'TransactionStmt' and type(stmts[-1].stmt).__name__ == 'TransactionStmt')

creates = {s.stmt.relation.relname: s.stmt for s in stmts if type(s.stmt).__name__ == 'CreateStmt'}
inserts = {s.stmt.relation.relname: s.stmt for s in stmts if type(s.stmt).__name__ == 'InsertStmt'}
check('has tables', len(creates) > 0, len(creates))
check('every table has a CREATE TABLE and an INSERT', set(creates) == set(inserts), sorted(set(creates) ^ set(inserts)))

columns = {name: len([c for c in stmt.tableElts if type(c).__name__ == 'ColumnDef']) for name, stmt in creates.items()}
check('INSERT columns match the CREATE TABLE columns',
      all(len(inserts[n].cols) == columns[n] for n in inserts if n in columns))
check('every row has a value for every column',
      all(all(len(row) == len(inserts[n].cols) for row in inserts[n].selectStmt.valuesLists) for n in inserts))
check('every table has at least one row', all(len(i.selectStmt.valuesLists) > 0 for i in inserts.values()))
print('\n' + ', '.join(f'{n}: {len(i.selectStmt.valuesLists)}' for n, i in sorted(inserts.items())))

sys.exit(0 if ok else 1)
