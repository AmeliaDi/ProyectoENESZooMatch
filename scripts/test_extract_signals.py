import unittest

from scripts.extract_signals import outcome_present


class OutcomeDetectionTests(unittest.TestCase):
    def test_emotional_stability_is_not_an_outcome(self) -> None:
        self.assertFalse(
            outcome_present("Emotional stability is an important personality trait.")
        )

    def test_marital_stability_is_an_outcome(self) -> None:
        self.assertTrue(outcome_present("Neuroticism predicted lower marital stability."))


if __name__ == "__main__":
    unittest.main()
