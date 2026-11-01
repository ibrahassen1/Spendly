"""Fast offline contract checks for Gmail import. Does not replace Spring/Postgres or live Gmail integration tests."""
import re
import sqlite3
import unittest

AMOUNT = re.compile(r"(?:purchase|transaction|spent|charged|debit card purchase)[^$]{0,150}[$]\\s*([0-9]{1,7}(?:,[0-9]{3})*\\.[0-9]{2})", re.I)
SENDER = re.compile(r"(?s).*@[a-z0-9.-]*wellsfargo\\.com(?:>|\\s|$).*")


class GmailImportContractTests(unittest.TestCase):
    def test_sample_purchase(self):
        self.assertEqual(AMOUNT.search("Debit card purchase of $12.34 at SHOP").group(1), "12.34")

    def test_non_wells_fargo_sender_rejected(self):
        self.assertFalse(SENDER.fullmatch("Alerts <foo@otherbank.com>"))

    def test_duplicate_import_and_user_isolation(self):
        db = sqlite3.connect(":memory:")
        db.executescript("""
            CREATE TABLE balances(user_id TEXT PRIMARY KEY, allocation NUMERIC);
            CREATE TABLE tx(user_id TEXT, id TEXT, amount NUMERIC, PRIMARY KEY(user_id,id));
            INSERT INTO balances VALUES ('A',100),('B',200);
        """)

        def apply(user, message_id, amount):
            result = db.execute("INSERT OR IGNORE INTO tx VALUES(?,?,?)", (user, message_id, amount))
            if result.rowcount:
                db.execute("UPDATE balances SET allocation=allocation-? WHERE user_id=?", (amount, user))

        apply("A", "message1", 12.34)
        apply("A", "message1", 12.34)
        self.assertAlmostEqual(db.execute("SELECT allocation FROM balances WHERE user_id='A'").fetchone()[0], 87.66)
        self.assertEqual(db.execute("SELECT allocation FROM balances WHERE user_id='B'").fetchone()[0], 200)
        apply("B", "message1", 10)
        self.assertEqual(db.execute("SELECT allocation FROM balances WHERE user_id='B'").fetchone()[0], 190)

    @unittest.skip("Requires a real, redacted Wells Fargo purchase notification")
    def test_real_email_format(self):
        pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
