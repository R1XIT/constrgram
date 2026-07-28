import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from telegram import InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove


def run(coro):
    return asyncio.run(coro)


def make_context():
    return SimpleNamespace(bot=SimpleNamespace(send_message=AsyncMock()))


def make_update(chat_id, text=None, contact=None, callback_data=None):
    message = None
    if text is not None or contact is not None:
        message = SimpleNamespace(text=text, contact=contact)
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


def linear_buttons_project():
    return {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "m1", "type": "message", "data": {
                "text": "hi", "buttonsEnabled": True,
                "buttons": [{"text": "Y"}, {"text": "N"}]}},
            {"id": "m2", "type": "message", "data": {"text": "bye", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "m1"},
            {"id": "e1", "source": "m1", "sourceHandle": "btn-0", "target": "m2"},
        ],
    }


def test_start_routes_to_initial_message_with_inline_keyboard(make_bot):
    bot = make_bot(linear_buttons_project())
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    calls = sent(ctx)
    assert calls[0]["chat_id"] == 42
    assert calls[0]["text"] == "hi"
    markup = calls[0]["reply_markup"]
    assert isinstance(markup, InlineKeyboardMarkup)
    btn = markup.inline_keyboard[0][0]
    assert btn.text == "Y"
    assert btn.callback_data == "btn_0"
    assert bot.user_state[42] == "m1"


def test_callback_advances_and_removes_keyboard(make_bot):
    bot = make_bot(linear_buttons_project())
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    run(bot.handle(make_update(42, callback_data="btn_0"), ctx))
    calls = sent(ctx)
    assert calls[1]["text"] == "bye"
    assert isinstance(calls[1]["reply_markup"], ReplyKeyboardRemove)
    assert bot.user_state[42] == "start"  # m2 терминальна


def test_start_command_resets_mid_flow(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "m1", "type": "message", "data": {"text": "first", "buttonsEnabled": False}},
            {"id": "m2", "type": "message", "data": {"text": "second", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "m1"},
            {"id": "e1", "source": "m1", "target": "m2"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(7, text="/start"), ctx))
    assert bot.user_state[7] == "m1"
    run(bot.handle(make_update(7, text="/start"), ctx))
    assert sent(ctx)[1]["text"] == "first"
    assert bot.user_state[7] == "m1"


def test_variable_substitution(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "m1", "type": "message",
             "data": {"text": "Hi {{first_name}} {{last_name}}!", "buttonsEnabled": False}},
        ],
        "edges": [{"id": "e0", "source": "start", "target": "m1"}],
    }
    bot = make_bot(project)
    ctx = make_context()
    bot.user_vars[42] = {"first_name": "Иван", "last_name": "Петров"}
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "Hi Иван Петров!"


def test_unknown_variable_renders_empty(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "m1", "type": "message",
             "data": {"text": "X{{missing}}Y", "buttonsEnabled": False}},
        ],
        "edges": [{"id": "e0", "source": "start", "target": "m1"}],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "XY"


def auth_project(refusal=False):
    data = {
        "promptText": "Поделитесь", "contactButtonText": "Контакт",
        "refusalEnabled": refusal, "refusalButtonText": "Отказаться",
    }
    edges = [
        {"id": "e0", "source": "start", "target": "a1"},
        {"id": "e1", "source": "a1", "sourceHandle": "contact", "target": "m1"},
    ]
    nodes = [
        {"id": "start", "type": "start", "data": {}},
        {"id": "a1", "type": "auth", "data": data},
        {"id": "m1", "type": "message",
         "data": {"text": "Привет, {{first_name}}!", "buttonsEnabled": False}},
        {"id": "m2", "type": "message", "data": {"text": "reject", "buttonsEnabled": False}},
    ]
    if refusal:
        edges.append({"id": "e2", "source": "a1", "sourceHandle": "refused", "target": "m2"})
    return {"token": "T", "mode": "polling", "nodes": nodes, "edges": edges}


def test_auth_prompt_uses_request_contact_reply_keyboard(make_bot):
    bot = make_bot(auth_project(refusal=True))
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    call = sent(ctx)[0]
    assert call["text"] == "Поделитесь"
    markup = call["reply_markup"]
    assert isinstance(markup, ReplyKeyboardMarkup)
    assert markup.keyboard[0][0].text == "Контакт"
    assert markup.keyboard[0][0].request_contact is True
    assert markup.keyboard[1][0].text == "Отказаться"
    assert bot.user_state[42] == "a1"


def test_contact_stores_vars_and_advances(make_bot):
    bot = make_bot(auth_project())
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    contact = SimpleNamespace(
        first_name="Иван", last_name="Петров", phone_number="+71234567890")
    run(bot.handle(make_update(42, contact=contact), ctx))
    assert bot.user_vars[42] == {
        "first_name": "Иван", "last_name": "Петров", "phone": "+71234567890"}
    assert sent(ctx)[1]["text"] == "Привет, Иван!"


def test_refusal_by_text_advances(make_bot):
    bot = make_bot(auth_project(refusal=True))
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    run(bot.handle(make_update(42, text="Отказаться"), ctx))
    assert sent(ctx)[1]["text"] == "reject"
    assert bot.user_state[42] == "start"


def test_arbitrary_text_ignored_while_waiting_for_contact(make_bot):
    bot = make_bot(auth_project())
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    before = len(sent(ctx))
    run(bot.handle(make_update(42, text="привет"), ctx))
    assert len(sent(ctx)) == before
    assert bot.user_state[42] == "a1"


def test_contact_ignored_in_message_state(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "m1", "type": "message", "data": {"text": "first", "buttonsEnabled": False}},
            {"id": "m2", "type": "message", "data": {"text": "second", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "m1"},
            {"id": "e1", "source": "m1", "target": "m2"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert bot.user_state[42] == "m1"
    before = len(sent(ctx))
    contact = SimpleNamespace(first_name="X", last_name="Y", phone_number="+1")
    run(bot.handle(make_update(42, contact=contact), ctx))
    assert len(sent(ctx)) == before
    assert bot.user_state[42] == "m1"
