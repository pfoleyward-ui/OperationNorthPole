"""Order native D1 dump statements without changing their schema or values.
D1 enforces foreign keys: all tables must exist before dependent rows are loaded.
"""
import re
import sqlite3

def _name(value):
    value=value.strip()
    if value.startswith('"'):return value[1:-1].replace('""','"')
    if value.startswith('`'):return value[1:-1].replace('``','`')
    if value.startswith('['):return value[1:-1]
    return value

IDENT=r'("(?:[^"]|"")+"|`(?:[^`]|``)+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)'

def dependency_ordered_dump(sql,dependencies):
    statements=[];buffer=''
    for char in sql:
        buffer+=char
        if char==';' and sqlite3.complete_statement(buffer):
            statement=buffer.strip();buffer=''
            # Preserve comments inside statements; ignore only leading dump comments.
            statement=re.sub(r'\A(?:\s*--[^\n]*\n)*\s*','',statement)
            if statement:statements.append(statement)
    if buffer.strip():raise ValueError('Incomplete native SQL statement')
    tables={};rows={name:[] for name in dependencies};pragmas=[];after=[]
    for statement in statements:
        table=re.match(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?'+IDENT,statement,re.I)
        insert=re.match(r'INSERT\s+INTO\s+'+IDENT,statement,re.I)
        if table:
            name=_name(table.group(1))
            if name not in dependencies or name in tables:raise ValueError('Unexpected or duplicate native dump table')
            tables[name]=statement
        elif insert:
            name=_name(insert.group(1))
            if name not in rows:raise ValueError('Unexpected native dump data table')
            rows[name].append(statement)
        elif re.match(r'PRAGMA\s+defer_foreign_keys\s*=\s*(TRUE|ON|1)\s*;',statement,re.I):pragmas.append(statement)
        elif re.match(r'CREATE\s+(?:(?:UNIQUE\s+)?INDEX|TRIGGER)\b',statement,re.I):after.append(statement)
        else:raise ValueError('Unsupported native dump statement; explicit review required')
    if set(tables)!=set(dependencies):raise ValueError('Native dump schema is incomplete')
    ordered=[];done=set()
    while len(done)<len(dependencies):
        progress=False
        for name,parents in dependencies.items():
            if name in done or any(parent!=name and parent not in done for parent in parents):continue
            ordered.extend(rows[name]);done.add(name);progress=True
        if not progress:raise ValueError('Cyclic native dump row dependencies require review')
    return '\n'.join(pragmas+list(tables.values())+ordered+after)+'\n'
