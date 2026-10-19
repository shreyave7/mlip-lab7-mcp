"""Host-side result handling: the server's response is external data."""


def protect_result(tool_name: str, result: dict) -> dict:
    """TODO 3: return only approved airport fields to the model."""
    if tool_name != "airport_info" or not result.get("ok"):
        return result
    # TODO 3: build a NEW dictionary using this positive allowlist:
    # ok, synthetic, code, name, city, time_zone, gate_from, gate_to, walk_minutes.
    # Drop notice and every unexpected field, not just one attack phrase.
    return {
        "ok": False,
        "error": "not_implemented",
        "message": "Complete TODO 3: airport content is blocked until the policy is ready.",
    }
