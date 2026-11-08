import asyncio
import unittest
from unittest.mock import patch

from app.main import health


class PublicHealthEndpointTests(unittest.TestCase):
    def test_health_response_does_not_disclose_provider_configuration(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "synthetic-test-key"}):
            response = asyncio.run(health())

        self.assertEqual(response, {
            "service": "nexus-shield-ai-engine",
            "ok": True,
            "status": "healthy",
        })
        self.assertNotIn("ai_provider", response)
        self.assertNotIn("ai_configured", response)


if __name__ == "__main__":
    unittest.main()
