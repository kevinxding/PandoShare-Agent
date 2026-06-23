import type { ComponentType, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  Calendar,
  Clock,
  Edit3,
  ExternalLink,
  Filter,
  History,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsLeftRight,
  Circle,
  Code2,
  Copy,
  Cpu,
  FilePlus2,
  Files,
  Folder,
  FolderInput,
  Gauge,
  GitBranch,
  HeartPulse,
  Laptop,
  Maximize2,
  Menu,
  MessageSquarePlus,
  MessagesSquare,
  Minimize2,
  Mic,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Play,
  PackagePlus,
  PanelRight,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import './App.css'
import {
  createConversation,
  createProject,
  createScheduledTask,
  deleteScheduledTask,
  loadConversationMessages,
  loadHeartbeatSnapshot,
  loadModelGroups,
  loadWorkspaceSnapshot,
  pauseScheduledTask,
  runScheduledTask,
  sendConversationMessage,
  setHeartbeatRunning as setHeartbeatRunningBackend,
  setPinnedItem,
  streamRun,
  unsetPinnedItem,
  type HeartbeatTaskInput,
} from './backendApi'

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>

type NavItem = {
  label: string
  icon: IconType
}

type Project = {
  id?: string
  name: string
  chats: ProjectChat[]
}

type PinnedKind = 'project' | 'chat'

type PinnedItem = {
  id: string
  kind: PinnedKind
  sourceId?: string
  sourceName: string
  label: string
}

type ProjectChat = {
  id?: string
  name: string
  pinned: boolean
  created?: boolean
}

type ActiveChat = {
  id: string
  title: string
  conversationId?: string
  projectId?: string
}

type WorkspaceView = 'chat' | 'heartbeat' | 'settings' | 'plugins'

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  text: string
  time: string
}

type SmoothWriterState = {
  queue: string
  timer: number | null
  completed: boolean
}

type ComposerSendPayload = {
  message: string
  approvalMode: string
  modelId?: string
}

const quickActions: NavItem[] = [
  { label: '新对话', icon: MessageSquarePlus },
  { label: '搜索', icon: Search },
  { label: '插件', icon: PackagePlus },
]

const moreActions: NavItem[] = [
  { label: '心跳', icon: HeartPulse },
  { label: 'loop 7*24', icon: Activity },
  { label: 'GUI操作', icon: MousePointer2 },
]

const pluginTabs = ['\u63d2\u4ef6', '\u6280\u80fd', 'MCP']

const settingsGroups = [
  {
    title: '\u4e2a\u4eba',
    items: [
      { id: 'general', label: '\u5e38\u89c4', icon: Settings },
      { id: 'profile', label: '\u4e2a\u4eba\u8d44\u6599', icon: Bot },
      { id: 'appearance', label: '\u5916\u89c2', icon: Sparkles },
      { id: 'configuration', label: '\u914d\u7f6e', icon: SlidersHorizontal },
      { id: 'personalization', label: '\u4e2a\u6027\u5316', icon: Gauge },
      { id: 'shortcuts', label: '\u952e\u76d8\u5feb\u6377\u952e', icon: TerminalSquare },
      { id: 'usage', label: '\u4f7f\u7528\u60c5\u51b5\u548c\u8ba1\u8d39', icon: Activity },
    ],
  },
  {
    title: '\u96c6\u6210',
    items: [
      { id: 'mcp', label: 'MCP \u670d\u52a1\u5668', icon: PackagePlus },
      { id: 'browser', label: '\u6d4f\u89c8\u5668', icon: PanelRight },
      { id: 'computer', label: '\u7535\u8111\u64cd\u63a7', icon: MousePointer2 },
    ],
  },
  {
    title: '\u7f16\u7801',
    items: [
      { id: 'hooks', label: '\u94a9\u5b50', icon: GitBranch },
      { id: 'connections', label: '\u8fde\u63a5', icon: ExternalLink },
      { id: 'git', label: 'Git', icon: Code2 },
      { id: 'environment', label: '\u73af\u5883', icon: Cpu },
      { id: 'worktree', label: '\u5de5\u4f5c\u6811', icon: FolderInput },
    ],
  },
  {
    title: '\u5df2\u5f52\u6863',
    items: [
      { id: 'archived', label: '\u5df2\u5f52\u6863\u5bf9\u8bdd', icon: Archive },
    ],
  },
]

const initialPinnedItems: PinnedItem[] = [
  { id: 'project:项目 A', kind: 'project', sourceName: '项目 A', label: '置顶项目 A' },
  { id: 'chat:会话 A', kind: 'chat', sourceName: '会话 A', label: '置顶会话 A' },
  { id: 'project:项目 B', kind: 'project', sourceName: '项目 B', label: '置顶项目 B' },
]

const projects: Project[] = [
  {
    name: '项目 A',
    chats: [
      { name: '会话 A1', pinned: true },
      { name: '会话 A2', pinned: false },
      { name: '会话 A3', pinned: false },
    ],
  },
  {
    name: '项目 B',
    chats: [
      { name: '会话 B1', pinned: true },
      { name: '会话 B2', pinned: false },
    ],
  },
  {
    name: '项目 C',
    chats: [
      { name: '会话 C1', pinned: false },
      { name: '会话 C2', pinned: false },
    ],
  },
]

const chats = ['会话 A', '会话 B', '会话 C']

const attachActions: NavItem[] = [
  { label: '添加文件', icon: FilePlus2 },
  { label: '添加文件夹', icon: FolderInput },
  { label: '选择技能', icon: Sparkles },
  { label: '选择插件', icon: PackagePlus },
]

type SlashCommandItem = NavItem & { description: string }

const slashCommandActions: SlashCommandItem[] = [
  { label: 'MCP', description: '显示 MCP 服务器状态', icon: Code2 },
  { label: '个性', description: '选择 Codex 的回应方式', icon: Gauge },
  { label: '代码审查', description: '审查未暂存的更改，或与某个分支进行比较', icon: ShieldCheck },
  { label: '侧边', description: '在临时分支中发起侧边对话', icon: MessagesSquare },
  { label: '初始化', description: '创建包含 Codex 说明的 AGENTS.md 文件', icon: FilePlus2 },
  { label: '压缩', description: '压缩此会话的上下文（已使用 56%）', icon: Circle },
  { label: '反馈', description: '发送有关此聊天的反馈', icon: ThumbsUp },
  { label: '宠物', description: '唤醒或收起桌面宠物', icon: Bot },
  { label: '快速', description: '关闭快速并返回标准速度', icon: Activity },
  { label: '推理模式', description: '超高', icon: Sparkles },
]

const slashSkillActions = ['技能一', '技能二', '技能三']

type SlashMenuState = {
  query: string
  commands: SlashCommandItem[]
  skills: string[]
}

const matchesSlashQuery = (text: string, query: string) => text.toLocaleLowerCase().includes(query)

const getSlashMenuState = (message: string): SlashMenuState | null => {
  const trimmedMessage = message.trimStart()

  if (!trimmedMessage.startsWith('/')) {
    return null
  }

  const queryText = trimmedMessage.slice(1)

  if (/\s/.test(queryText)) {
    return null
  }

  const query = queryText.toLocaleLowerCase()

  if (!query) {
    return { query, commands: slashCommandActions, skills: slashSkillActions }
  }

  const commands = slashCommandActions.filter((item) => matchesSlashQuery(item.label, query))
  const skills = slashSkillActions.filter((skill) => matchesSlashQuery(skill, query) || matchesSlashQuery("Skill", query))

  if (commands.length === 0 && skills.length === 0) {
    return null
  }

  return { query, commands, skills }
}

const rightTools: NavItem[] = [
  { label: '审查', icon: ShieldCheck },
  { label: '终端', icon: TerminalSquare },
  { label: '浏览器', icon: PanelRight },
  { label: '文件', icon: Files },
  { label: '侧边聊天', icon: MessagesSquare },
]

const approvalModes = ['请求批准', '替我审批', '完全访问权限']

type ModelGroup = {
  provider: string
  models: string[]
}

const defaultModelLabel = '\u9009\u62e9\u6a21\u578b'

const modelGroups: ModelGroup[] = [
  { provider: 'DeepSeek\uff08\u6df1\u5ea6\u6c42\u7d22\uff09', models: ['DeepSeek V4 Pro', 'DeepSeek V4 Flash', 'DeepSeek R1'] },
  { provider: 'MiniMax\uff08\u7a00\u5b87\u79d1\u6280\uff09', models: ['MiniMax M3', 'MiniMax K2.6', 'MiniMax 2.7'] },
  { provider: 'GLM \u667a\u8c31AI', models: ['GLM 5.15.2', 'GLM-4-Plus', 'GLM 5 Turbo'] },
  { provider: 'Qwen \u901a\u4e49\u5343\u95ee\uff08\u963f\u91cc\uff09', models: ['Qwen3.7 Max', 'Qwen3.6 Plus', 'Qwen2.5-VL'] },
]
const backendUnavailableReply = '后端或模型请求失败，请检查 Pando 后端状态后重试。'

const initialMessages: ChatMessage[] = []

const formatMessageTime = () => {
  const now = new Date()

  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
}

const takeSmoothStreamChunk = (queue: string, completed: boolean) => {
  const chars = Array.from(queue)
  const length = chars.length
  const size = length > 240 ? 24 : length > 120 ? 12 : length > 60 ? 6 : completed && length > 24 ? 3 : 1

  return {
    chunk: chars.slice(0, size).join(''),
    rest: chars.slice(size).join(''),
    delayMs: completed || length > 80 ? 8 : 22,
  }
}
const getPinnedId = (kind: PinnedKind, sourceName: string) => `${kind}:${sourceName}`
const getSidebarChatId = (chatName: string) => `chat:${chatName}`
const getProjectChatId = (projectName: string, chatName: string) => `project:${projectName}:${chatName}`

