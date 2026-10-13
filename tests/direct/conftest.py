"""Windows compatibility shim for gltest temporary files."""

import atexit
import os
import tempfile

import pytest


_original_unlink = os.unlink
_deferred = set()


def _unlink_windows_safe(path, *args, **kwargs):
    try:
        return _original_unlink(path, *args, **kwargs)
    except PermissionError:
        name = os.path.basename(os.fspath(path))
        if os.name != "nt" or not name.startswith("tmp") or os.path.dirname(os.path.abspath(path)) != tempfile.gettempdir():
            raise
        _deferred.add(path)


@atexit.register
def _cleanup_deferred():
    for path in _deferred:
        try:
            _original_unlink(path)
        except (PermissionError, FileNotFoundError):
            pass


@pytest.fixture(autouse=True)
def _windows_gltest_unlink(monkeypatch):
    if os.name == "nt":
        monkeypatch.setattr(os, "unlink", _unlink_windows_safe)
