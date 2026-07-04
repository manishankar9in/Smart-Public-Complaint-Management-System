import unittest

from config import Settings


class SettingsTests(unittest.TestCase):
    def test_extracts_database_name_from_atlas_uri(self):
        settings = Settings(
            MONGODB_URI="mongodb+srv://user:pass@cluster.example.mongodb.net/mydb?retryWrites=true&w=majority",
            DATABASE_NAME="",
        )
        self.assertEqual(settings.get_database_name(), "mydb")

    def test_prefers_explicit_database_name(self):
        settings = Settings(
            MONGODB_URI="mongodb+srv://user:pass@cluster.example.mongodb.net/from_uri?retryWrites=true&w=majority",
            DATABASE_NAME="from_env",
        )
        self.assertEqual(settings.get_database_name(), "from_env")


if __name__ == "__main__":
    unittest.main()
