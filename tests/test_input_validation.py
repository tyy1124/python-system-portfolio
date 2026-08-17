import math
import unittest

from input_validation import parse_bounded_float


class ParseBoundedFloatTests(unittest.TestCase):
    def test_accepts_number_inside_range(self):
        number, error = parse_bounded_float("170.5", "身高", 50, 250)
        self.assertEqual(number, 170.5)
        self.assertIsNone(error)

    def test_rejects_negative_number(self):
        number, error = parse_bounded_float("-1", "身高", 50, 250)
        self.assertIsNone(number)
        self.assertIn("50～250", error)

    def test_rejects_zero_when_below_minimum(self):
        number, error = parse_bounded_float("0", "體重", 2, 500)
        self.assertIsNone(number)
        self.assertIn("2～500", error)

    def test_rejects_non_numeric_value(self):
        number, error = parse_bounded_float("abc", "體重", 2, 500)
        self.assertIsNone(number)
        self.assertIn("必須是數字", error)

    def test_rejects_non_finite_values(self):
        for value in ("nan", "inf", "-inf"):
            with self.subTest(value=value):
                number, error = parse_bounded_float(
                    value, "數值", -math.inf, math.inf
                )
                self.assertIsNone(number)
                self.assertIn("有限數值", error)


if __name__ == "__main__":
    unittest.main()
