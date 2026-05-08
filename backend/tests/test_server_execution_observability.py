import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.models.server_channel_message import ServerChannelMessage
from app.models.user import User
from app.schemas.callback import AgentCallbackRequest, CallbackStatus
from app.schemas.task import TaskEnqueueResponse
from app.services.callback_service import CallbackService
from app.services.server_agent_trigger_service import ServerAgentTriggerService


class ServerExecutionObservabilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.server_id = uuid.uuid4()
        self.channel_id = uuid.uuid4()
        self.agent_id = uuid.uuid4()
        self.session_id = uuid.uuid4()
        self.current_user = User(
            id="user-1",
            primary_email="alice@example.com",
            display_name="Alice",
            avatar_url=None,
            status="active",
        )

    def test_trigger_creates_execution_placeholder_after_enqueue(self) -> None:
        task_service = MagicMock()
        context_service = MagicMock()
        service = ServerAgentTriggerService(
            task_service=task_service,
            shared_context_service=context_service,
        )
        message = SimpleNamespace(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id="user-1",
            text_preview="Please review @api-specialist",
            content={"text": "Please review @api-specialist"},
            thread_root_message_id=None,
        )
        channel = SimpleNamespace(
            id=self.channel_id,
            server_id=self.server_id,
            conversation_type="channel",
            direct_agent_identity_id=None,
            name="backend",
        )
        agent = SimpleNamespace(
            id=self.agent_id,
            server_id=self.server_id,
            preset_id=8,
            handle="api-specialist",
            display_name="API Specialist",
            visual_key="preset-visual-01",
            lifecycle_state="active",
            created_by="owner-user",
            persistent_state=SimpleNamespace(active_session_id=None),
        )
        membership = SimpleNamespace(agent_identity_id=self.agent_id)
        context_service.build_message_trigger_prompt.return_value = "shared prompt"
        task_service.enqueue_task.return_value = TaskEnqueueResponse(
            session_id=self.session_id,
            accepted_type="run",
            run_id=uuid.uuid4(),
            status="queued",
            queued_query_count=0,
        )

        with (
            patch(
                "app.services.server_agent_trigger_service.ServerChannelAgentMemberRepository.list_by_channel",
                return_value=[membership],
            ),
            patch(
                "app.services.server_agent_trigger_service.AgentIdentityRepository.get_by_id",
                return_value=agent,
            ),
            patch(
                "app.services.server_agent_trigger_service.ServerChannelMessageRepository.create"
            ) as create_message,
        ):
            service.trigger_for_channel_message(
                self.db,
                current_user=self.current_user,
                server_id=self.server_id,
                channel=channel,
                message=message,
            )

        placeholder = create_message.call_args.args[1]
        self.assertEqual(placeholder.message_type, "system")
        self.assertEqual(placeholder.channel_id, self.channel_id)
        self.assertEqual(placeholder.content["source"], "agent_execution")
        self.assertEqual(placeholder.content["session_id"], str(self.session_id))
        self.assertEqual(placeholder.content["agent_handle"], "api-specialist")
        self.assertEqual(placeholder.content["trigger_message_id"], str(message.id))
        self.assertEqual(placeholder.thread_root_message_id, None)

    def test_callback_updates_execution_placeholder_summary(self) -> None:
        service = CallbackService.__new__(CallbackService)
        placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "execution_status": "queued",
                "summary": None,
                "current_step": None,
                "todo_progress": {"completed": 0, "total": 0},
            },
            text_preview="queued",
            thread_root_message_id=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db_session = SimpleNamespace(
            id=self.session_id,
            config_snapshot={
                "channel_id": str(self.channel_id),
                "agent_identity_id": str(self.agent_id),
                "trigger_message_id": str(uuid.uuid4()),
                "thread_root_message_id": str(uuid.uuid4()),
            },
            state_patch=None,
        )
        callback = AgentCallbackRequest(
            session_id=str(self.session_id),
            time=datetime.now(UTC),
            status=CallbackStatus.RUNNING,
            progress=33,
            state_patch={
                "current_step": "Inspecting retry behavior",
                "todos": [
                    {"content": "inspect", "status": "completed"},
                    {"content": "patch", "status": "in_progress"},
                ],
            },
            new_message={
                "_type": "AssistantMessage",
                "content": [
                    {"_type": "TextBlock", "text": "Working on the retry path."}
                ],
            },
        )

        with patch(
            "app.services.callback_service.ServerChannelMessageRepository.find_execution_placeholder",
            return_value=placeholder,
        ):
            service._sync_execution_placeholder_to_server_channel(
                self.db,
                db_session=db_session,
                db_run=None,
                callback=callback,
            )

        self.assertEqual(placeholder.content["execution_status"], "running")
        self.assertEqual(
            placeholder.content["current_step"], "Inspecting retry behavior"
        )
        self.assertEqual(placeholder.content["summary"], "Working on the retry path.")
        self.assertEqual(
            placeholder.content["todo_progress"],
            {"completed": 1, "total": 2},
        )

    def test_completed_callback_replaces_placeholder_with_final_agent_message(
        self,
    ) -> None:
        service = CallbackService.__new__(CallbackService)
        thread_root_message_id = uuid.uuid4()
        placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "execution_status": "running",
                "summary": "working",
                "actor_label": "API Specialist",
                "agent_label": "API Specialist",
                "agent_handle": "api-specialist",
                "agent_visual_key": "preset-visual-01",
                "trigger_message_id": str(uuid.uuid4()),
                "thread_root_message_id": str(thread_root_message_id),
                "todo_progress": {"completed": 0, "total": 0},
            },
            text_preview="working",
            thread_root_message_id=thread_root_message_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db_session = SimpleNamespace(
            id=self.session_id,
            config_snapshot={
                "channel_id": str(self.channel_id),
                "agent_identity_id": str(self.agent_id),
                "trigger_message_id": str(uuid.uuid4()),
                "thread_root_message_id": str(thread_root_message_id),
            },
            state_patch=None,
        )
        callback = AgentCallbackRequest(
            session_id=str(self.session_id),
            time=datetime.now(UTC),
            status=CallbackStatus.COMPLETED,
            progress=100,
            new_message={
                "_type": "AssistantMessage",
                "content": [{"_type": "TextBlock", "text": "Final answer"}],
            },
        )

        with patch(
            "app.services.callback_service.ServerChannelMessageRepository.find_execution_placeholder",
            return_value=placeholder,
        ):
            replaced = service._sync_execution_placeholder_to_server_channel(
                self.db,
                db_session=db_session,
                db_run=None,
                callback=callback,
            )

        self.assertTrue(replaced)
        self.assertEqual(placeholder.content["source"], "agent_session")
        self.assertEqual(placeholder.content["text"], "Final answer")
        self.assertEqual(placeholder.content["actor_label"], "API Specialist")
        self.assertEqual(placeholder.thread_root_message_id, thread_root_message_id)

    def test_completed_callback_can_replace_already_completed_placeholder(self) -> None:
        service = CallbackService.__new__(CallbackService)
        thread_root_message_id = uuid.uuid4()
        placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "execution_status": "completed",
                "summary": "old summary",
                "actor_label": "API Specialist",
                "agent_label": "API Specialist",
                "agent_handle": "api-specialist",
                "agent_visual_key": "preset-visual-01",
                "trigger_message_id": str(uuid.uuid4()),
                "thread_root_message_id": str(thread_root_message_id),
                "todo_progress": {"completed": 0, "total": 0},
            },
            text_preview="old summary",
            thread_root_message_id=thread_root_message_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db_session = SimpleNamespace(
            id=self.session_id,
            config_snapshot={
                "channel_id": str(self.channel_id),
                "agent_identity_id": str(self.agent_id),
                "trigger_message_id": str(uuid.uuid4()),
                "thread_root_message_id": str(thread_root_message_id),
            },
            state_patch=None,
        )
        callback = AgentCallbackRequest(
            session_id=str(self.session_id),
            time=datetime.now(UTC),
            status=CallbackStatus.COMPLETED,
            progress=100,
            new_message={
                "_type": "AssistantMessage",
                "content": [
                    {"_type": "TextBlock", "text": "Final answer after replay"}
                ],
            },
        )

        with patch(
            "app.services.callback_service.ServerChannelMessageRepository.find_execution_placeholder",
            return_value=placeholder,
        ):
            replaced = service._sync_execution_placeholder_to_server_channel(
                self.db,
                db_session=db_session,
                db_run=None,
                callback=callback,
            )

        self.assertTrue(replaced)
        self.assertEqual(placeholder.content["source"], "agent_session")
        self.assertEqual(placeholder.content["text"], "Final answer after replay")

    def test_mirror_assistant_message_reuses_existing_placeholder(self) -> None:
        service = CallbackService.__new__(CallbackService)
        thread_root_message_id = uuid.uuid4()
        trigger_message_id = uuid.uuid4()
        placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "execution_status": "completed",
                "summary": "summary",
                "agent_handle": "api-specialist",
                "agent_visual_key": "preset-visual-01",
                "trigger_message_id": str(trigger_message_id),
            },
            text_preview="summary",
            thread_root_message_id=thread_root_message_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db_session = SimpleNamespace(
            id=self.session_id,
            config_snapshot={
                "channel_id": str(self.channel_id),
                "agent_identity_id": str(self.agent_id),
                "trigger_message_id": str(trigger_message_id),
                "thread_root_message_id": str(thread_root_message_id),
            },
        )
        db_message = SimpleNamespace(
            id=123,
            role="assistant",
            text_preview="Final answer preview",
            content={
                "_type": "AssistantMessage",
                "content": [{"_type": "TextBlock", "text": "Final answer full"}],
            },
        )
        agent = SimpleNamespace(
            id=self.agent_id,
            display_name="API Specialist",
            handle="api-specialist",
            visual_key="preset-visual-01",
        )

        with (
            patch(
                "app.services.callback_service.ServerChannelMessageRepository.find_execution_placeholder",
                return_value=placeholder,
            ),
            patch(
                "app.services.callback_service.AgentIdentityRepository.get_by_id",
                return_value=agent,
            ),
            patch(
                "app.services.callback_service.ServerChannelMessageRepository.create"
            ) as create_message,
        ):
            service._mirror_assistant_message_to_server_channel(
                self.db,
                db_session=db_session,
                db_run=None,
                db_message=db_message,
            )

        create_message.assert_not_called()
        self.assertEqual(placeholder.content["source"], "agent_session")
        self.assertEqual(placeholder.content["text"], "Final answer full")
        self.assertEqual(placeholder.text_preview, "Final answer full")

    def test_find_execution_placeholder_prefers_run_id_over_session_only(self) -> None:
        run_id_target = uuid.uuid4()
        trigger_message_id = uuid.uuid4()
        thread_root_message_id = uuid.uuid4()
        newer_wrong = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "run_id": str(uuid.uuid4()),
                "trigger_message_id": str(uuid.uuid4()),
                "thread_root_message_id": str(uuid.uuid4()),
            },
            text_preview="wrong",
            thread_root_message_id=thread_root_message_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        correct = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "run_id": str(run_id_target),
                "trigger_message_id": str(trigger_message_id),
                "thread_root_message_id": str(thread_root_message_id),
            },
            text_preview="correct",
            thread_root_message_id=thread_root_message_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.all.return_value = [newer_wrong, correct]
        self.db.query.return_value = query

        from app.repositories.server_channel_message_repository import (
            ServerChannelMessageRepository,
        )

        found = ServerChannelMessageRepository.find_execution_placeholder(
            self.db,
            channel_id=self.channel_id,
            session_id=self.session_id,
            run_id=run_id_target,
            trigger_message_id=trigger_message_id,
            thread_root_message_id=thread_root_message_id,
        )

        self.assertIs(found, correct)

    def test_find_execution_placeholder_does_not_fallback_when_identity_misses(
        self,
    ) -> None:
        queued_placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "execution_status": "queued",
                "summary": "@coworker is preparing a response.",
            },
            text_preview="@coworker is preparing a response.",
            thread_root_message_id=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.all.return_value = [queued_placeholder]
        self.db.query.return_value = query

        from app.repositories.server_channel_message_repository import (
            ServerChannelMessageRepository,
        )

        found = ServerChannelMessageRepository.find_execution_placeholder(
            self.db,
            channel_id=self.channel_id,
            session_id=self.session_id,
            run_id=uuid.uuid4(),
            trigger_message_id=uuid.uuid4(),
        )

        self.assertIsNone(found)
        self.assertEqual(queued_placeholder.content["source"], "agent_execution")

    def test_callback_replaces_promoted_queue_placeholder_by_queue_item_id(
        self,
    ) -> None:
        service = CallbackService.__new__(CallbackService)
        queue_item_id = uuid.uuid4()
        run_id = uuid.uuid4()
        wrong_placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "execution_status": "queued",
                "summary": "Wrong queued placeholder",
            },
            text_preview="Wrong queued placeholder",
            thread_root_message_id=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        correct_placeholder = ServerChannelMessage(
            id=uuid.uuid4(),
            channel_id=self.channel_id,
            author_user_id=None,
            message_type="system",
            content={
                "source": "agent_execution",
                "session_id": str(self.session_id),
                "queue_item_id": str(queue_item_id),
                "execution_status": "queued",
                "summary": "Queued placeholder",
            },
            text_preview="Queued placeholder",
            thread_root_message_id=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.all.return_value = [wrong_placeholder, correct_placeholder]
        self.db.query.return_value = query

        db_session = SimpleNamespace(
            id=self.session_id,
            config_snapshot={
                "channel_id": str(self.channel_id),
                "agent_identity_id": str(self.agent_id),
            },
        )
        db_run = SimpleNamespace(
            id=run_id,
            config_snapshot={
                "channel_id": str(self.channel_id),
                "agent_identity_id": str(self.agent_id),
                "queue_item_id": str(queue_item_id),
            },
        )
        callback = AgentCallbackRequest(
            session_id=str(self.session_id),
            run_id=str(run_id),
            time=datetime.now(UTC),
            status=CallbackStatus.COMPLETED,
            progress=100,
            new_message={
                "_type": "AssistantMessage",
                "content": [{"_type": "TextBlock", "text": "Second final answer"}],
            },
        )

        with patch(
            "app.services.callback_service.AgentIdentityRepository.get_by_id",
            return_value=SimpleNamespace(
                display_name="Jimi",
                handle="jimi",
                visual_key="preset-visual-02",
            ),
        ):
            replaced = service._sync_execution_placeholder_to_server_channel(
                self.db,
                db_session=db_session,
                db_run=db_run,
                callback=callback,
            )

        self.assertTrue(replaced)
        self.assertEqual(wrong_placeholder.content["source"], "agent_execution")
        self.assertEqual(wrong_placeholder.text_preview, "Wrong queued placeholder")
        self.assertEqual(correct_placeholder.content["source"], "agent_session")
        self.assertEqual(correct_placeholder.content["text"], "Second final answer")
        self.assertEqual(correct_placeholder.content["run_id"], str(run_id))
        self.assertEqual(
            correct_placeholder.content["queue_item_id"], str(queue_item_id)
        )


if __name__ == "__main__":
    unittest.main()