const getActiveProjectName = (chatId: string) => {
  if (!chatId.startsWith('project:')) {
    return null
  }

  const [, projectName] = chatId.split(':')
  return projectName || null
}

const createSidebarActiveChat = (chatName: string, conversationId?: string): ActiveChat => ({
  id: getSidebarChatId(conversationId ?? chatName),
  title: chatName,
  conversationId,
})

const createProjectActiveChat = (projectName: string, chatName: string, conversationId?: string, projectId?: string): ActiveChat => ({
  id: getProjectChatId(projectName, conversationId ?? chatName),
  title: chatName,
  conversationId,
  projectId,
})

const createPinnedItem = (kind: PinnedKind, sourceName: string, sourceId?: string): PinnedItem => ({
  id: getPinnedId(kind, sourceId ?? sourceName),
  kind,
  sourceId,
  sourceName,
  label: `???${sourceName}`,
})

const sortProjectChats = (chatRows: ProjectChat[]) =>
  [...chatRows].sort((firstChat, secondChat) => Number(secondChat.pinned) - Number(firstChat.pinned))

const createNewChatName = (chatNames: string[]) => {
  const newChatCount = chatNames.filter((chatName) => chatName === '新会话' || chatName.startsWith('新会话 ')).length

  return newChatCount === 0 ? '新会话' : `新会话 ${newChatCount + 1}`
}

function SidebarButton({
  item,
  active = false,
  onClick,
}: {
  item: NavItem
  active?: boolean
  onClick?: () => void
}) {
  const Icon = item.icon

  return (
    <button className={active ? 'nav-button active' : 'nav-button'} type="button" onClick={onClick}>
      <Icon size={16} strokeWidth={1.9} />
      <span>{item.label}</span>
    </button>
  )
}

