import importlib.util
import json
import os
import subprocess
import tempfile
import uuid

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _generate(project):
    fd, project_path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(project, f)
    try:
        result = subprocess.run(
            ["node", os.path.join("scripts", "generate.mjs"), project_path],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    finally:
        os.unlink(project_path)
    if result.returncode != 0:
        raise RuntimeError(f"generate.mjs failed:\n{result.stderr}")
    return result.stdout


def _import_source(source):
    path = os.path.join(tempfile.gettempdir(), f"genbot_{uuid.uuid4().hex}.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(source)
    name = os.path.splitext(os.path.basename(path))[0]
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def make_bot():
    def _make(project):
        return _import_source(_generate(project))
    return _make
