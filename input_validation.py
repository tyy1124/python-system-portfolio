"""共用輸入驗證工具。"""

import math


def parse_bounded_float(value, field_name, minimum, maximum):
    """將輸入轉為有限浮點數，並限制在閉區間內。"""

    if value is None or str(value).strip() == "":
        return None, f"請輸入{field_name}"

    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None, f"{field_name}必須是數字"

    if not math.isfinite(number):
        return None, f"{field_name}必須是有限數值"

    if number < minimum or number > maximum:
        return None, f"{field_name}必須介於 {minimum:g}～{maximum:g}"

    return number, None