function SectionHeader({
  title,
  showMore = false,
  createLabel,
  createIcon: CreateIcon = Plus,
  onCreate,
  expanded,
  onToggle,
}: {
  title: string
  showMore?: boolean
  createLabel?: string
  createIcon?: IconType
  onCreate?: () => void
  expanded: boolean
  onToggle: () => void
}) {
  const createButtonLabel = createLabel ?? `${title}新建`

  return (
    <div className="section-header">
      <button
        className={`section-toggle ${expanded ? '' : 'collapsed'}`}
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? '折叠' : '展开'}${title}`}
        onClick={onToggle}
      >
        <ChevronDown className="section-chevron" size={13} />
        <span>{title}</span>
      </button>
      {onCreate ? (
        <button
          className="icon-ghost section-create-button"
          type="button"
          aria-label={createButtonLabel}
          title={createButtonLabel}
          onClick={onCreate}
        >
          <CreateIcon size={14} />
        </button>
      ) : null}
      {showMore ? (
        <button className="icon-ghost" type="button" aria-label={`${title}更多`}>
          <MoreHorizontal size={15} />
        </button>
      ) : null}
    </div>
  )
}

function NestedChatRow({
  chat,
  pinned = false,
  created = false,
  active = false,
  onOpenChat,
  onTogglePin,
}: {
  chat: string
  pinned?: boolean
  created?: boolean
  active?: boolean
  onOpenChat: () => void
  onTogglePin: () => void
}) {
  return (
    <div
      className={`nested-chat ${pinned ? 'pinned-chat' : ''} ${created ? 'created-chat' : ''} ${
        active ? 'active-chat' : ''
      }`}
    >
      <button
        className="nested-chat-main"
        type="button"
        aria-label={chat}
        aria-current={active ? 'page' : undefined}
        onClick={onOpenChat}
      >
        <span>{chat}</span>
      </button>
      <div className="nested-chat-actions">
        <button
          className={`icon-ghost nested-pin-button ${pinned ? 'active' : ''}`}
          type="button"
          aria-label={`${chat}${pinned ? '取消置顶' : '置顶'}`}
          aria-pressed={pinned}
          title={pinned ? '取消置顶' : '置顶'}
          onClick={onTogglePin}
        >
          <Pin size={13} />
        </button>
        <button className="icon-ghost" type="button" aria-label={`${chat}更多`}>
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  )
}

function SidebarChatRow({
  chat,
  pinned,
  active,
  onOpenChat,
  onTogglePin,
  onCreateChat,
}: {
  chat: string
  pinned: boolean
  active: boolean
  onOpenChat: () => void
  onTogglePin: () => void
  onCreateChat: () => void
}) {
  return (
    <div className={`sidebar-chat-row ${pinned ? 'pinned-chat' : ''} ${active ? 'active-chat' : ''}`}>
      <button
        className="sidebar-chat-main"
        type="button"
        aria-label={chat}
        aria-current={active ? 'page' : undefined}
        onClick={onOpenChat}
      >
        <span>{chat}</span>
      </button>
      <div className="sidebar-chat-actions">
        <button
          className={`icon-ghost sidebar-pin-button ${pinned ? 'active' : ''}`}
          type="button"
          aria-label={`${chat}${pinned ? '取消置顶' : '置顶'}`}
          aria-pressed={pinned}
          title={pinned ? '取消置顶' : '置顶'}
          onClick={onTogglePin}
        >
          <Pin size={13} />
        </button>
        <button
          className="icon-ghost sidebar-create-chat"
          type="button"
          aria-label={`${chat}创建新对话`}
          title="创建新对话"
          onClick={onCreateChat}
        >
          <MessageSquarePlus size={13} />
        </button>
        <button className="icon-ghost" type="button" aria-label={`${chat}更多`}>
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  )
}

function ProjectBlock({
  project,
  isPinned,
  activeChatId,
  onOpenChat,
  onCreateChat,
  onTogglePin,
  onToggleChatPin,
}: {
  project: Project
  isPinned: boolean
  activeChatId: string
  onOpenChat: (chat: ActiveChat) => void
  onCreateChat: (projectName: string) => void
  onTogglePin: () => void
  onToggleChatPin: (projectName: string, chatName: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={`project-block ${expanded ? '' : 'collapsed'}`}>
      <div className="project-title-row">
        <button
          className="project-title-main"
          type="button"
          aria-expanded={expanded}
          aria-label={`${project.name}${expanded ? '折叠' : '展开'}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <Folder size={15} />
          <span>{project.name}</span>
          <ChevronDown className="project-chevron" size={14} />
        </button>
        <div className="project-actions">
          <button
            className={`icon-ghost project-pin-button ${isPinned ? 'active' : ''}`}
            type="button"
            aria-label={`${project.name}${isPinned ? '取消置顶' : '置顶'}`}
            aria-pressed={isPinned}
            title={isPinned ? '取消置顶' : '置顶'}
            onClick={onTogglePin}
          >
            <Pin size={14} />
          </button>
          <button
            className="icon-ghost project-create-chat"
            type="button"
            aria-label={`${project.name}创建新对话`}
            title="创建新对话"
            onClick={() => {
              setExpanded(true)
              onCreateChat(project.name)
            }}
          >
            <MessageSquarePlus size={14} />
          </button>
          <button className="icon-ghost" type="button" aria-label={`${project.name}更多`}>
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            className="nested-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            {project.chats.map((chat) => (
              <NestedChatRow
                chat={chat.name}
                pinned={chat.pinned}
                created={chat.created}
                active={activeChatId === getProjectChatId(project.name, chat.id ?? chat.name)}
                onOpenChat={() => onOpenChat(createProjectActiveChat(project.name, chat.name, chat.id, project.id))}
                onTogglePin={() => onToggleChatPin(project.name, chat.name)}
                key={`${project.name}:${chat.name}`}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SettingsSidebar({
  collapsed,
  onBackApp,
}: {
  collapsed: boolean
  onBackApp: () => void
}) {
  const [activeSetting, setActiveSetting] = useState('general')

  return (
    <aside className={`left-sidebar settings-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="\u8bbe\u7f6e\u5bfc\u822a">
      <div className="sidebar-inner settings-sidebar-inner">
        <div className="settings-sidebar-top">
          <button className="settings-back-button" type="button" onClick={onBackApp}>
            <ChevronLeft size={16} />
            <span>{"\u8fd4\u56de\u5e94\u7528"}</span>
          </button>
          <label className="settings-search-box">
            <Search size={15} />
            <input aria-label="Search settings" placeholder={"\u641c\u7d22\u8bbe\u7f6e..."} />
          </label>
        </div>

        <nav className="settings-nav-scroll">
          {settingsGroups.map((group) => (
            <section className="settings-nav-group" key={group.title}>
              <div className="settings-nav-label">{group.title}</div>
              <div className="settings-nav-items">
                {group.items.map((item) => {
                  const Icon = item.icon

                  return (
                    <button
                      className={activeSetting === item.id ? 'settings-nav-item active' : 'settings-nav-item'}
                      type="button"
                      onClick={() => setActiveSetting(item.id)}
                      key={item.id}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function LeftSidebar({
  collapsed,
  activeChatId,
  activeView,
  onOpenChat,
  onOpenHeartbeat,
  onOpenSettings,
  onCloseSettings,
  onOpenPlugins,
  onToggle,
}: {
  collapsed: boolean
  activeChatId: string
  activeView: WorkspaceView
  onOpenChat: (chat: ActiveChat) => void
  onOpenHeartbeat: () => void
  onOpenSettings: () => void
  onCloseSettings: () => void
  onOpenPlugins: () => void
  onToggle: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [openSections, setOpenSections] = useState({ pinned: true, projects: true, chats: true })
  const [pinnedItemsState, setPinnedItemsState] = useState<PinnedItem[]>(initialPinnedItems)
  const [projectItems, setProjectItems] = useState<Project[]>(projects)
  const [chatItems, setChatItems] = useState(chats)
  const [globalChatIds, setGlobalChatIds] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true

    void loadWorkspaceSnapshot().then((snapshot) => {
      if (!active || !snapshot) {
        return
      }

      if (snapshot.projects && snapshot.projects.length > 0) {
        setProjectItems(
          snapshot.projects.map((project) => ({
            id: project.id,
            name: project.name,
            chats: project.chats.map((chat) => ({
              id: chat.id,
              name: chat.name,
              pinned: Boolean(chat.pinned),
            })),
          })),
        )
      }

      if (snapshot.chats && snapshot.chats.length > 0) {
        setChatItems(snapshot.chats.map((chat) => chat.name))
        setGlobalChatIds(
          Object.fromEntries(snapshot.chats.filter((chat) => chat.id).map((chat) => [chat.name, chat.id as string])),
        )
      }

      if (snapshot.pinnedItems && snapshot.pinnedItems.length > 0) {
        setPinnedItemsState(
          snapshot.pinnedItems.map((item) => ({
            id: item.id,
            kind: item.kind,
            sourceId: item.sourceId,
            sourceName: item.sourceName,
            label: item.label,
          })),
        )
      }
    })

    return () => {
      active = false
    }
  }, [])

  const isGlobalPinned = (kind: PinnedKind, sourceName: string, sourceId?: string) =>
    pinnedItemsState.some((item) => item.id === getPinnedId(kind, sourceId ?? sourceName))

  const toggleGlobalPin = (kind: PinnedKind, sourceName: string, sourceId?: string) => {
    const pinId = getPinnedId(kind, sourceId ?? sourceName)
    const isPinned = pinnedItemsState.some((item) => item.id === pinId)

    setOpenSections((currentSections) => ({ ...currentSections, pinned: true }))
    setPinnedItemsState((currentItems) =>
      isPinned
        ? currentItems.filter((item) => item.id !== pinId)
        : [createPinnedItem(kind, sourceName, sourceId), ...currentItems],
    )

    if (isPinned) {
      void unsetPinnedItem(sourceId ?? pinId)
      return
    }

    void setPinnedItem({
      kind: kind === 'project' ? 'project' : 'conversation',
      id: sourceId,
      title: sourceName,
    })
  }

  const createSidebarProject = async () => {
    setOpenSections((currentSections) => ({ ...currentSections, projects: true }))

    const nextProjectNumber = projectItems.filter((project) => project.name.startsWith('\u9879\u76ee X')).length + 1
    const fallbackName = nextProjectNumber === 1 ? '\u9879\u76ee X' : `\u9879\u76ee X${nextProjectNumber}`
    const backendProject = await createProject(fallbackName)
    const nextProject = backendProject
      ? {
          id: backendProject.id,
          name: backendProject.name,
          chats: backendProject.chats.map((chat) => ({ id: chat.id, name: chat.name, pinned: Boolean(chat.pinned) })),
        }
      : { name: fallbackName, chats: [] }

    setProjectItems((currentProjects) => [nextProject, ...currentProjects])
  }

  const createSidebarChat = async () => {
    setOpenSections((currentSections) => ({ ...currentSections, chats: true }))

    const nextChatName = createNewChatName(chatItems)
    const backendChat = await createConversation({ title: nextChatName, scope: { type: 'global' } })
    const chatName = backendChat?.name ?? nextChatName

    if (backendChat?.id) {
      setGlobalChatIds((currentIds) => ({ ...currentIds, [chatName]: backendChat.id as string }))
    }

    setChatItems((currentChats) => [chatName, ...currentChats])
    onOpenChat(createSidebarActiveChat(chatName, backendChat?.id))
  }

  const createProjectChat = async (projectName: string) => {
    const targetProject = projectItems.find((project) => project.name === projectName)

    if (!targetProject) {
      return
    }

    setOpenSections((currentSections) => ({ ...currentSections, pinned: true, projects: true }))

    const nextChatName = createNewChatName(targetProject.chats.map((chat) => chat.name))
    const backendChat = await createConversation({
      title: nextChatName,
      scope: { type: 'project', projectId: targetProject.id, projectName },
    })
    const chatName = backendChat?.name ?? nextChatName
    const nextChat = { id: backendChat?.id, name: chatName, pinned: false, created: true }

    setProjectItems((currentProjects) =>
      currentProjects.map((project) =>
        project.name === projectName
          ? {
              ...project,
              chats: sortProjectChats([nextChat, ...project.chats]),
            }
          : project,
      ),
    )
    onOpenChat(createProjectActiveChat(projectName, chatName, backendChat?.id, targetProject.id))
  }

  const createContextChat = () => {
    const projectName = getActiveProjectName(activeChatId)

    if (projectName) {
      createProjectChat(projectName)
      return
    }

    createSidebarChat()
  }

  const toggleProjectChatPin = (projectName: string, chatName: string) => {
    setProjectItems((currentProjects) =>
      currentProjects.map((project) => {
        if (project.name !== projectName) {
          return project
        }

        const targetChat = project.chats.find((chat) => chat.name === chatName)

        if (!targetChat) {
          return project
        }

        const nextPinned = !targetChat.pinned
        const updatedTarget = { ...targetChat, pinned: nextPinned }
        const otherChats = project.chats.filter((chat) => chat.name !== chatName)
        const chats = nextPinned ? [updatedTarget, ...otherChats] : sortProjectChats([...otherChats, updatedTarget])

        return { ...project, chats }
      }),
    )
  }

  const toggleSection = (section: 'pinned' | 'projects' | 'chats') => {
    setOpenSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section],
    }))
  }

  if (activeView === 'settings') {
    return <SettingsSidebar collapsed={collapsed} onBackApp={onCloseSettings} />
  }

  return (
    <aside className={`left-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="主导航">
      <div className="sidebar-inner">
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark">
              <Bot size={17} />
            </div>
            <div className="brand-copy">
              <strong>PandoShare</strong>
            </div>
            <button
              className="collapse-button"
              type="button"
              aria-label={collapsed ? '展开左侧栏' : '折叠左侧栏'}
              onClick={onToggle}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          <nav className="quick-actions">
            {quickActions.map((item, index) => (
              <SidebarButton
                item={item}
                active={activeView === 'plugins' && index === 2}
                onClick={index === 0 ? createContextChat : index === 2 ? onOpenPlugins : undefined}
                key={item.label}
              />
            ))}
            <div className="more-action-wrap">
              <button
                className={`nav-button more-trigger ${moreOpen ? 'active' : ''}`}
                type="button"
                aria-expanded={moreOpen}
                aria-label="更多应用"
                onClick={() => setMoreOpen((value) => !value)}
              >
                <Menu size={16} strokeWidth={1.9} />
                <span>更多</span>
              </button>

              <AnimatePresence>
                {moreOpen ? (
                  <motion.div
                    className="more-app-menu"
                    initial={{ opacity: 0, x: -6, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                  >
                    {moreActions.map((item) => {
                      const Icon = item.icon
                      const isHeartbeat = item.label === "\u5fc3\u8df3"

                      return (
                        <button
                          className={activeView === 'heartbeat' && isHeartbeat ? 'more-app-item active' : 'more-app-item'}
                          type="button"
                          key={item.label}
                          onClick={isHeartbeat ? () => {
                            setMoreOpen(false)
                            onOpenHeartbeat()
                          } : undefined}
                        >
                          <Icon size={17} strokeWidth={1.8} />
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </nav>
        </div>

        <div className="sidebar-scroll">
          <SectionHeader title="置顶" expanded={openSections.pinned} onToggle={() => toggleSection('pinned')} />
          <AnimatePresence initial={false}>
            {openSections.pinned ? (
              <motion.div
                className="list-group collapsible-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                {pinnedItemsState.map((item) => {
                  if (item.kind === 'project') {
                    const pinnedProject = projectItems.find((project) => project.name === item.sourceName)

                    if (!pinnedProject) {
                      return null
                    }

                    return (
                      <ProjectBlock
                        project={pinnedProject}
                        isPinned
                        activeChatId={activeChatId}
                        onOpenChat={onOpenChat}
                        onCreateChat={createProjectChat}
                        onTogglePin={() => toggleGlobalPin('project', pinnedProject.name, pinnedProject.id)}
                        onToggleChatPin={toggleProjectChatPin}
                        key={item.id}
                      />
                    )
                  }

                  return (
                    <SidebarChatRow
                      chat={item.sourceName}
                      pinned
                      active={activeChatId === getSidebarChatId(item.sourceId ?? globalChatIds[item.sourceName] ?? item.sourceName)}
                      onOpenChat={() => onOpenChat(createSidebarActiveChat(item.sourceName, item.sourceId ?? globalChatIds[item.sourceName]))}
                      onTogglePin={() => toggleGlobalPin('chat', item.sourceName, item.sourceId ?? globalChatIds[item.sourceName])}
                      onCreateChat={createSidebarChat}
                      key={item.id}
                    />
                  )
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <SectionHeader
            title="项目"
            showMore
            createLabel="新建项目"
            onCreate={createSidebarProject}
            expanded={openSections.projects}
            onToggle={() => toggleSection('projects')}
          />
          <AnimatePresence initial={false}>
            {openSections.projects ? (
              <motion.div
                className="project-list collapsible-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                {projectItems
                  .filter((project) => !isGlobalPinned('project', project.name, project.id))
                  .map((project) => (
                    <ProjectBlock
                      project={project}
                      isPinned={isGlobalPinned('project', project.name, project.id)}
                      activeChatId={activeChatId}
                      onOpenChat={onOpenChat}
                      onCreateChat={createProjectChat}
                      onTogglePin={() => toggleGlobalPin('project', project.name, project.id)}
                      onToggleChatPin={toggleProjectChatPin}
                      key={project.name}
                    />
                  ))}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <SectionHeader
            title="会话"
            showMore
            createLabel="新建会话"
            createIcon={MessageSquarePlus}
            onCreate={createSidebarChat}
            expanded={openSections.chats}
            onToggle={() => toggleSection('chats')}
          />
          <AnimatePresence initial={false}>
            {openSections.chats ? (
              <motion.div
                className="list-group collapsible-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                {chatItems
                  .filter((chat) => !isGlobalPinned('chat', chat, globalChatIds[chat]))
                  .map((chat) => (
                    <SidebarChatRow
                      chat={chat}
                      pinned={isGlobalPinned('chat', chat, globalChatIds[chat])}
                      active={activeChatId === getSidebarChatId(globalChatIds[chat] ?? chat)}
                      onOpenChat={() => onOpenChat(createSidebarActiveChat(chat, globalChatIds[chat]))}
                      onTogglePin={() => toggleGlobalPin('chat', chat, globalChatIds[chat])}
                      onCreateChat={createSidebarChat}
                      key={chat}
                    />
                  ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="sidebar-footer">
          <button className="footer-split" type="button" aria-label="??" onClick={onOpenSettings}>
            <Settings size={16} />
          </button>
          <button className="footer-split sync-button" type="button" aria-label="手机电脑双向同步">
            <Smartphone size={15} />
            <ChevronsLeftRight size={15} />
            <Laptop size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function PluginsWorkspace() {
  const [activeTab, setActiveTab] = useState(pluginTabs[0])

  return (
    <main className="plugins-workspace" aria-label="Plugins">
      <section className="plugins-workspace-shell">
        <header className="plugins-topbar">
          <nav className="plugins-tabs" aria-label="Plugin sections">
            {pluginTabs.map((tab) => (
              <button
                className={activeTab === tab ? 'plugins-tab active' : 'plugins-tab'}
                type="button"
                onClick={() => setActiveTab(tab)}
                key={tab}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>
        <div className="plugins-coming-soon">
          <PackagePlus size={30} strokeWidth={1.7} />
          <h1>{"\u656c\u8bf7\u671f\u5f85"}</h1>
        </div>
      </section>
    </main>
  )
}

function SettingsWorkspace() {
  return (
    <main className="settings-workspace" aria-label="Settings">
      <section className="settings-workspace-shell">
        <div className="settings-coming-soon">
          <Settings size={28} strokeWidth={1.7} />
          <h1>{"\u656c\u8bf7\u671f\u5f85"}</h1>
        </div>
      </section>
    </main>
  )
}

function SlashCommandMenu({ state }: { state: SlashMenuState }) {
  const showSkills = state.skills.length > 0

  return (
    <motion.div
      className="slash-command-menu"
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.985 }}
      transition={{ duration: 0.18 }}
    >
      <div className="menu-sheen" />
      <div className="slash-command-scroll" role="listbox" aria-label="斜杠菜单">
        {state.commands.map((item) => {
          const Icon = item.icon

          return (
            <button className="slash-command-row" type="button" key={item.label}>
              <span className="slash-command-icon">
                <Icon size={15} />
              </span>
              <span className="slash-command-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
            </button>
          )
        })}

        {showSkills ? <div className="slash-section-title">技能</div> : null}

        {state.skills.map((skill) => (
          <button className="slash-command-row slash-skill-row" type="button" key={skill}>
            <span className="slash-command-icon">
              <PackagePlus size={15} />
            </span>
            <span className="slash-command-copy">
              <strong>{skill}</strong>
              <span>Skill 占位</span>
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

function AttachMenu() {
  return (
    <motion.div
      className="attach-menu"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18 }}
    >
      <div className="menu-sheen" />
      {attachActions.map((item) => {
        const Icon = item.icon

        return (
          <button className="attach-item" type="button" key={item.label}>
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </motion.div>
  )
}

function ApprovalMenu({
  open,
  onModeChange,
}: {
  open: boolean
  onModeChange: (mode: string) => void
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="approval-menu"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.16 }}
        >
          {approvalModes.map((mode) => (
            <button type="button" className="approval-option" key={mode} onClick={() => onModeChange(mode)}>
              {mode}
            </button>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ModelMenu({
  query,
  selectedModel,
  modelGroups,
  onQueryChange,
  onSelectModel,
}: {
  query: string
  selectedModel: string
  modelGroups: ModelGroup[]
  onQueryChange: (query: string) => void
  onSelectModel: (model: string) => void
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredGroups = modelGroups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) =>
        normalizedQuery ? matchesSlashQuery(`${group.provider} ${model}`, normalizedQuery) : true,
      ),
    }))
    .filter((group) => group.models.length > 0)

  return (
    <motion.div
      className="model-menu"
      role="dialog"
      aria-label={"\u9009\u62e9\u6a21\u578b"}
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.985 }}
      transition={{ duration: 0.17 }}
    >
      <div className="menu-sheen" />
      <div className="model-menu-toolbar">
        <label className="model-search">
          <Search size={15} />
          <input
            aria-label={"\u641c\u7d22\u6a21\u578b"}
            placeholder={"\u641c\u7d22\u6a21\u578b"}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button className="model-icon-button" type="button" aria-label={"\u6dfb\u52a0\u6a21\u578b"}>
          <Plus size={16} />
        </button>
        <button className="model-icon-button" type="button" aria-label={"\u6a21\u578b\u8bbe\u7f6e"}>
          <SlidersHorizontal size={16} />
        </button>
      </div>

      <div className="model-menu-scroll" role="listbox" aria-label={"\u6a21\u578b\u5217\u8868"}>
        {filteredGroups.length > 0 ? (
          filteredGroups.map((group) => (
            <div className="model-group" key={group.provider}>
              <div className="model-group-title">{group.provider}</div>
              {group.models.map((model) => {
                const selected = selectedModel === model

                return (
                  <button
                    className={`model-option ${selected ? 'selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    key={model}
                    onClick={() => onSelectModel(model)}
                  >
                    <span>{model}</span>
                    {selected ? <Check size={14} /> : null}
                  </button>
                )
              })}
            </div>
          ))
        ) : (
          <div className="model-empty">{"\u6ca1\u6709\u5339\u914d\u6a21\u578b"}</div>
        )}
      </div>
    </motion.div>
  )
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="assistant-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return

    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight
    if (distanceFromBottom > 260) return

    window.requestAnimationFrame(() => {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' })
    })
  }, [messages])

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.text)
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = message.text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        // Some embedded browser contexts block clipboard access; keep the UI responsive.
      }
    }

    setCopiedMessageId(message.id)
    window.setTimeout(() => {
      setCopiedMessageId((currentMessageId) => (currentMessageId === message.id ? null : currentMessageId))
    }, 1200)
  }

  return (
    <div className="message-stack chat-transcript" aria-label="聊天内容" ref={transcriptRef}>
      <div className="chat-stream">
        {messages.map((message) =>
          message.role === 'user' ? (
            <motion.div
              className="chat-row user-row"
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <div className="user-bubble">{message.text}</div>
            </motion.div>
          ) : (
            <motion.div
              className="chat-row assistant-row"
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
            >
              <div className="assistant-reply">
                <AssistantMarkdown text={message.text} />
                <div className="message-actions" aria-label="消息操作">
                  <button
                    className="message-action-button"
                    type="button"
                    aria-label={copiedMessageId === message.id ? "\u5df2\u590d\u5236\u56de\u590d" : "\u590d\u5236\u56de\u590d"}
                    title={copiedMessageId === message.id ? "\u5df2\u590d\u5236" : "\u590d\u5236"}
                    onClick={() => void copyMessage(message)}
                  >
                    {copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <button className="message-action-button" type="button" aria-label="展开回复">
                    <Maximize2 size={13} />
                  </button>
                  <span className="message-time">{message.time}</span>
                </div>
              </div>
            </motion.div>
          ),
        )}
      </div>
    </div>
  )
}

function Composer({ onSend }: { onSend: (payload: ComposerSendPayload) => void }) {
  const [attachOpen, setAttachOpen] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalMode, setApprovalMode] = useState('请求批准')
  const [modelOpen, setModelOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState(defaultModelLabel)
  const [availableModelGroups, setAvailableModelGroups] = useState<ModelGroup[]>(modelGroups)
  const [message, setMessage] = useState('')
  const slashMenuState = getSlashMenuState(message)
  const canSend = message.trim().length > 0
  const contextUsedK = 30
  const contextTotalK = 100
  const contextUsedPercent = Math.round((contextUsedK / contextTotalK) * 100)
  const contextRemainingPercent = 100 - contextUsedPercent
  const contextMeterTone = contextUsedPercent >= 90 ? 'full' : contextUsedPercent >= 70 ? 'warning' : 'normal'
  const contextMeterStyle = { '--context-progress': `${contextUsedPercent}%` } as CSSProperties
  useEffect(() => {
    let active = true

    void loadModelGroups().then((groups) => {
      if (active && groups && groups.length > 0) {
        setAvailableModelGroups(groups)
      }
    })

    return () => {
      active = false
    }
  }, [])

  const updateMessage = (nextMessage: string) => {
    setMessage(nextMessage)

    if (nextMessage.trimStart().startsWith("/")) {
      setAttachOpen(false)
      setModelOpen(false)
      setApprovalOpen(false)
    }
  }

  const submitMessage = () => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage) {
      return
    }

    onSend({
      message: trimmedMessage,
      approvalMode,
      modelId: selectedModel === defaultModelLabel ? undefined : selectedModel,
    })
    setMessage('')
  }

  return (
    <div className="composer-zone">
      <AnimatePresence>{slashMenuState ? <SlashCommandMenu state={slashMenuState} /> : attachOpen ? <AttachMenu /> : null}</AnimatePresence>

      <div className="composer">
        <textarea
          className="composer-input"
          aria-label="消息输入"
          placeholder="要求后续变更"
          value={message}
          onInput={(event) => updateMessage(event.currentTarget.value)}
          onChange={(event) => updateMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submitMessage()
            }
          }}
        />

        <div className="composer-controls">
          <button
            className={`round-tool ${attachOpen ? 'active' : ''}`}
            type="button"
            aria-label="添加"
            onClick={() => {
              setAttachOpen((value) => {
                const nextOpen = !value

                if (nextOpen) {
                  setApprovalOpen(false)
                  setModelOpen(false)
                }

                return nextOpen
              })
            }}
          >
            <Plus size={18} />
          </button>

          <div className="approval-wrap">
            <button
              className={`approval-trigger ${approvalOpen ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setApprovalOpen((value) => {
                  const nextOpen = !value

                  if (nextOpen) {
                    setAttachOpen(false)
                    setModelOpen(false)
                  }

                  return nextOpen
                })
              }}
            >
              <Gauge size={14} />
              <span>{approvalMode}</span>
              <ChevronDown size={13} />
            </button>
            <ApprovalMenu
              open={approvalOpen}
              onModeChange={(mode) => {
                setApprovalMode(mode)
                setApprovalOpen(false)
              }}
            />
          </div>

          <div className="model-wrap">
            <button
              className={`model-button ${modelOpen ? 'active' : ''}`}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={modelOpen}
              onClick={() => {
                setModelOpen((value) => {
                  const nextOpen = !value

                  if (nextOpen) {
                    setAttachOpen(false)
                    setApprovalOpen(false)
                  }

                  return nextOpen
                })
              }}
            >
              <Cpu size={14} />
              <span>{selectedModel}</span>
              <ChevronDown size={13} />
            </button>
            <AnimatePresence>
              {modelOpen ? (
                <ModelMenu
                  query={modelQuery}
                  selectedModel={selectedModel}
                  modelGroups={availableModelGroups}
                  onQueryChange={setModelQuery}
                  onSelectModel={(model) => {
                    setSelectedModel(model)
                    setModelQuery('')
                    setModelOpen(false)
                  }}
                />
              ) : null}
            </AnimatePresence>
          </div>

          <div
            className={`context-meter ${contextMeterTone}`}
            style={contextMeterStyle}
            tabIndex={0}
            aria-label={`\u4e0a\u4e0b\u6587\u72b6\u6001\uff0c\u5df2\u7528${contextUsedPercent}%`}
          >
            <span className="context-meter-ring" aria-hidden="true">
              <span className="context-meter-core" />
            </span>
            <span className="context-tooltip">{`\u5269\u4f59${contextRemainingPercent}%\uff0c\u5df2\u7528${contextUsedK}K\u4e0a\u4e0b\u6587\uff0c\u5171${contextTotalK}K`}</span>
          </div>

          <button className="mic-button" type="button" aria-label="语音输入">
            <Mic size={16} />
          </button>

          <button className="send-button" type="button" aria-label="发送" disabled={!canSend} onClick={submitMessage}>
            <SendHorizontal size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}

function MainChat({ activeChat }: { activeChat: ActiveChat }) {
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({})
  const [conversationIdsByChat, setConversationIdsByChat] = useState<Record<string, string>>({})
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const smoothWritersRef = useRef<Map<number, SmoothWriterState>>(new Map())
  const activeConversationId = conversationIdsByChat[activeChat.id] ?? activeChat.conversationId
  const messages = messagesByChat[activeChat.id] ?? initialMessages

  useEffect(() => {
    let active = true

    if (activeConversationId) {
      void loadConversationMessages(activeConversationId).then((loadedMessages) => {
        if (active && loadedMessages && loadedMessages.length > 0) {
          setMessagesByChat((currentMessagesByChat) => ({
            ...currentMessagesByChat,
            [activeChat.id]: loadedMessages,
          }))
        }
      })
    }

    return () => {
      active = false
    }
  }, [activeChat.id, activeConversationId])
  useEffect(() => {
    return () => {
      for (const writer of smoothWritersRef.current.values()) {
        if (writer.timer !== null) {
          window.clearTimeout(writer.timer)
        }
      }
      smoothWritersRef.current.clear()
    }
  }, [])

  const updateAssistantMessage = (assistantId: number, nextText: string, append = false) => {
    setMessagesByChat((currentMessagesByChat) => ({
      ...currentMessagesByChat,
      [activeChat.id]: (currentMessagesByChat[activeChat.id] ?? initialMessages).map((message) =>
        message.id === assistantId
          ? { ...message, text: append ? (message.text === '...' ? '' : message.text) + nextText : nextText }
          : message,
      ),
    }))
  }

  function scheduleSmoothWriter(assistantId: number, delayMs = 0) {
    const writer = smoothWritersRef.current.get(assistantId)
    if (!writer || writer.timer !== null) return

    writer.timer = window.setTimeout(() => drainSmoothWriter(assistantId), delayMs)
  }

  function drainSmoothWriter(assistantId: number) {
    const writer = smoothWritersRef.current.get(assistantId)
    if (!writer) return

    writer.timer = null
    if (!writer.queue) {
      if (writer.completed) smoothWritersRef.current.delete(assistantId)
      return
    }

    const nextChunk = takeSmoothStreamChunk(writer.queue, writer.completed)
    writer.queue = nextChunk.rest
    updateAssistantMessage(assistantId, nextChunk.chunk, true)

    if (writer.queue) {
      scheduleSmoothWriter(assistantId, nextChunk.delayMs)
      return
    }

    if (writer.completed) {
      smoothWritersRef.current.delete(assistantId)
    }
  }

  const enqueueSmoothAssistantText = (assistantId: number, delta: string) => {
    const writer = smoothWritersRef.current.get(assistantId) ?? { queue: '', timer: null, completed: false }
    writer.queue += delta
    smoothWritersRef.current.set(assistantId, writer)
    scheduleSmoothWriter(assistantId)
  }

  const completeSmoothAssistantText = (assistantId: number) => {
    const writer = smoothWritersRef.current.get(assistantId)
    if (!writer) return

    writer.completed = true
    if (writer.timer !== null) {
      window.clearTimeout(writer.timer)
      writer.timer = null
    }
    scheduleSmoothWriter(assistantId)
  }

  const ensureConversationId = async () => {
    if (activeConversationId) {
      return activeConversationId
    }

    const createdConversation = await createConversation({ title: activeChat.title, scope: { type: 'global' } })

    if (!createdConversation?.id) {
      return undefined
    }

    setConversationIdsByChat((currentIds) => ({ ...currentIds, [activeChat.id]: createdConversation.id as string }))

    return createdConversation.id
  }

  const handleSend = (payload: ComposerSendPayload) => {
    const time = formatMessageTime()
    const userId = Date.now()
    const assistantId = userId + 1

    setMessagesByChat((currentMessagesByChat) => {
      const currentMessages = currentMessagesByChat[activeChat.id] ?? initialMessages

      return {
        ...currentMessagesByChat,
        [activeChat.id]: [
          ...currentMessages,
          { id: userId, role: 'user', text: payload.message, time },
          { id: assistantId, role: 'assistant', text: '...', time },
        ],
      }
    })

    void (async () => {
      try {
        const conversationId = await ensureConversationId()

        if (!conversationId) {
          updateAssistantMessage(assistantId, backendUnavailableReply)
          return
        }

        const result = await sendConversationMessage({
          conversationId,
          text: payload.message,
          approvalMode: payload.approvalMode,
          modelId: payload.modelId,
        })

        if (!result) {
          updateAssistantMessage(assistantId, backendUnavailableReply)
          return
        }

        const immediateText = result.assistantMessage?.text ?? result.finalText

        if (immediateText) {
          updateAssistantMessage(assistantId, immediateText)
        }

        if (!result.runId) {
          if (!immediateText) {
            updateAssistantMessage(assistantId, backendUnavailableReply)
          }
          return
        }

        let sawDelta = false

        streamRun(result.threadId ?? conversationId, result.runId, {
          onDelta: (delta) => {
            sawDelta = true
            enqueueSmoothAssistantText(assistantId, delta)
          },
          onDone: () => {
            completeSmoothAssistantText(assistantId)
          },
          onError: () => {
            completeSmoothAssistantText(assistantId)
            if (!sawDelta && !immediateText) {
              updateAssistantMessage(assistantId, backendUnavailableReply)
            }
          },
        })
      } catch {
        updateAssistantMessage(assistantId, backendUnavailableReply)
      }
    })()
  }

  return (
    <main className="main-chat">
      <header className="chat-header">
        <div className="conversation-tab">
          <MessagesSquare size={16} />
          <span>{activeChat.title}</span>
        </div>
        <div className="chat-more-wrap">
          <button
            className={`icon-ghost chat-more-button ${chatMenuOpen ? 'active' : ''}`}
            type="button"
            aria-label={`${activeChat.title}\u66f4\u591a`}
            aria-haspopup="menu"
            aria-expanded={chatMenuOpen}
            onClick={() => setChatMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={17} />
          </button>

          <AnimatePresence>
            {chatMenuOpen ? (
              <motion.div
                className="chat-action-menu"
                role="menu"
                initial={{ opacity: 1, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 1, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                <button className="chat-menu-item" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><Pin size={14} />{"\u7f6e\u9876\u5bf9\u8bdd"}</span>
                  <kbd>Ctrl+Alt+P</kbd>
                </button>
                <button className="chat-menu-item" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><Edit3 size={14} />{"\u91cd\u547d\u540d\u5bf9\u8bdd"}</span>
                  <kbd>Ctrl+Alt+R</kbd>
                </button>
                <button className="chat-menu-item" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><Archive size={14} />{"\u5f52\u6863\u5bf9\u8bdd"}</span>
                  <kbd>Ctrl+Shift+A</kbd>
                </button>
                <div className="chat-menu-divider" />
                <button className="chat-menu-item" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><MessageSquarePlus size={14} />{"\u6253\u5f00\u4fa7\u8fb9\u804a\u5929"}</span>
                  <kbd>Ctrl+Alt+S</kbd>
                </button>
                <button className="chat-menu-item has-submenu" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><Copy size={14} />{"\u590d\u5236"}</span>
                  <ChevronRight size={14} />
                </button>
                <button className="chat-menu-item has-submenu" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><GitBranch size={14} />{"\u5206\u652f"}</span>
                  <ChevronRight size={14} />
                </button>
                <button className="chat-menu-item" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><Clock size={14} />{"\u6dfb\u52a0\u81ea\u52a8\u5316..."}</span>
                </button>
                <div className="chat-menu-divider" />
                <button className="chat-menu-item" type="button" role="menuitem" onClick={() => setChatMenuOpen(false)}>
                  <span><ExternalLink size={14} />{"\u5728\u65b0\u7a97\u53e3\u4e2d\u6253\u5f00"}</span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <section className="chat-canvas" aria-label={`${activeChat.title}\u5185\u5bb9`}>
        <ChatTranscript messages={messages} />

        <Composer onSend={handleSend} />
      </section>
    </main>
  )
}

function ResizeHandle({
  disabled,
  label,
  onPointerDown,
}: {
  disabled?: boolean
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className={`pane-resizer ${disabled ? 'disabled' : ''}`}
      aria-label={label}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={disabled ? undefined : onPointerDown}
    >
      <span className="resize-line" />
    </div>
  )
}

function RightTools({
  collapsed,
  expanded,
  onToggle,
  onExpandToggle,
}: {
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
  onExpandToggle: () => void
}) {
  return (
    <aside
      className={`right-pane ${collapsed ? 'collapsed' : ''} ${expanded ? 'expanded' : ''}`}
      aria-label="右侧区域"
    >
      {collapsed ? (
        <button className="right-collapse-button right-collapse-button-collapsed" type="button" aria-label="展开右侧栏" onClick={onToggle}>
          <ChevronLeft size={16} />
        </button>
      ) : (
        <>
          <header className="right-header">
            <div className="right-tab">
              <PanelRight size={16} />
              <span>工具</span>
            </div>
            <div className="right-header-actions">
              <button
                className={`expand-panel-button ${expanded ? 'active' : ''}`}
                type="button"
                aria-label={expanded ? '收起面板' : '展开面板'}
                aria-pressed={expanded}
                title={expanded ? '收起面板' : '展开面板'}
                onClick={onExpandToggle}
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button className="right-collapse-button" type="button" aria-label="折叠右侧栏" onClick={onToggle}>
                <ChevronRight size={16} />
              </button>
            </div>
          </header>
          <section className="right-canvas">
            <div className="tool-stack">
              {rightTools.map((tool) => {
                const Icon = tool.icon

                return (
                  <button className="tool-button" type="button" key={tool.label}>
                    <Icon size={17} />
                    <span>{tool.label}</span>
                    <Code2 size={13} className="tool-hint" />
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}
    </aside>
  )
}


const heartbeatTasks = [
  {
    name: "\u6bcf\u65e5\u5929\u6c14\u9884\u62a5",
    schedule: "\u6bcf\u5929 07:30",
    summary: "\u83b7\u53d6\u5929\u6c14\u9884\u62a5\u5e76\u6574\u7406\u6458\u8981",
    target: "\u98de\u4e66\u7fa4\uff1a\u5929\u6c14\u64ad\u62a5\u7fa4",
    icon: Bell,
  },
  {
    name: "\u9879\u76ee\u65e5\u62a5",
    schedule: "\u6bcf\u5929 09:00",
    summary: "\u6c47\u603b\u9879\u76ee\u8fdb\u5c55\u5e76\u63d0\u9192\u98ce\u9669",
    target: "PandoShare Agent",
    icon: Calendar,
  },
  {
    name: "Loop \u68c0\u67e5",
    schedule: "\u6bcf\u5c0f\u65f6 00 \u5206",
    summary: "\u68c0\u67e5 Loop \u5b88\u62a4\u4efb\u52a1\u548c\u56de\u653e\u72b6\u6001",
    target: "Agent Runtime",
    icon: Activity,
  },
  {
    name: "Gateway \u961f\u5217\u68c0\u67e5",
    schedule: "\u6bcf 15 \u5206\u949f",
    summary: "\u626b\u63cf\u4efb\u52a1\u961f\u5217\u5361\u6b7b\u548c\u5931\u8d25\u91cd\u8bd5",
    target: "Gateway Queue",
    icon: ShieldCheck,
  },
]

const heartbeatHistory = [
  { time: '2026-06-22 11:30:12', status: "\u6210\u529f", duration: '18.6s', summary: "\u5df2\u83b7\u53d6 3 \u4e2a\u57ce\u5e02\u5929\u6c14\uff0c\u5df2\u53d1\u9001\u5230\u98de\u4e66\u7fa4" },
  { time: '2026-06-22 07:30:11', status: "\u6210\u529f", duration: '16.2s', summary: "\u5df2\u83b7\u53d6 3 \u4e2a\u57ce\u5e02\u5929\u6c14\uff0c\u5df2\u53d1\u9001\u5230\u98de\u4e66\u7fa4" },
  { time: '2026-06-21 07:30:10', status: "\u6210\u529f", duration: '17.4s', summary: "\u5df2\u83b7\u53d6 3 \u4e2a\u57ce\u5e02\u5929\u6c14\uff0c\u5df2\u53d1\u9001\u5230\u98de\u4e66\u7fa4" },
  { time: '2026-06-20 07:30:09', status: "\u5931\u8d25", duration: '--', summary: "\u83b7\u53d6\u5929\u6c14\u6570\u636e\u8d85\u65f6" },
]

const heartbeatExceptions = [
  { name: "\u9879\u76ee\u65e5\u62a5", type: "\u6267\u884c\u5931\u8d25", time: '2026-06-22 09:00:15', status: "\u5931\u8d25" },
  { name: "Gateway \u961f\u5217\u68c0\u67e5", type: "\u4efb\u52a1\u5361\u4f4f", time: '2026-06-22 10:10:03', status: "\u5361\u4f4f" },
]

type HeartbeatSection = 'create' | 'tasks' | 'history' | 'exceptions'

const heartbeatSections: Array<{ id: HeartbeatSection; label: string; icon: IconType }> = [
  { id: 'create', label: "\u65b0\u5efa\u5b9a\u65f6\u4efb\u52a1", icon: Plus },
  { id: 'tasks', label: "\u5b9a\u65f6\u4efb\u52a1\u5217\u8868", icon: Calendar },
  { id: 'history', label: "\u8fd0\u884c\u5386\u53f2", icon: History },
  { id: 'exceptions', label: "\u5f02\u5e38\u4e0e\u6062\u590d", icon: AlertTriangle },
]


type HeartbeatTask = {
  id?: string
  name: string
  schedule: string
  summary: string
  target: string
  status?: string
  lastRunAt?: string
  nextRunAt?: string
  icon: IconType
}

type HeartbeatHistoryRow = {
  id?: string
  jobId?: string
  runId?: string
  time: string
  status: string
  duration: string
  summary: string
}

type HeartbeatExceptionRow = {
  id?: string
  jobId?: string
  runId?: string
  name: string
  type: string
  time: string
  status: string
}

const heartbeatIconSet = [Bell, Calendar, Activity, ShieldCheck]

const withHeartbeatIcon = (task: Omit<HeartbeatTask, 'icon'>, index: number): HeartbeatTask => ({
  ...task,
  icon: heartbeatIconSet[index % heartbeatIconSet.length] ?? Bell,
})

const heartbeatStatusLabel = (status?: string) => {
  if (status === 'paused') return '\u5df2\u6682\u505c'
  if (status === 'failed') return '\u5931\u8d25'
  if (status === 'running') return '\u8fd0\u884c\u4e2d'
  return '\u542f\u7528\u4e2d'
}

function HeartbeatTaskListContent({
  tasks,
  onRunTask,
  onPauseTask,
  onDeleteTask,
}: {
  tasks: HeartbeatTask[]
  onRunTask: (task: HeartbeatTask) => void
  onPauseTask: (task: HeartbeatTask) => void
  onDeleteTask: (task: HeartbeatTask) => void
}) {
  const selectedTask = tasks[0] ?? heartbeatTasks[0]
  const SelectedIcon = selectedTask.icon

  return (
    <div className="heartbeat-task-list-view">
      <section className="heartbeat-panel heartbeat-task-panel">
        <div className="heartbeat-panel-heading">
          <h2>{"\u5b9a\u65f6\u4efb\u52a1\u5217\u8868"}</h2>
          <div className="heartbeat-search"><Search size={14} /><input aria-label="Search tasks" placeholder={"\u641c\u7d22\u4efb\u52a1\u540d\u79f0"} /></div>
          <button className="heartbeat-icon-button" type="button" aria-label="Filter tasks"><Filter size={15} /></button>
        </div>

        <div className="heartbeat-task-list">
          {tasks.map((task, index) => {
            const TaskIcon = task.icon

            return (
              <button className={index === 0 ? 'heartbeat-task-card active' : 'heartbeat-task-card'} type="button" key={task.id ?? task.name}>
                <div className="heartbeat-task-main">
                  <TaskIcon size={17} />
                  <div><strong>{task.name}</strong><span><Clock size={13} />{task.schedule}</span></div>
                </div>
                <span className="heartbeat-status-pill"><i />{heartbeatStatusLabel(task.status)}</span>
                <MoreHorizontal size={15} className="heartbeat-card-more" />
              </button>
            )
          })}
        </div>

        <div className="heartbeat-panel-footer">
          <span>{`\u5171 ${tasks.length} \u9879`}</span>
          <div><button type="button"><ChevronLeft size={13} /></button><strong>1</strong><button type="button"><ChevronRight size={13} /></button></div>
        </div>
      </section>

      <section className="heartbeat-panel heartbeat-detail-panel">
        <div className="heartbeat-detail-header">
          <div className="heartbeat-detail-title">
            <span className="heartbeat-large-icon"><SelectedIcon size={24} /></span>
            <div>
              <span className="heartbeat-detail-kicker">{"\u4efb\u52a1\u8be6\u60c5"}</span>
              <h2>{selectedTask.name}</h2>
              <span className="heartbeat-status-pill"><i />{heartbeatStatusLabel(selectedTask.status)}</span>
            </div>
          </div>
        </div>

        <div className="heartbeat-detail-grid">
          <div><span>{"\u6267\u884c\u89c4\u5219"}</span><strong>{selectedTask.schedule}</strong></div>
          <div><span>{"\u72b6\u6001"}</span><strong className="success-text">{heartbeatStatusLabel(selectedTask.status)}</strong></div>
          <div><span>{"\u52a8\u4f5c"}</span><strong>{selectedTask.summary}</strong></div>
          <div><span>{"\u4e0a\u6b21\u8fd0\u884c"}</span><strong>{selectedTask.lastRunAt ?? '2026-06-22 07:30:12'}</strong></div>
          <div><span>{"\u53d1\u9001\u5230"}</span><strong>{selectedTask.target}</strong></div>
          <div><span>{"\u4e0b\u6b21\u8fd0\u884c"}</span><strong>{selectedTask.nextRunAt ?? '2026-06-23 07:30:00'}</strong></div>
        </div>

        <div className="heartbeat-detail-actions">
          <button className="heartbeat-action primary" type="button" onClick={() => onRunTask(selectedTask)}><Play size={14} />{"\u7acb\u5373\u8fd0\u884c"}</button>
          <button className="heartbeat-action" type="button" onClick={() => onPauseTask(selectedTask)}><Pause size={14} />{"\u6682\u505c\u4efb\u52a1"}</button>
          <button className="heartbeat-action" type="button"><Edit3 size={14} />{"\u7f16\u8f91"}</button>
          <button className="heartbeat-action danger" type="button" onClick={() => onDeleteTask(selectedTask)}><Trash2 size={14} />{"\u5220\u9664"}</button>
          <button className="heartbeat-action" type="button"><History size={14} />{"\u67e5\u770b\u5386\u53f2"}</button>
          <button className="heartbeat-action" type="button"><Play size={14} />{"\u67e5\u770b Replay"}</button>
        </div>
      </section>
    </div>
  )
}
function HeartbeatCreateTaskContent({
  onCreateTask,
}: {
  onCreateTask: (input: HeartbeatTaskInput, runNow: boolean) => void
}) {
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [content, setContent] = useState('')
  const [actionType, setActionType] = useState('system_event')
  const [target, setTarget] = useState('PandoShare Agent')
  const [retryCount, setRetryCount] = useState(3)
  const [retryIntervalMinutes, setRetryIntervalMinutes] = useState(5)

  const resetForm = () => {
    setName('')
    setSchedule('')
    setContent('')
    setActionType('system_event')
    setTarget('PandoShare Agent')
    setRetryCount(3)
    setRetryIntervalMinutes(5)
  }

  const submitTask = (runNow: boolean) => {
    onCreateTask({
      name: name.trim() || '\u672a\u547d\u540d\u4efb\u52a1',
      schedule: schedule.trim() || '0 9 * * *',
      content: content.trim() || name.trim() || '\u5b9a\u65f6\u4efb\u52a1',
      actionType,
      target: target.trim() || 'PandoShare Agent',
      retryCount,
      retryIntervalMinutes,
    }, runNow)
    resetForm()
  }

  return (
    <section className="heartbeat-panel heartbeat-form-panel heartbeat-form-page">
      <h2>{"\u65b0\u5efa\u5b9a\u65f6\u4efb\u52a1"}</h2>
      <div className="heartbeat-form-grid">
        <label><span>{"\u4efb\u52a1\u540d\u79f0"}</span><input placeholder={"\u8bf7\u8f93\u5165\u4efb\u52a1\u540d\u79f0"} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>{"\u6267\u884c\u65b9\u5f0f"}</span><select defaultValue="time"><option value="time">{"\u6309\u65f6\u95f4\u6267\u884c"}</option></select></label>
        <label><span>{"\u6267\u884c\u65f6\u95f4"}</span><input placeholder={"0 9 * * *"} value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label>
        <label><span>{"\u4efb\u52a1\u5185\u5bb9"}</span><textarea placeholder={"\u8bf7\u8f93\u5165\u4efb\u52a1\u5185\u5bb9"} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <label><span>{"\u52a8\u4f5c\u7c7b\u578b"}</span><select value={actionType} onChange={(event) => setActionType(event.target.value)}><option value="system_event">system_event</option><option value="gateway_message">gateway_message</option><option value="remote_trigger">remote_trigger</option><option value="loop_wake">loop_wake</option></select></label>
        <label><span>{"\u53d1\u9001\u76ee\u6807"}</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="PandoShare Agent">PandoShare Agent</option><option value="Gateway Queue">Gateway Queue</option><option value="Agent Runtime">Agent Runtime</option></select></label>
      </div>
      <div className="heartbeat-retry-row"><span>{"\u5931\u8d25\u91cd\u8bd5"}</span><input type="number" value={retryCount} onChange={(event) => setRetryCount(Number(event.target.value) || 0)} /><span>{"\u6b21\uff0c\u95f4\u9694"}</span><input type="number" value={retryIntervalMinutes} onChange={(event) => setRetryIntervalMinutes(Number(event.target.value) || 0)} /><span>{"\u5206\u949f"}</span></div>
      <div className="heartbeat-form-actions">
        <button className="heartbeat-action" type="button" onClick={resetForm}>{"\u53d6\u6d88"}</button>
        <button className="heartbeat-action" type="button" onClick={() => submitTask(false)}><Save size={14} />{"\u4fdd\u5b58\u4efb\u52a1"}</button>
        <button className="heartbeat-action strong" type="button" onClick={() => submitTask(true)}><Play size={14} />{"\u4fdd\u5b58\u5e76\u7acb\u5373\u8fd0\u884c"}</button>
      </div>
    </section>
  )
}
function HeartbeatHistoryContent({ rows, onRerun }: { rows: HeartbeatHistoryRow[]; onRerun: (row: HeartbeatHistoryRow) => void }) {
  return (
    <section className="heartbeat-panel heartbeat-history-page">
      <div className="heartbeat-table-title"><h2>{"\u8fd0\u884c\u5386\u53f2"}</h2></div>
      <table className="heartbeat-table">
        <thead><tr><th>{"\u8fd0\u884c\u65f6\u95f4"}</th><th>{"\u72b6\u6001"}</th><th>{"\u6267\u884c\u65f6\u957f"}</th><th>{"\u7ed3\u679c\u6458\u8981"}</th><th>{"\u64cd\u4f5c"}</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={(row.id ?? row.time) + '-' + row.status}>
              <td>{row.time}</td>
              <td><span className={row.status === '\u6210\u529f' || row.status === 'success' || row.status === 'completed' ? 'heartbeat-result success' : 'heartbeat-result failed'}>{row.status}</span></td>
              <td>{row.duration}</td>
              <td>{row.summary}</td>
              <td>
                <div className="heartbeat-history-actions">
                  <button type="button">{"\u67e5\u770b\u65e5\u5fd7"}</button>
                  <button type="button">Replay</button>
                  <button type="button" onClick={() => onRerun(row)}>{"\u91cd\u65b0\u8fd0\u884c"}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
function HeartbeatExceptionsContent({ items, onRetry }: { items: HeartbeatExceptionRow[]; onRetry: (item: HeartbeatExceptionRow) => void }) {
  return (
    <section className="heartbeat-panel heartbeat-exception-panel heartbeat-exception-page">
      <div className="heartbeat-table-title"><h2>{"\u5f02\u5e38\u4e0e\u6062\u590d"}</h2><span>{items.length}</span></div>
      <div className="heartbeat-exception-list">
        {items.map((item) => (
          <article className="heartbeat-exception-card" key={item.id ?? item.name}>
            <div><AlertTriangle size={15} /><strong>{item.name}</strong><span>{item.time}</span></div>
            <div><span className="heartbeat-result failed">{item.type}</span><span className="heartbeat-result stuck">{item.status}</span></div>
            <div className="heartbeat-exception-actions"><button type="button" onClick={() => onRetry(item)}><RotateCcw size={13} />{"\u91cd\u8bd5"}</button><button type="button">{"\u8df3\u8fc7\u672c\u6b21"}</button><button type="button">{"\u6807\u8bb0\u5df2\u5904\u7406"}</button><button type="button">Replay</button></div>
          </article>
        ))}
      </div>
    </section>
  )
}
function HeartbeatWorkspace() {
  const [section, setSection] = useState<HeartbeatSection>('tasks')
  const [heartbeatRunning, setHeartbeatRunning] = useState(true)
  const [tasks, setTasks] = useState<HeartbeatTask[]>(heartbeatTasks)
  const [historyRows, setHistoryRows] = useState<HeartbeatHistoryRow[]>(heartbeatHistory)
  const [exceptionRows, setExceptionRows] = useState<HeartbeatExceptionRow[]>(heartbeatExceptions)
  const activeSection = heartbeatSections.find((item) => item.id === section) ?? heartbeatSections[1]

  const refreshHeartbeat = async () => {
    const snapshot = await loadHeartbeatSnapshot()

    if (!snapshot) {
      return
    }

    if (typeof snapshot.running === 'boolean') {
      setHeartbeatRunning(snapshot.running)
    }

    if (snapshot.tasks && snapshot.tasks.length > 0) {
      setTasks(snapshot.tasks.map((task, index) => withHeartbeatIcon(task, index)))
    }

    if (snapshot.history && snapshot.history.length > 0) {
      setHistoryRows(snapshot.history)
    }

    if (snapshot.exceptions && snapshot.exceptions.length > 0) {
      setExceptionRows(snapshot.exceptions)
    }
  }

  useEffect(() => {
    void refreshHeartbeat()
  }, [])

  const toggleHeartbeatRunning = () => {
    const nextRunning = !heartbeatRunning

    setHeartbeatRunning(nextRunning)
    void setHeartbeatRunningBackend(nextRunning).then((updated) => {
      if (updated) {
        void refreshHeartbeat()
      }
    })
  }

  const handleRunTask = (task: HeartbeatTask) => {
    if (!task.id) {
      return
    }

    void runScheduledTask(task.id).then(() => refreshHeartbeat())
  }

  const handlePauseTask = (task: HeartbeatTask) => {
    if (!task.id) {
      return
    }

    void pauseScheduledTask(task.id, task.status !== 'paused').then(() => refreshHeartbeat())
  }

  const handleDeleteTask = (task: HeartbeatTask) => {
    if (!task.id) {
      return
    }

    void deleteScheduledTask(task.id).then((deleted) => {
      if (deleted) {
        setTasks((currentTasks) => currentTasks.filter((currentTask) => currentTask.id !== task.id))
      }
      void refreshHeartbeat()
    })
  }

  const handleCreateTask = (input: HeartbeatTaskInput, runNow: boolean) => {
    void createScheduledTask(input, runNow).then((createdTask) => {
      if (createdTask) {
        setTasks((currentTasks) => [withHeartbeatIcon(createdTask, currentTasks.length), ...currentTasks])
        setSection('tasks')
      }
      void refreshHeartbeat()
    })
  }

  const handleRerunHistory = (row: HeartbeatHistoryRow) => {
    if (row.jobId) {
      void runScheduledTask(row.jobId).then(() => refreshHeartbeat())
    }
  }

  const handleRetryException = (item: HeartbeatExceptionRow) => {
    if (item.jobId) {
      void runScheduledTask(item.jobId).then(() => refreshHeartbeat())
    }
  }

  return (
    <main className="heartbeat-workspace" aria-label="Heartbeat task center">
      <section className="heartbeat-shell heartbeat-settings-shell">
        <aside className="heartbeat-app-nav" aria-label="Heartbeat sections">
          <div className="heartbeat-app-nav-head">
            <div className="heartbeat-title-block">
              <div className="heartbeat-mark"><HeartPulse size={18} /></div>
              <div>
                <h1>{"\u5fc3\u8df3\u4efb\u52a1\u4e2d\u5fc3"}</h1>
                <span className={heartbeatRunning ? 'heartbeat-live' : 'heartbeat-live paused'}><i />{heartbeatRunning ? "\u5fc3\u8df3\u8fd0\u884c\u4e2d" : "\u5fc3\u8df3\u5df2\u6682\u505c"}</span>
              </div>
            </div>
            <div className="heartbeat-search heartbeat-nav-search"><Search size={14} /><input aria-label="Search heartbeat settings" placeholder={"\u641c\u7d22\u5fc3\u8df3..."} /></div>
          </div>

          <nav className="heartbeat-section-nav">
            {heartbeatSections.map((item) => {
              const Icon = item.icon

              return (
                <button className={section === item.id ? 'heartbeat-section-button active' : 'heartbeat-section-button'} type="button" onClick={() => setSection(item.id)} key={item.id}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="heartbeat-section-content">
          <header className="heartbeat-topbar heartbeat-section-topbar">
            <div className="heartbeat-content-title">
              <h2>{activeSection.label}</h2>
            </div>
            <div className="heartbeat-actions">
              <button
                className="heartbeat-action primary"
                type="button"
                aria-pressed={!heartbeatRunning}
                onClick={toggleHeartbeatRunning}
              >
                {heartbeatRunning ? <Pause size={14} /> : <Play size={14} />}
                {heartbeatRunning ? "\u6682\u505c\u5fc3\u8df3" : "\u7acb\u5373\u5524\u9192"}
              </button>
              <button className="heartbeat-action" type="button" onClick={() => void refreshHeartbeat()}><RefreshCw size={14} />{"\u5237\u65b0"}</button>
            </div>
          </header>

          <div className="heartbeat-section-body">
            {section === 'create' ? <HeartbeatCreateTaskContent onCreateTask={handleCreateTask} /> : null}
            {section === 'tasks' ? <HeartbeatTaskListContent tasks={tasks} onRunTask={handleRunTask} onPauseTask={handlePauseTask} onDeleteTask={handleDeleteTask} /> : null}
            {section === 'history' ? <HeartbeatHistoryContent rows={historyRows} onRerun={handleRerunHistory} /> : null}
            {section === 'exceptions' ? <HeartbeatExceptionsContent items={exceptionRows} onRetry={handleRetryException} /> : null}
          </div>
        </section>
      </section>
    </main>
  )
}
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [rightExpanded, setRightExpanded] = useState(false)
  const [leftWidth, setLeftWidth] = useState(292)
  const [rightWidth, setRightWidth] = useState(292)
  const [rightWidthBeforeExpand, setRightWidthBeforeExpand] = useState(292)
  const [activeChat, setActiveChat] = useState<ActiveChat>(() => createSidebarActiveChat('\u4f1a\u8bdd A'))
  const [activeView, setActiveView] = useState<WorkspaceView>('chat')

  const getMaxRightWidth = () => {
    const leftPaneWidth = leftCollapsed ? 74 : leftWidth

    return Math.max(240, window.innerWidth - leftPaneWidth)
  }

  const startLeftResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX
    const startWidth = leftWidth
    const rightPaneWidth = rightCollapsed ? 56 : rightWidth
    const maxLeftWidth = Math.max(220, Math.min(420, window.innerWidth - rightPaneWidth - 576))

    document.body.classList.add('is-resizing')

    const handleMove = (moveEvent: PointerEvent) => {
      setLeftWidth(clamp(startWidth + moveEvent.clientX - startX, 220, maxLeftWidth))
    }

    const handleUp = () => {
      document.body.classList.remove('is-resizing')
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
  }

  const startRightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX
    const startWidth = rightWidth
    const maxRightWidth = getMaxRightWidth()

    document.body.classList.add('is-resizing')
    setRightExpanded(false)

    const handleMove = (moveEvent: PointerEvent) => {
      setRightWidth(clamp(startWidth - (moveEvent.clientX - startX), 240, maxRightWidth))
    }

    const handleUp = () => {
      document.body.classList.remove('is-resizing')
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
  }

  const shellStyle = {
    '--left-width': leftCollapsed ? '74px' : `${leftWidth}px`,
    '--right-width': rightCollapsed ? '56px' : `${rightWidth}px`,
  } as CSSProperties

  const openChat = (chat: ActiveChat) => {
    setActiveChat(chat)
    setActiveView('chat')
  }

  const toggleRightCollapsed = () => {
    if (!rightCollapsed) {
      if (rightExpanded) {
        setRightWidth(rightWidthBeforeExpand)
      }

      setRightExpanded(false)
    }

    setRightCollapsed((value) => !value)
  }

  const toggleRightExpanded = () => {
    if (rightExpanded) {
      setRightWidth(rightWidthBeforeExpand)
      setRightExpanded(false)
      return
    }

    setRightWidthBeforeExpand(rightWidth)
    setRightCollapsed(false)
    setRightWidth(getMaxRightWidth())
    setRightExpanded(true)
  }

  return (
    <div className={`app-shell ${rightExpanded && activeView === 'chat' ? 'right-expanded' : ''} ${activeView === 'heartbeat' ? 'heartbeat-active' : ''} ${activeView === 'settings' ? 'settings-active' : ''} ${activeView === 'plugins' ? 'plugins-active' : ''}`} style={shellStyle}>
      <LeftSidebar
        collapsed={leftCollapsed}
        activeChatId={activeChat.id}
        activeView={activeView}
        onOpenChat={openChat}
        onOpenHeartbeat={() => setActiveView('heartbeat')}
        onOpenSettings={() => setActiveView('settings')}
        onCloseSettings={() => setActiveView('chat')}
        onOpenPlugins={() => setActiveView('plugins')}
        onToggle={() => setLeftCollapsed((value) => !value)}
      />
      <ResizeHandle disabled={leftCollapsed} label="Adjust left sidebar width" onPointerDown={startLeftResize} />
      {activeView === 'settings' ? (
        <SettingsWorkspace />
      ) : activeView === 'plugins' ? (
        <PluginsWorkspace />
      ) : activeView === 'heartbeat' ? (
        <HeartbeatWorkspace />
      ) : (
        <>
          <MainChat activeChat={activeChat} />
          <ResizeHandle disabled={rightCollapsed} label="Adjust right sidebar width" onPointerDown={startRightResize} />
          <RightTools
            collapsed={rightCollapsed}
            expanded={rightExpanded}
            onToggle={toggleRightCollapsed}
            onExpandToggle={toggleRightExpanded}
          />
        </>
      )}
    </div>
  )
}

export default App
