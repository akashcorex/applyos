from app.ats.generic import field_from_snapshot


def test_field_from_snapshot_uses_label_and_required() -> None:
    field = field_from_snapshot(
        {
            "selector": "#email",
            "label": "Email address",
            "field_type": "text",
            "required": True,
            "options": None,
        }
    )
    assert field is not None
    assert field.selector == "#email"
    assert field.label == "Email address"
    assert field.required is True


def test_field_from_snapshot_maps_select_options() -> None:
    field = field_from_snapshot(
        {
            "selector": "[name='country']",
            "label": "Country",
            "field_type": "select",
            "required": False,
            "options": ["United States", "Canada"],
        }
    )
    assert field is not None
    assert field.field_type == "select"
    assert field.options == ["United States", "Canada"]


def test_field_from_snapshot_rejects_missing_selector() -> None:
    assert field_from_snapshot({"label": "Name"}) is None
