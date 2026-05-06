# Server conversation execution observability plan

## 元数据

| 字段 | 值 |
| --- | --- |
| **创建日期** | 2026-05-06 |
| **预期改动范围** | backend server channel message lifecycle / callback-to-channel execution projection / frontend server conversation drawer system / session execution reuse / polling or refresh strategy / tests |
| **改动类型** | feat |
| **优先级** | P0 |
| **状态** | drafting |

## 实施阶段

- [ ] Phase 0: 收敛 execution 可观测性产品模型与非目标
- [ ] Phase 1: 建立 channel 内 execution placeholder message 契约
- [ ] Phase 2: 建立右侧 execution drawer 与 session 详情复用
- [ ] Phase 3: 收敛增量刷新策略与最终验证

---

## 背景

### 问题陈述

当前 server conversation 已经支持用户消息、thread、task 和 shared artifacts，但 mention 触发 agent 之后的执行过程仍然过于黑箱。executor 实际上会持续上报 `RUNNING + new_message + state_patch`，backend 也会把这些 session 内部数据正常持久化；但 server conversation 只在 callback `COMPLETED` 时镜像一条终态 assistant message 到 `server_channel_messages`。

这导致用户在频道里的心智非常割裂：

- 可以看到自己发出的 mention
- 可以看到 agent 最后回了一条结果
- 但看不到中间到底有没有在做事、做到哪一步、有没有卡在工具调用或 todo 阶段

与此同时，chat 执行页已经有完整的 session 可视化能力，包括消息、tool call、todo、workspace 变化和 computer 记录。问题不是“系统没有 execution observability”，而是“server conversation 没有把它投影成频道内可用的协作对象”。

### 目标

这份计划的目标是把 server conversation 的 agent 执行可观测性升级成一等能力，重点包括：

- mention 触发后立即在频道中生成 execution placeholder message
- 让运行中状态能以 compact 方式出现在频道消息流里
- 点击 execution item 后，在右侧 execution drawer 中查看完整 session 视图
- 尽量复用现有 chat execution 容器，而不是重写一套 session 可视化组件
- 在当前阶段优先收口产品模型与接口契约，不强绑 websocket 或 SSE 实现

### 关键洞察

#### 1. 频道主消息流和完整 execution transcript 必须分层

如果继续只有终态镜像，用户看不到过程；但如果把所有 thinking、tool call 和中间块都直接刷进频道，会把多人会话流彻底淹没。更稳的产品模型是：频道里放 compact execution item，完整 execution 细节进入右侧 drawer。

#### 2. execution item 本质上是 session 的频道侧投影

它不应成为新的“伪 session”模型，也不应该复制整份 transcript。execution item 只需要稳定表达：哪个 agent、哪个 session、当前状态、当前步骤、最近摘要，以及点击后如何打开完整 execution 视图。

#### 3. 现阶段更需要先打通 message + drawer 模型，而不是先上实时推送

当前 server 页面本身都还没有持续刷新 messages / artifacts / execution item。相比直接引入 websocket，这一轮更重要的是先把 execution 协作对象建模清楚，再决定底层更新通道。

---

## Phase 0: 收敛 execution 可观测性产品模型与非目标

### 目标

先明确 server conversation 里到底要显示什么、不显示什么，避免实现中把频道流和 execution transcript 混成一层。

### 任务清单

#### 0.1 定义 execution item 的产品语义

**描述：** execution item 是频道内的一条 compact system message，表达“某个 agent session 正在为当前会话工作”。它不是完整 transcript，也不是 task 卡片。

**涉及文件：**

- `specs/constitution/2026-05-06-server-agent-observability-tasks-and-persistence.md`
- `backend/app/models/server_channel_message.py`
- `frontend/features/servers/model/types.ts`

**验收标准：**

- [ ] execution item 的最小字段集被明确定义
- [ ] execution item 与普通 system message、task message 的语义差异被明确定义

#### 0.2 定义 execution drawer 的边界

**描述：** 右侧 execution drawer 负责展示完整 session 详情，默认复用现有 chat execution 视图，不在 server 页面里重新拼接一套伪 transcript。

**涉及文件：**

- `frontend/features/servers/ui/server-conversation-page-client.tsx`
- `frontend/features/chat/components/layout/execution-container.tsx`

**验收标准：**

- [ ] execution drawer 和 shared artifacts drawer、thread drawer 的职责边界清晰

#### 0.3 明确非目标

**描述：** 当前阶段不做：

- 把完整 transcript 直接刷进频道主消息流
- 为 execution item 新建完整独立 session 数据模型
- 先行强制要求 websocket / SSE 实时化

**验收标准：**

- [ ] 非目标写清楚，避免 scope 膨胀

---

## Phase 1: 建立 channel 内 execution placeholder message 契约

### 目标

让 mention 触发之后，频道里能立刻出现一个稳定的 execution 可见对象，并在运行过程中持续更新摘要。

### 任务清单

#### 1.1 在 trigger 成功后创建 placeholder

**描述：** 在 `ServerAgentTriggerService.trigger_for_channel_message()` 成功 enqueue 后，立即创建 execution placeholder message，而不是等 callback 完成后才首次出现在频道中。

