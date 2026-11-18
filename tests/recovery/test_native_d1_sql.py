import importlib.util
from pathlib import Path
import sqlite3
import unittest
spec=importlib.util.spec_from_file_location('native_d1_sql',Path(__file__).resolve().parents[2]/'scripts/native_d1_sql.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class NativeDumpTests(unittest.TestCase):
    def test_child_first_export_restores_with_enforced_foreign_keys_and_trigger_values_preserved(self):
        sql="""PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE child(id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id), value TEXT);
INSERT INTO child VALUES('c','p','quoted; value '' and newline\ninside');
CREATE TABLE parent(id TEXT PRIMARY KEY);
INSERT INTO parent VALUES('p');
CREATE TRIGGER protect_parent BEFORE DELETE ON parent BEGIN SELECT RAISE(ABORT,'keep; parent'); END;
"""
        restored=module.dependency_ordered_dump(sql,{'child':['parent'],'parent':[]});db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON');db.executescript(restored)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(db.execute('SELECT value FROM child').fetchone()[0],"quoted; value ' and newline\ninside")
        with self.assertRaises(sqlite3.IntegrityError):db.execute("DELETE FROM parent WHERE id='p'")
    def test_unexpected_tables_and_statements_fail_closed(self):
        for sql in ['CREATE TABLE other(id TEXT);',"CREATE TABLE parent(id TEXT); DROP TABLE parent;","CREATE TABLE parent(id TEXT)"]:
            with self.assertRaises(ValueError):module.dependency_ordered_dump(sql,{'parent':[]})
    def test_cyclic_dependencies_need_explicit_review(self):
        with self.assertRaises(ValueError):module.dependency_ordered_dump('CREATE TABLE a(id TEXT); CREATE TABLE b(id TEXT);',{'a':['b'],'b':['a']})

if __name__=='__main__':unittest.main()
