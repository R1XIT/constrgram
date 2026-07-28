import importlib.util
import json
import os
import subprocess
import tempfile
import uuid
from importlib.util import cache_from_source

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


def _write_source(source):
    path = os.path.join(tempfile.gettempdir(), f"genbot_{uuid.uuid4().hex}.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(source)
    return path


def _import_path(path):
    name = os.path.splitext(os.path.basename(path))[0]
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _cleanup(path):
    pyc_path = cache_from_source(path)
    if pyc_path and os.path.exists(pyc_path):
        os.unlink(pyc_path)
        pycache_dir = os.path.dirname(pyc_path)
        try:
            os.rmdir(pycache_dir)
        except OSError:
            pass  # not empty (other bots' .pyc files) -- leave it
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def make_bot():
    created_paths = []

    def _make(project):
        path = _write_source(_generate(project))
        created_paths.append(path)
        return _import_path(path)

    yield _make

    for path in created_paths:
        _cleanup(path)