**涉及文件：**

- `backend/app/services/server_agent_trigger_service.py`
- `backend/app/services/server_channel_message_service.py`
- `backend/app/repositories/server_channel_message_repository.py`

**验收标准：**

- [ ] mention 成功触发后，频道里立即可见 execution item
- [ ] execution item 至少包含 `session_id`、`agent_handle`、`trigger_message_id`、`thread_root_message_id`

#### 1.2 在 callback RUNNING 阶段增量更新 execution item

**描述：** callback 处理时，除了现有 session 内部消息持久化，还要更新 execution item 的摘要字段，例如运行状态、当前步骤、todo 进度、最近工具调用摘要。

**涉及文件：**

- `backend/app/services/callback_service.py`
- 如有需要：新增 execution placeholder resolver 或 helper

**验收标准：**

- [ ] RUNNING callback 会更新 execution item 摘要
- [ ] COMPLETED / FAILED callback 会把 execution item 收口到终态

#### 1.3 保留完成态结果摘要

**描述：** 当前完成态 assistant message 的频道镜像能力继续保留，但它不再是 execution 在频道里的唯一投影。

**涉及文件：**

- `backend/app/services/callback_service.py`
- `backend/app/schemas/server_channel_message.py`

**验收标准：**

- [ ] 完成态结果仍可回到频道流
- [ ] execution item 和完成态结果摘要不会互相覆盖语义

---

## Phase 2: 建立右侧 execution drawer 与 session 详情复用

### 目标

让用户点击频道中的 execution item 后，能在右侧看到真实 session 的完整 execution 视图。

### 任务清单

#### 2.1 为 server drawer system 新增 execution 模式

**描述：** 在 server conversation page 中新增 `drawer.type = "execution"`，并稳定承载 `session_id` 作为右侧 execution drawer 的入口。

**涉及文件：**

- `frontend/features/servers/ui/server-conversation-page-client.tsx`
- `frontend/features/servers/ui/conversation-drawers.tsx`
- `frontend/features/servers/model/types.ts`

**验收标准：**

- [ ] execution item 可点击并打开右侧 execution drawer
- [ ] drawer 状态能够稳定保存 `session_id`

#### 2.2 复用现有 execution container

**描述：** 优先复用已有 chat execution 视图能力，避免在 server feature 内重复实现消息、tool、todo、computer 渲染逻辑。

**涉及文件：**

- `frontend/features/chat/components/layout/execution-container.tsx`
- `frontend/features/chat/hooks/use-execution-session.ts`
- 如有需要：抽一个轻量 `ExecutionSessionDrawer` 适配层

**验收标准：**

- [ ] execution drawer 展示的是完整真实 session 视图
- [ ] 不重复实现一套 session transcript 渲染

#### 2.3 让频道消息渲染 execution item

**描述：** execution item 在主消息流里应有独立样式，至少能显示 agent、状态、当前步骤和入口 affordance。

**涉及文件：**

- `frontend/features/servers/ui/conversation-message-row.tsx`
- `frontend/features/servers/ui/server-message-content.tsx`
- `frontend/lib/i18n/locales/*/translation.json`

**验收标准：**

- [ ] execution item 与普通 system message 视觉语义可区分
- [ ] 点击 affordance 与 execution drawer 打通

---

## Phase 3: 收敛增量刷新策略与最终验证

### 目标

在不提前耦合特定实时通道的前提下，让 execution item、messages 和 artifacts 至少具备稳定的增量可见性。

### 任务清单

#### 3.1 为 server conversation 增加持续刷新策略

**描述：** 当前 server 页面主要在首屏加载时获取 messages/tasks/artifacts，发送消息后也没有统一的运行中刷新策略。需要为 conversation 增加 polling 或同级刷新机制。

**涉及文件：**

- `frontend/features/servers/ui/server-conversation-page-client.tsx`
- 如有需要：新增 `use-server-conversation-polling` hook

**验收标准：**

- [ ] 运行中的 execution item 能在频道内持续更新
- [ ] shared artifacts 在运行结束后能被及时看到，而不是只能重进页面

#### 3.2 验证 drawer 与主消息流不会互相打架

**描述：** 验证 desktop drawer 宽度、mobile fallback、thread/task/artifacts/execution 几种模式切换不会互相覆盖。

**涉及文件：**

- `frontend/features/servers/ui/server-conversation-page-client.tsx`
- 如有需要：相关组件测试或手工验证说明

**验收标准：**

- [ ] execution drawer 与 thread/task/artifacts 模式切换稳定
- [ ] mobile 行为至少有明确 fallback

#### 3.3 完成验证与回写 spec

**描述：** 为 placeholder 生命周期、drawer 打通和刷新策略补齐验证，并回写 spec 状态。

**涉及文件：**

- `backend/tests/*`
- `frontend/*`
- `specs/draft/16-server-conversation-execution-observability-plan.md`

**验收标准：**

- [ ] 有定向验证覆盖 placeholder creation、running update、drawer open
- [ ] spec 回写实际实现记录和状态
