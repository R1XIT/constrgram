import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock


def run(coro):
    return asyncio.run(coro)


def make_context():
    return SimpleNamespace(bot=SimpleNamespace(send_message=AsyncMock()))


def make_update(chat_id, text=None, callback_data=None):
    message = SimpleNamespace(text=text, contact=None) if text is not None else None
    callback_query = None
    if callback_data is not None:
        callback_query = SimpleNamespace(data=callback_data, answer=AsyncMock())
    return SimpleNamespace(
        message=message,
        callback_query=callback_query,
        effective_chat=SimpleNamespace(id=chat_id),
    )


def sent(ctx):
    return [c.kwargs for c in ctx.bot.send_message.call_args_list]


def test_setvar_runs_through_and_substitutes(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "s1", "type": "setvar", "data": {"variable": "x", "value": "мир"}},
            {"id": "m1", "type": "message", "data": {"text": "Привет, {{x}}!", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "s1"},
            {"id": "e1", "source": "s1", "target": "m1"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "Привет, мир!"
    assert bot.user_vars[42]["x"] == "мир"


def test_input_captures_text_into_variable(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "i1", "type": "input", "data": {"promptText": "Как вас зовут?", "variable": "name"}},
            {"id": "m1", "type": "message", "data": {"text": "Привет, {{name}}!", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "i1"},
            {"id": "e1", "source": "i1", "target": "m1"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "Как вас зовут?"
    assert bot.user_state[42] == "i1"          # ждёт ввод
    run(bot.handle(make_update(42, text="Иван"), ctx))
    assert bot.user_vars[42]["name"] == "Иван"
    assert sent(ctx)[1]["text"] == "Привет, Иван!"


def test_condition_true_branch_and_else(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "s1", "type": "setvar", "data": {"variable": "age", "value": "20"}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "age", "op": "gte", "value": "18"}]}},
            {"id": "adult", "type": "message", "data": {"text": "совершеннолетний", "buttonsEnabled": False}},
            {"id": "minor", "type": "message", "data": {"text": "нет", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "s1"},
            {"id": "e1", "source": "s1", "target": "c1"},
            {"id": "e2", "source": "c1", "sourceHandle": "rule-0", "target": "adult"},
            {"id": "e3", "source": "c1", "sourceHandle": "else", "target": "minor"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "совершеннолетний"


def test_condition_else_when_no_rule_matches(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "s1", "type": "setvar", "data": {"variable": "age", "value": "10"}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "age", "op": "gte", "value": "18"}]}},
            {"id": "adult", "type": "message", "data": {"text": "да", "buttonsEnabled": False}},
            {"id": "minor", "type": "message", "data": {"text": "несовершеннолетний", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "s1"},
            {"id": "e1", "source": "s1", "target": "c1"},
            {"id": "e2", "source": "c1", "sourceHandle": "rule-0", "target": "adult"},
            {"id": "e3", "source": "c1", "sourceHandle": "else", "target": "minor"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "несовершеннолетний"


def test_condition_contains_operator(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "i1", "type": "input", "data": {"promptText": "Город?", "variable": "city"}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "city", "op": "contains", "value": "москв"}]}},
            {"id": "yes", "type": "message", "data": {"text": "Москва!", "buttonsEnabled": False}},
            {"id": "no", "type": "message", "data": {"text": "другой", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "i1"},
            {"id": "e1", "source": "i1", "target": "c1"},
            {"id": "e2", "source": "c1", "sourceHandle": "rule-0", "target": "yes"},
            {"id": "e3", "source": "c1", "sourceHandle": "else", "target": "no"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    run(bot.handle(make_update(42, text="Москва"), ctx))   # case-insensitive
    assert sent(ctx)[1]["text"] == "Москва!"


def test_infinite_passthrough_loop_resets_to_start(make_bot):
    # Условие, ветка которого ведёт в себя, а переменная не меняется -> защита сработает.
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "missing", "op": "empty", "value": ""}]}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "c1"},
            {"id": "e1", "source": "c1", "sourceHandle": "rule-0", "target": "c1"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))   # не должно зависнуть
    assert bot.user_state[42] == "start"
    assert sent(ctx) == []
