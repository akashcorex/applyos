from __future__ import annotations

from unittest.mock import Mock

import pytest

from app.workers.retry_policy import UnsafeToRetry, is_transient, retry_if_transient


def test_connection_error_is_transient() -> None:
    assert is_transient(ConnectionError("network down"))
    assert not is_transient(ValueError("form invalid"))


def test_retry_if_transient_does_not_retry_after_submit() -> None:
    task = Mock()
    with pytest.raises(UnsafeToRetry):
        retry_if_transient(task, ConnectionError("timeout"), submit_attempted=True)
    task.retry.assert_not_called()


def test_retry_if_transient_retries_pre_submit_timeout() -> None:
    task = Mock()
    task.retry.side_effect = RuntimeError("retry")
    with pytest.raises(RuntimeError, match="retry"):
        retry_if_transient(task, TimeoutError("slow"), submit_attempted=False)
    task.retry.assert_called_once()
