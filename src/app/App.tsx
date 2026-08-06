import React, { useState, useEffect, useRef } from "react";
import {
  ClipboardCheck,
  LogOut,
  MoreHorizontal,
  Download,
  Plus,
  SlidersHorizontal,
  UserRound,
  X,
  ChevronRight,
  RefreshCw,
  Trash2,
  History,
  Check,
  Clock,
  RotateCcw,
  Bot,
  Sparkles,
  ThumbsUp,
  MessageSquareText,
  AlertCircle,
  Pencil,
  ShieldCheck,
} from "lucide-react";

type Role = "agent" | "inspector" | "manager" | "admin";
type AgentGroup = "一线客服" | "VIP一线客服" | "高潜客服" | "VIP客服";
const AGENT_GROUPS: AgentGroup[] = ["一线客服", "VIP一线客服", "高潜客服", "VIP客服"];
type Account = { name: string; password: string; role: Role; group?: AgentGroup };
type View = "quality" | "rules" | "records" | "members";
const roleLabel = (r: Role) => r === "admin" ? "超级管理者" : r === "manager" ? "业务管理者" : r === "inspector" ? "质检人员" : "客服人员";
const canEditRules = (r: Role) => r === "manager" || r === "admin";
type ChatMsg = { from: "user" | "agent"; text: string; time: string };
type AiIssue = { rule: string; score: string; quote: string };
type AgentType = "AI客服" | "一线客服" | "VIP一线客服" | "高潜客服";
type Complaint = {
  id: string;
  agent: string;
  agentType: AgentType;
  user: string;
  score: number;
  chat: ChatMsg[];
  aiIssues: AiIssue[];
};
type Review = {
  agreed: boolean;
  submitted: boolean;
  objectedRules: string[];
  reran: boolean;
  suggestedScore: string;
  detail: string;
  agentNote: string;
  deductedRules: string[];
};
type Principle = { title: string; content: string };

// 依据被质检人员判为「扣分不合理」的规则重新评分：移除这些规则的扣分项，把分数加回。
function rescore(c: Complaint, objectedRules: string[]) {
  const dropped = c.aiIssues.filter(i => objectedRules.includes(i.rule));
  const addBack = dropped.reduce((s, i) => s - (Number(i.score) || 0), 0);
  const newScore = Math.min(100, c.score + addBack);
  const remaining = c.aiIssues.filter(i => !objectedRules.includes(i.rule));
  return { newScore, dropped, remaining };
}

type DimOp = { op: "修改" | "新增" | "删除"; title: string; scope: "通用" | "专用"; catName: string; freq: number; prob: number; standard: string; oldCriteria?: string; newCriteria?: string; score?: string; reason: string };
type PrincipleOp = { op: "新增" | "修改" | "删除"; title: string; oldContent?: string; newContent?: string };

// 在通用/专用门类中定位某个二级维度，返回其归属与当前配置。
function locateDim(title: string, commonCats: Cat[], privateCats: Cat[]): { scope: "通用" | "专用"; catName: string; dim: Dim } | null {
  for (const cat of commonCats) { const d = cat.dimensions.find(x => x.title === title); if (d) return { scope: "通用", catName: cat.name, dim: d }; }
  for (const cat of privateCats) { const d = cat.dimensions.find(x => x.title === title); if (d) return { scope: "专用", catName: cat.name, dim: d }; }
  return null;
}

// 针对高频误扣的维度，给出建议收紧后的判断标准（与规则管理界面一一对应）。
function suggestNewCriteria(title: string, oldCriteria: string): string {
  const map: Record<string, string> = {
    "缺乏耐心": "不扣：全程平和认真，或仅因流程需要多次确认；-2：出现明确不耐烦措辞（如「您已经问过了」「自己看」）、催促结束或推诿。不适用：无多轮追问、对话简短平顺，或客服虽简短但已正面解答。",
    "安抚不到位": "不扣：已针对情绪作出回应，或玩家情绪并不强烈；-2：玩家明确表达强烈不满却完全未安抚。不适用：玩家全程情绪平稳、纯咨询，或问题已当场解决无需额外安抚。",
    "精准答疑": "不扣：直接命中疑问、结论明确，或已如实告知权限外情况、已提交工单/已记录（均视为实质回应）；-2：答了核心但夹带无关文案或需再追问一次；-5：仅复述文案、答非所问且无任何实质回应。玩家提了活动/福利疑问必评。",
  };
  return map[title] ?? (oldCriteria + "；补充边界：仅在明确命中扣分情形时扣分，边界存疑场景默认从宽不扣。");
}

// 结合本次复审，生成对「评分维度」的调整建议：修改（收紧判断标准）／删除（高频全量误扣）／新增（AI 漏扣需补充维度）。
function buildDimOps(complaints: Complaint[], reviews: Record<string, Review>, commonCats: Cat[], privateCats: Cat[]): DimOp[] {
  const freqMap = new Map<string, number>();
  let underScored = false; // 存在人工判分低于 AI（AI 漏扣）
  complaints.forEach(c => {
    const r = reviews[c.id];
    if (!r || r.agreed || !r.submitted) return;
    r.objectedRules.forEach(rule => freqMap.set(rule, (freqMap.get(rule) ?? 0) + 1));
    const sug = Number(r.suggestedScore);
    if (r.suggestedScore.trim() !== "" && !Number.isNaN(sug) && sug < c.score) underScored = true;
  });
  const totalHit = (rule: string) => complaints.filter(c => c.aiIssues.some(i => i.rule === rule)).length;

  const ops: DimOp[] = Array.from(freqMap.entries()).map(([title, freq]) => {
    const loc = locateDim(title, commonCats, privateCats);
    const denom = Math.max(totalHit(title), freq);
    const prob = Math.round((freq / denom) * 100);
    const scope = loc?.scope ?? "通用";
    const catName = loc?.catName ?? "—";
    const standard = loc?.dim.standard ?? "";
    const oldCriteria = loc?.dim.criteria ?? "";
    // 该维度每次触发都被人工推翻（且样本≥2），判定为整体不可靠，建议删除
    if (prob >= 100 && denom >= 2) {
      return { op: "删除" as const, title, scope, catName, freq, prob, standard, oldCriteria, reason: `该维度在本日 ${denom} 次 AI 扣分中被 100% 推翻，属整体误扣，建议从${scope}规则中删除该维度。` };
    }
    return { op: "修改" as const, title, scope, catName, freq, prob, standard, oldCriteria, newCriteria: suggestNewCriteria(title, oldCriteria), reason: "高频误扣，建议收紧判断标准与不适用边界。" };
  });
  // 新增：人工整体判分低于 AI，说明存在 AI 未覆盖的扣分点，建议补充维度
  if (underScored) {
    ops.push({
      op: "新增", title: "响应时效", scope: "通用", catName: "服务态度", freq: 0, prob: 0,
      standard: "客服对玩家消息的响应与跟进是否及时",
      newCriteria: "不扣：全程响应及时、无长时间无回应；-2：出现明显长时间未回应或让玩家反复催促。不适用：玩家未再追问、对话已自然结束。",
      score: "-2",
      reason: "本日存在人工判分低于 AI 的情形，说明 AI 漏扣了响应不及时等问题，建议在「服务态度」下新增该维度。",
    });
  }
  // 排序：修改/删除按存疑概率从高到低，新增置于末尾
  return ops.sort((a, b) => {
    if (a.op === "新增" && b.op !== "新增") return 1;
    if (b.op === "新增" && a.op !== "新增") return -1;
    return b.prob - a.prob || b.freq - a.freq;
  });
}

// 结合本次复审，给出评分原则的新增/修改建议。
function suggestPrincipleOps(principles: Principle[]): PrincipleOp[] {
  const ops: PrincipleOp[] = [];
  const p = principles.find(x => x.title === "不适用即不扣");
  if (p) ops.push({ op: "修改", title: "不适用即不扣", oldContent: p.content, newContent: p.content + " 边界模糊、缺乏明确扣分依据时，一律从宽判为不适用，不扣分。" });
  if (!principles.some(x => x.title === "高频误扣从宽")) {
    ops.push({ op: "新增", title: "高频误扣从宽", newContent: "对复审中被高频推翻的扣分维度，遇到边界或存疑情形默认不扣，避免同类误扣反复出现。" });
  }
  return ops;
}

const COMPLAINTS: Complaint[] = [
  {
    id: "c1",
    agent: "李梦",
    agentType: "一线客服",
    user: "用户01363539162",
    score: 88,
    chat: [
      { from: "user", text: "这个活动的门槛到底是充值满多少？页面写得太绕了。", time: "10:02" },
      { from: "agent", text: "您好，活动规则页面都写着呢，您再仔细看看。", time: "10:03" },
      { from: "user", text: "我看了才来问的，就是没看明白……", time: "10:04" },
      { from: "agent", text: "您已经问过了，规则页面都写着呢。", time: "10:05" },
      { from: "user", text: "行吧。", time: "10:06" },
    ],
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「您已经问过了，规则页面都写着呢。」" },
    ],
  },
  {
    id: "c2",
    agent: "王浩",
    agentType: "VIP一线客服",
    user: "V2055A",
    score: 72,
    chat: [
      { from: "user", text: "我参加的返利活动怎么没到账？", time: "14:20" },
      { from: "agent", text: "这个我之前说过了，您再看看活动页面吧。", time: "14:21" },
      { from: "user", text: "我等了两天了，很着急，能不能帮我查一下！", time: "14:22" },
      { from: "agent", text: "好的好的，您稍等。", time: "14:23" },
      { from: "user", text: "……你们到底管不管？", time: "14:30" },
    ],
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「这个我之前说过了，您再看看活动页面吧。」" },
      { rule: "安抚不到位", score: "-2", quote: "「好的好的，您稍等。」（玩家明显不满，未作安抚）" },
    ],
  },
  {
    id: "c3",
    agent: "李梦",
    agentType: "一线客服",
    user: "大有可为双鱼座",
    score: 95,
    chat: [
      { from: "user", text: "请问新手礼包在哪里领？", time: "09:10" },
      { from: "agent", text: "您好，进入游戏后点击右上角「福利」→「新手礼包」即可一键领取，已为您截图标注。", time: "09:11" },
      { from: "user", text: "找到了，谢谢！", time: "09:12" },
    ],
    aiIssues: [],
  },
  {
    id: "c4",
    agent: "陈静",
    agentType: "高潜客服",
    user: "机械鲨富大傻俏",
    score: 61,
    chat: [
      { from: "user", text: "我充值了但是钻石没到账，钱也扣了！", time: "20:41" },
      { from: "agent", text: "这是系统问题，我这边无法处理。", time: "20:42" },
      { from: "user", text: "那我找谁？钱不能白扣啊。", time: "20:43" },
    ],
    aiIssues: [
      { rule: "安抚不到位", score: "-2", quote: "「这是系统问题，我这边无法处理。」（随即结束对话）" },
    ],
  },
];

// 新增任务的筛选条件可选项
const DEFAULT_INCLUDE_TAGS = ["咨询类", "打不死鱼", "VIP类", "账号类"];
const INCLUDE_TAG_OPTIONS = ["咨询类", "打不死鱼", "VIP类", "账号类", "投诉类", "退款类", "物流类", "售后类"];
const DEFAULT_EXCLUDE_TAGS = ["无效会话"];
const COMPLAINT_STATUS_OPTIONS = ["已回复", "待回复", "已完成", "新客诉", "已解决", "已回绝"];
const VIP_LEVELS = ["0", "1", "2", "3", "4", "5", "6"];
// 新建任务时按客服分组选择客服姓名：一级为分组，二级为该分组下的客服姓名。AI客服无具体姓名。
const AGENT_ROSTER: { group: string; names: string[] }[] = [
  { group: "一线客服", names: ["李梦", "王晨", "申慧"] },
  { group: "VIP一线客服", names: ["王浩", "刘滔"] },
  { group: "高潜客服", names: ["陈静", "罗晶晶"] },
  { group: "VIP客服", names: ["王丽君", "阳尹新"] },
  { group: "AI客服", names: [] },
];

function PluginSidebar({
  view,
  setView,
  currentUser,
  onLogout,
}: {
  view: View;
  setView: (view: View) => void;
  currentUser: Account;
  onLogout: () => void;
}) {
  const isAgent = currentUser.role === "agent";
  const isAdmin = currentUser.role === "admin";
  return (
    <aside className="flex w-[184px] shrink-0 flex-col bg-[#293542] px-3 py-4 text-[#c5ced8]">
      <div className="mb-7 flex items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-[#4d82f6] text-white">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white">
            质检助手
          </div>
          <div className="text-[10px] text-[#9eabb9]">
            Quality Assistant
          </div>
        </div>
      </div>
      <div className="mb-2 px-2 text-[10px] font-medium tracking-[0.12em] text-[#8896a4]">
        工作台
      </div>
      {isAgent ? (
        <button
          onClick={() => setView("records")}
          className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "records" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
        >
          <UserRound className="size-4" />
          个人记录
        </button>
      ) : (
        <>
          <button
            onClick={() => setView("quality")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "quality" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <ClipboardCheck className="size-4" />
            任务管理
          </button>
          <button
            onClick={() => setView("rules")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "rules" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <SlidersHorizontal className="size-4" />
            规则设置
          </button>
          {isAdmin && (
            <button
              onClick={() => setView("members")}
              className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "members" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
            >
              <UserRound className="size-4" />
              用户管理
            </button>
          )}
        </>
      )}
      <div className="mt-auto border-t border-[#465361] pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[13px] font-semibold text-white">
            {currentUser.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-white">{currentUser.name}</div>
            <div className="text-[10px] text-[#9eabb9]">{roleLabel(currentUser.role)}</div>
          </div>
          <button onClick={onLogout} title="退出登录" className="grid size-7 shrink-0 place-items-center rounded-md text-[#9eabb9] hover:bg-[#354454] hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function QualityHome({ commonCats, privateCats, principles, complaints, aiVersion, currentRuleVersion, rerunTask, applyReport, reportApplied, openTaskName, setOpenTaskName, openComplaintId, setOpenComplaintId, reviews, setReviews, showReport, setShowReport, onGoToRuleView }: { commonCats: Cat[]; privateCats: Cat[]; principles: Principle[]; complaints: Complaint[]; aiVersion: number; currentRuleVersion: string; rerunTask: () => void; applyReport: () => void; reportApplied: boolean; openTaskName: string | null; setOpenTaskName: (name: string | null) => void; openComplaintId: string | null; setOpenComplaintId: (id: string | null) => void; reviews: Record<string, Review>; setReviews: React.Dispatch<React.SetStateAction<Record<string, Review>>>; showReport: boolean; setShowReport: (v: boolean) => void; onGoToRuleView: (name: string) => void }) {
  type TaskFilters = { date: string; rounds: string; limit: string; statuses: string[]; vipMin: string; vipMax: string; includeTags: string[]; excludeTags: string[]; agents: string[] };
  type TaskRow = { name: string; status: string; note: string; date: string; ruleVersion: string; filters?: TaskFilters };
  const [tasks, setTasks] = useState<TaskRow[]>([
    { name: "2024-10-11 客诉服务质检", status: "已完成", note: "十月第二周", date: "2024-10-11", ruleVersion: "v31" },
    { name: "2024-10-10 客诉服务质检", status: "有异常", note: "AI 检查中断", date: "2024-10-10", ruleVersion: "v30" },
    { name: "2024-10-09 客诉服务质检", status: "打分中", note: "十月第二周", date: "2024-10-09", ruleVersion: "v29" },
  ]);
  const detailTask = openTaskName ? tasks.find(t => t.name === openTaskName) ?? null : null;
  const setDetailTask = (task: TaskRow | null) => setOpenTaskName(task ? task.name : null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingCell, setEditingCell] = useState<{ name: string; field: "name" | "note" } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [ranToast, setRanToast] = useState(false);
  // 客诉评分细节筛选：配置驱动。加一列筛选 = 往 detailFilters 加一条配置，无需改 UI 或过滤逻辑。
  // type: "select" 渲染下拉；"segment" 渲染分段按钮。options 可为静态数组或按客诉列表动态求值。
  type DetailFilter = {
    key: string;
    label: string;
    type: "select" | "segment";
    options: string[] | ((rows: Complaint[]) => string[]);
    match: (c: Complaint, value: string) => boolean;
  };
  const detailFilters: DetailFilter[] = [
    { key: "agent", label: "客服", type: "select",
      options: rows => Array.from(new Set(rows.map(c => c.agent))),
      match: (c, v) => c.agent === v },
    { key: "agentType", label: "客服类型", type: "select",
      options: rows => Array.from(new Set(rows.map(c => c.agentType))),
      match: (c, v) => c.agentType === v },
    { key: "status", label: "审核状态", type: "segment",
      options: ["已审", "未审"],
      match: (c, v) => (v === "已审" ? isReviewed(c) : !isReviewed(c)) },
  ];
  // 每个筛选的当前取值（""=不限）。
  const [detailFilterValues, setDetailFilterValues] = useState<Record<string, string>>({});
  const setDetailFilter = (key: string, value: string) => setDetailFilterValues(prev => ({ ...prev, [key]: value }));

  function runTask(task: TaskRow) {
    setTasks(prev => prev.map(t => t.name === task.name ? { ...t, status: "拉取中" } : t));
    rerunTask();
    setTasks(prev => prev.map(t => t.name === task.name ? { ...t, status: "已完成" } : t));
    setRanToast(true);
  }

  function deleteTask(task: TaskRow) {
    setTasks(prev => prev.filter(t => t.name !== task.name));
    if (openTaskName === task.name) setOpenTaskName(null);
  }

  function createTask(t: Omit<TaskRow, "ruleVersion">) {
    // 任务创建时锁定当前生效的规则版本，之后规则再改也不影响本任务的打分与报告口径。
    setTasks(prev => [{ ...t, ruleVersion: currentRuleVersion }, ...prev]);
    setShowNewTask(false);
  }

  function startEdit(task: TaskRow, field: "name" | "note") {
    setEditingCell({ name: task.name, field });
    setEditingValue(field === "name" ? task.name : task.note);
  }
  function commitEdit(task: TaskRow) {
    if (!editingCell) return;
    setTasks(prev => prev.map(t => t.name === task.name
      ? editingCell.field === "name"
        ? { ...t, name: editingValue.trim() || t.name }
        : { ...t, note: editingValue }
      : t
    ));
    if (editingCell.field === "name" && detailTask?.name === task.name) {
      setOpenTaskName(editingValue.trim() || task.name);
    }
    setEditingCell(null);
  }

  const filteredTasks = tasks.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  const openComplaint = openComplaintId ? complaints.find(c => c.id === openComplaintId) ?? null : null;
  if (detailTask && openComplaint) {
    return (
      <ConversationReview
        complaint={openComplaint}
        review={reviews[openComplaint.id] ?? null}
        commonCats={commonCats}
        privateCats={privateCats}
        onBack={() => setOpenComplaintId(null)}
        onSave={(r) => setReviews(prev => ({ ...prev, [openComplaint.id]: r }))}
        onGoToRule={onGoToRuleView}
      />
    );
  }

  const finalScore = (c: Complaint) => {
    const r = reviews[c.id];
    if (r && !r.agreed && r.submitted && r.suggestedScore.trim() !== "" && !Number.isNaN(Number(r.suggestedScore))) {
      return Number(r.suggestedScore);
    }
    return c.score;
  };
  // 复审完成 = 认可，或已「提交异议」；仅存草稿（有异议未提交）不算完成。
  const isReviewed = (c: Complaint) => { const r = reviews[c.id]; return !!r && (r.agreed || r.submitted); };
  const allReviewed = complaints.every(isReviewed);

  if (detailTask && showReport) {
    return (
      <ReportView
        taskName={detailTask.name}
        ruleVersion={detailTask.ruleVersion}
        complaints={complaints}
        reviews={reviews}
        aiVersion={aiVersion}
        commonCats={commonCats}
        privateCats={privateCats}
        principles={principles}
        applied={reportApplied}
        onBack={() => setShowReport(false)}
        onApply={applyReport}
      />
    );
  }

  if (detailTask) {
    // 人工审核后仍认可的扣分项：AI 扣分中未被异议撤销的规则（agreed 则全部保留）。
    const agreedDeductions = (c: Complaint) => {
      const r = reviews[c.id];
      if (r && !r.agreed) return c.aiIssues.filter(i => !r.objectedRules.includes(i.rule));
      return c.aiIssues;
    };
    // 备注：认可 AI 时展示 AI 评分明细（各扣分项及依据）；有异议时取人工对客服的评分备注。
    const reviewNote = (c: Complaint) => {
      const r = reviews[c.id];
      if (!r) return "";
      if (r.agreed) {
        if (c.aiIssues.length === 0) return "AI 判定本次会话无扣分，表现良好。";
        return c.aiIssues.map(i => `${i.rule}（${i.score}）：${i.quote}`).join("\n");
      }
      return r.agentNote?.trim() || "—";
    };
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailTask(null)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
              <ChevronRight className="size-3 rotate-180" />返回
            </button>
            <div>
              <h1 className="text-[15px] font-semibold text-[#2f3b48]">{detailTask.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#8b96a3]">
                {detailTask.status === "已完成" ? "AI 自动质检已完成，请逐条复审客诉；全部复审后展示客服得分汇总。" : "本次 AI 自动质检异常，请在列表中重启任务。"}
                <span className="inline-flex items-center rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 text-[9px] font-medium text-[#3d6fe0]" title="本任务创建时锁定的规则版本，打分与报告均以此版本为准">适用规则 {detailTask.ruleVersion}</span>
                {detailTask.status === "已完成" && (
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${aiVersion > 1 ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#f0f2f5] text-[#98a3af]"}`}>AI 评分 v{aiVersion}{aiVersion > 1 ? "（已采纳复审意见）" : ""}</span>
                )}
              </p>
            </div>
          </div>
          {detailTask.status === "已完成" && allReviewed && (
            <button className="flex items-center gap-1 rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
              <Download className="size-3" />导出 XLSX
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {detailTask.status === "已完成" && allReviewed && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#cfe6d9] bg-[#eef8f2] px-4 py-2.5 text-[11px] text-[#27955d]">
              <ClipboardCheck className="size-4 shrink-0" />
              <span>当天所有客诉已经审核完毕，点击查看
                <button onClick={() => setShowReport(true)} className="font-semibold text-[#1f7a4c] underline hover:text-[#155c39]">报告</button>
              </span>
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-[#dce6f4] bg-white">
            {detailTask.status === "已完成" ? (
              <div>
                {/* 客服得分汇总 */}
                <div className="border-b border-[#e9edf0] px-4 pb-3 pt-3">
                  <div className="mb-2 text-[11px] font-semibold text-[#374350]">客服得分汇总</div>
                  {allReviewed ? (
                    <div className="overflow-x-auto">
                      <div style={{ minWidth: "760px" }}>
                        <div className="grid grid-cols-[70px_120px_84px_1.4fr_64px_1.4fr] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                          <span>姓名</span><span>客诉ID</span><span>日期</span><span>质检失分维度</span><span>总分</span><span>备注</span>
                        </div>
                        {complaints.map(c => {
                          const kept = agreedDeductions(c);
                          const shown = finalScore(c);
                          return (
                            <div key={c.id} className="grid grid-cols-[70px_120px_84px_1.4fr_64px_1.4fr] items-start border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                              <span className="font-medium text-[#3e4c5a]">{c.agent}</span>
                              <span className="truncate text-[#6b7a89]" title={c.id}>{c.id}</span>
                              <span className="text-[#758291]">{detailTask.date}</span>
                              <span className="flex flex-wrap gap-1">
                                {kept.length > 0 ? kept.map((it, i) => (
                                  <span key={i} className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-[9px] text-[#d75d5d]">{it.rule} {it.score}</span>
                                )) : <span className="text-[#98a3af]">无扣分</span>}
                              </span>
                              <span className={`font-semibold ${shown >= 90 ? "text-[#27955d]" : shown >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{shown}</span>
                              <span className="whitespace-pre-line leading-relaxed text-[#6b7a89]">{reviewNote(c)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md bg-[#f7f9fb] px-3 py-3 text-[10px] leading-relaxed text-[#8b96a3]">
                      需完成全部 {complaints.length} 条客诉复审后，才会按最终确认得分计算并展示客服得分汇总。当前已复审 {complaints.filter(isReviewed).length}/{complaints.length} 条。
                    </div>
                  )}
                </div>

                {/* 客诉评分细节 */}
                <div className="px-4 pb-4 pt-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#374350]">客诉评分细节</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {detailFilters.map(f => {
                        const opts = typeof f.options === "function" ? f.options(complaints) : f.options;
                        const val = detailFilterValues[f.key] ?? "";
                        if (f.type === "segment") {
                          return (
                            <div key={f.key} className="flex rounded-md border border-[#e2e8f0] bg-[#f5f7fa] p-0.5">
                              <button onClick={() => setDetailFilter(f.key, "")}
                                className={`rounded px-2 py-1 text-[10px] font-medium transition ${val === "" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>全部</button>
                              {opts.map(o => (
                                <button key={o} onClick={() => setDetailFilter(f.key, o)}
                                  className={`rounded px-2 py-1 text-[10px] font-medium transition ${val === o ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>{o}</button>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <select key={f.key} value={val} onChange={e => setDetailFilter(f.key, e.target.value)}
                            className="h-7 rounded-md border border-[#dbe3ee] bg-white px-2 text-[10px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]">
                            <option value="">全部{f.label}</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: "820px" }}>
                      <div className="grid grid-cols-[70px_96px_120px_64px_120px_88px_72px] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                        <span>客服</span><span>客服类型</span><span>用户名</span><span>评分结果</span><span>客服处理完成日期</span><span>复审会话</span><span>审核状态</span>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto">
                        {(() => {
                          const detailRows = complaints.filter(c =>
                            detailFilters.every(f => {
                              const v = detailFilterValues[f.key] ?? "";
                              return v === "" || f.match(c, v);
                            })
                          );
                          if (detailRows.length === 0) return (
                            <div className="px-3 py-8 text-center text-[10px] text-[#b0bbc8]">没有符合筛选条件的客诉</div>
                          );
                          return detailRows.map((row) => {
                          const reviewed = isReviewed(row);
                          const shown = finalScore(row);
                          const changed = shown !== row.score;
                          return (
                            <div key={row.id} className="grid grid-cols-[70px_96px_120px_64px_120px_88px_72px] items-center border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                              <span className="font-medium text-[#465260]">{row.agent}</span>
                              <span className="truncate text-[#6b7a89]" title={row.agentType}>{row.agentType}</span>
                              <span className="truncate text-[#6b7a89]" title={row.user}>{row.user}</span>
                              <span className="flex items-baseline gap-1">
                                <span className={`font-semibold ${shown >= 90 ? "text-[#27955d]" : shown >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{shown}分</span>
                                {changed && <span className="text-[9px] text-[#98a3af] line-through">{row.score}</span>}
                              </span>
                              <span className="text-[#758291]">{detailTask.date}</span>
                              <div>
                                <button onClick={() => setOpenComplaintId(row.id)} className="inline-flex items-center gap-0.5 rounded border border-[#dbe3ee] px-1.5 py-0.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
                                  <SlidersHorizontal className="size-2.5" />查看链接
                                </button>
                              </div>
                              <div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${reviewed ? "bg-[#e6f4ee] text-[#27955d]" : "bg-[#f0f2f5] text-[#98a3af]"}`}>
                                  <span className={`size-1.5 rounded-full ${reviewed ? "bg-[#34a36a]" : "bg-[#c0c8d0]"}`} />
                                  {reviewed ? "已审" : "未审"}
                                </span>
                              </div>
                            </div>
                          );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-5">
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-[#f7f9fb] px-3 py-2.5">
                    <div className="text-[10px] text-[#8b97a3]">任务状态</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#d75d5d]" />
                      <span className="text-[11px] font-medium text-[#d75d5d]">AI 质检异常</span>
                    </div>
                  </div>
                  <div className="rounded-md bg-[#f7f9fb] px-3 py-2.5">
                    <div className="text-[10px] text-[#8b97a3]">质检日期</div>
                    <div className="mt-1 text-[11px] font-medium text-[#465260]">{detailTask.date}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[#e8edf2] bg-[#fafbfc] px-3 py-2.5 text-[10px] text-[#8b97a3]">
                  <span>本次自动质检未能完成，请返回列表点击「重启任务」重新运行。</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">任务管理</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">AI 于非工作时间自动质检，工作时间查看每日质检结果</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8b97a3]">时间区间</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-7 rounded border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
          />
          <span className="text-[10px] text-[#b0bbc8]">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-7 rounded border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-[10px] text-[#a0acb8] hover:text-[#d75d5d]"
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowNewTask(true)}
            className="ml-1 flex h-7 items-center gap-1 rounded-md bg-[#4b7ff0] px-2.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]"
          >
            <Plus className="size-3.5" />新增任务
          </button>
        </div>
      </header>

      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} onCreate={createTask} />}

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="space-y-3">
            {ranToast && (
              <div className="flex items-start gap-2 rounded-lg border border-[#cfe6d9] bg-[#eef8f2] px-4 py-2.5 text-[11px] leading-relaxed text-[#27955d]">
                <RefreshCw className="mt-0.5 size-4 shrink-0" />
                <span>AI 已按最新规则重新为各条客诉打分（当前 AI 评分 v{aiVersion}）；已提交人工复审的客诉，其意见与分数完整保留。点「复核结果」查看变化。</span>
                <button onClick={() => setRanToast(false)} className="ml-auto text-[#7fae95] hover:text-[#27955d]"><X className="size-3.5" /></button>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
              <div className="border-b border-[#e9edf0] px-4 py-3">
                <div className="text-[12px] font-semibold text-[#374350]">自动质检任务列表</div>
                <div className="mt-0.5 text-[10px] text-[#8b97a3]">每日 AI 自动质检生成；已完成可复核结果，异常可重启任务</div>
              </div>
              {filteredTasks.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">{(dateFrom || dateTo) ? "所选时间区间内暂无质检任务" : "暂无质检任务"}</div>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: "720px" }}>
                    <div className="grid grid-cols-[1.6fr_1fr_.8fr_.7fr_.9fr_180px] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]">
                      <span>任务名称</span><span>备注</span><span>日期</span><span>适用规则版本</span><span>状态</span><span>操作</span>
                    </div>
                    <div className="max-h-[228px] overflow-y-auto">
                      {filteredTasks.map(task => {
                        const editingName = editingCell?.name === task.name && editingCell.field === "name";
                        const editingNote = editingCell?.name === task.name && editingCell.field === "note";
                        return (
                          <div key={task.name} className="grid grid-cols-[1.6fr_1fr_.8fr_.7fr_.9fr_180px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]">
                            {editingName ? (
                              <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(task)} onKeyDown={e => { if (e.key === "Enter") commitEdit(task); if (e.key === "Escape") setEditingCell(null); }}
                                className="h-6 w-full rounded border border-[#4b7ff0] bg-white px-2 text-[11px] font-medium outline-none" />
                            ) : (
                              <span className="cursor-text font-medium text-[#465260] hover:text-[#4b7ff0]" onClick={() => startEdit(task, "name")} title="点击编辑">{task.name}</span>
                            )}
                            {editingNote ? (
                              <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(task)} onKeyDown={e => { if (e.key === "Enter") commitEdit(task); if (e.key === "Escape") setEditingCell(null); }}
                                className="h-6 w-full rounded border border-[#4b7ff0] bg-white px-2 text-[10px] outline-none" />
                            ) : (
                              <span className="cursor-text" onClick={() => startEdit(task, "note")} title="点击编辑">
                                {task.note ? <i className="rounded bg-[#f0f4fa] px-1.5 py-0.5 not-italic text-[10px] text-[#687789] hover:bg-[#e8eef8]">{task.note}</i> : <span className="text-[10px] text-[#c5cdd6] hover:text-[#8b97a3]">+ 添加备注</span>}
                              </span>
                            )}
                            <span className="text-[#758291]">{task.date}</span>
                            <span>
                              <span className="inline-flex items-center rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-2 py-0.5 text-[10px] font-medium text-[#3d6fe0]" title="任务创建时锁定的规则版本，打分与报告均以此版本为准">{task.ruleVersion}</span>
                            </span>
                            <span>
                              {(() => {
                                const st = task.status;
                                if (st === "拉取中" || st === "打分中") return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-[#4b7ff0]">
                                    <RefreshCw className="size-2.5 animate-spin" />{st}
                                  </span>
                                );
                                if (st === "有异常") return (
                                  <span className="inline-flex items-center rounded-full bg-[#fdeeee] px-2 py-0.5 text-[10px] font-medium text-[#d75d5d]">有异常</span>
                                );
                                return (
                                  <span className="inline-flex items-center rounded-full bg-[#eaf7f0] px-2 py-0.5 text-[10px] font-medium text-[#27955d]">已完成</span>
                                );
                              })()}
                            </span>
                            <div className="flex items-center justify-start gap-1.5">
                              {task.status === "有异常" ? (
                                <button onClick={() => runTask(task)} title="重新拉取并由 AI 重新打分"
                                  className="rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2 py-1 text-[10px] text-[#4b7ff0] transition hover:bg-[#daeaff]">
                                  重启任务
                                </button>
                              ) : (
                                <button onClick={() => setDetailTask(task)}
                                  className="rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] transition hover:bg-[#eef5ff]">
                                  复核结果
                                </button>
                              )}
                              <button onClick={() => deleteTask(task)} title="删除任务"
                                className="flex items-center gap-1 rounded border border-[#f0d8d8] bg-white px-2 py-1 text-[10px] text-[#d75d5d] transition hover:bg-[#fdf3f3]">
                                <Trash2 className="size-3" />删除
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: { name: string; status: string; note: string; date: string; filters: { date: string; rounds: string; limit: string; statuses: string[]; vipMin: string; vipMax: string; includeTags: string[]; excludeTags: string[]; agents: string[] } }) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [inspectDate, setInspectDate] = useState(today);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [rounds, setRounds] = useState("");
  const [limit, setLimit] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [vipMin, setVipMin] = useState("");
  const [vipMax, setVipMax] = useState("");
  const [includeTags, setIncludeTags] = useState<string[]>([...DEFAULT_INCLUDE_TAGS]);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [includeCustom, setIncludeCustom] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([...DEFAULT_EXCLUDE_TAGS]);
  const [agents, setAgents] = useState<string[]>([]);
  const [includeDraft, setIncludeDraft] = useState("");
  const [excludeDraft, setExcludeDraft] = useState("");
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [agentPickerGroup, setAgentPickerGroup] = useState<string | null>(null);
  const [err, setErr] = useState("");

  function addTag(list: string[], setList: (v: string[]) => void, val: string, reset: () => void) {
    const v = val.trim();
    if (v && !list.includes(v)) setList([...list, v]);
    reset();
  }
  function removeTag(list: string[], setList: (v: string[]) => void, tag: string) {
    setList(list.filter(t => t !== tag));
  }
  function toggleStatus(s: string) {
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }
  function toggleInclude(t: string) {
    setIncludeTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  // 二级选择：勾选/取消某个客服姓名。AI客服无姓名，选中后以「AI客服」整体作为一项。
  function toggleAgent(a: string) {
    setAgents(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }
  // 某分组下的客服姓名全选 / 取消全选。
  function toggleGroupAll(names: string[]) {
    setAgents(prev => {
      const allOn = names.length > 0 && names.every(n => prev.includes(n));
      return allOn ? prev.filter(n => !names.includes(n)) : [...prev, ...names.filter(n => !prev.includes(n))];
    });
  }
  function submit() {
    if (!name.trim()) { setErr("请填写任务名称"); return; }
    if (dateMode === "range") {
      if (!rangeStart || !rangeEnd) { setErr("请选择质检的起止日期"); return; }
      if (rangeStart > rangeEnd) { setErr("质检时间段的开始日期不能晚于结束日期"); return; }
    }
    if (vipMin && vipMax && Number(vipMin) > Number(vipMax)) { setErr("VIP 范围的最低等级不能高于最高等级"); return; }
    // 单日：date 即当天；时间段：date 展示为「起 ~ 止」，并在 filters 中带上起止日期。
    const taskDate = dateMode === "single" ? inspectDate : `${rangeStart} ~ ${rangeEnd}`;
    onCreate({
      name: name.trim(),
      status: "拉取中",
      note: note.trim(),
      date: taskDate,
      filters: { date: taskDate, rounds: rounds.trim(), limit: limit.trim() || "50", statuses, vipMin, vipMax, includeTags, excludeTags, agents },
    });
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-[440px] overflow-auto rounded-xl bg-white shadow-[0_24px_60px_rgba(41,53,66,.28)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e9edf0] px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-[#2f3b48]">新增质检任务</div>
            <div className="mt-0.5 text-[10px] text-[#8b96a3]">设置任务信息与要质检的客诉筛选条件</div>
          </div>
          <button onClick={onClose} className="text-[#85919d] hover:text-[#3e4c5a]"><X className="size-4" /></button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className="mb-1 block text-[11px] text-[#5a6572]">任务名称 <span className="text-[#e59735]">*</span></label>
            <input value={name} onChange={e => { setName(e.target.value); if (err) setErr(""); }} placeholder="如：2024-10-12 客诉服务质检"
              className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#5a6572]">备注</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="选填，如：十月第二周补检"
              className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] text-[#5a6572]">质检日期</label>
              <div className="flex rounded-lg border border-[#e2e8f0] bg-[#f5f7fa] p-0.5">
                <button onClick={() => { setDateMode("single"); if (err) setErr(""); }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${dateMode === "single" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>某天</button>
                <button onClick={() => { setDateMode("range"); if (err) setErr(""); }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${dateMode === "range" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>时间段</button>
              </div>
            </div>
            {dateMode === "single" ? (
              <input type="date" value={inspectDate} onChange={e => setInspectDate(e.target.value)}
                className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={rangeStart} max={rangeEnd || undefined}
                  onChange={e => { setRangeStart(e.target.value); if (err) setErr(""); }}
                  className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                <span className="shrink-0 text-[11px] text-[#8b97a3]">～</span>
                <input type="date" value={rangeEnd} min={rangeStart || undefined}
                  onChange={e => { setRangeEnd(e.target.value); if (err) setErr(""); }}
                  className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
              </div>
            )}
          </div>

          <div className="border-t border-[#eef1f4] pt-3">
            <div className="mb-2 text-[11px] font-semibold text-[#374350]">客诉筛选条件</div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-[#8b97a3]">对话轮次</label>
                <input type="number" min={1} value={rounds}
                  onChange={e => setRounds(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="如：3"
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[#8b97a3]">客诉数量上限</label>
                <input type="number" min={1} value={limit}
                  onChange={e => setLimit(e.target.value)}
                  placeholder="默认 50"
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">客诉状态</label>
              <div className="relative">
                <button onClick={() => setStatusOpen(o => !o)}
                  className="flex h-8 w-full items-center justify-between rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none hover:border-[#4b7ff0]">
                  <span className={statuses.length ? "text-[#3e4c5a]" : "text-[#b5bfc9]"}>{statuses.length ? statuses.join("、") : "不限（点击选择，可多选）"}</span>
                  <ChevronRight className={`size-3.5 shrink-0 text-[#8b97a3] transition-transform ${statusOpen ? "rotate-90" : ""}`} />
                </button>
                {statusOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-[#dde5ee] bg-white p-1 shadow-lg">
                    {COMPLAINT_STATUS_OPTIONS.map(s => {
                      const on = statuses.includes(s);
                      return (
                        <button key={s} onClick={() => toggleStatus(s)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition ${on ? "bg-[#eef4ff] text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                          <span className={`grid size-3.5 place-items-center rounded border ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <span className="text-[8px] leading-none">✓</span>}</span>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">VIP 范围</label>
              <div className="flex items-center gap-2">
                <select value={vipMin} onChange={e => { setVipMin(e.target.value); if (err) setErr(""); }}
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]">
                  <option value="">最低等级</option>
                  {VIP_LEVELS.map(l => <option key={l} value={l}>{`VIP ${l}`}</option>)}
                </select>
                <span className="shrink-0 text-[11px] text-[#8b97a3]">～</span>
                <select value={vipMax} onChange={e => { setVipMax(e.target.value); if (err) setErr(""); }}
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]">
                  <option value="">最高等级</option>
                  {VIP_LEVELS.map(l => <option key={l} value={l}>{`VIP ${l}`}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">包含其中任一标签</label>
              <div className="relative">
                <button onClick={() => setIncludeOpen(o => !o)}
                  className="flex h-8 w-full items-center justify-between rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none hover:border-[#4b7ff0]">
                  <span className={includeTags.length ? "text-[#3e4c5a]" : "text-[#b5bfc9]"}>{includeTags.length ? includeTags.join("、") : "不限（点击选择，可多选）"}</span>
                  <ChevronRight className={`size-3.5 shrink-0 text-[#8b97a3] transition-transform ${includeOpen ? "rotate-90" : ""}`} />
                </button>
                {includeOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-[#dde5ee] bg-white p-1 shadow-lg">
                    {Array.from(new Set([...INCLUDE_TAG_OPTIONS, ...includeCustom, ...includeTags])).map(t => {
                      const on = includeTags.includes(t);
                      return (
                        <button key={t} onClick={() => toggleInclude(t)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition ${on ? "bg-[#eef4ff] text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                          <span className={`grid size-3.5 place-items-center rounded border ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <span className="text-[8px] leading-none">✓</span>}</span>
                          {t}
                        </button>
                      );
                    })}
                    <div className="mt-1 flex items-center gap-1 border-t border-[#eef1f4] px-2 pb-0.5 pt-1.5">
                      <Plus className="size-3 text-[#8b97a3]" />
                      <input value={includeDraft} onChange={e => setIncludeDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const v = includeDraft.trim();
                            if (v) { if (!includeCustom.includes(v)) setIncludeCustom(prev => [...prev, v]); if (!includeTags.includes(v)) setIncludeTags(prev => [...prev, v]); }
                            setIncludeDraft("");
                          }
                        }}
                        placeholder="自定义标签，回车添加"
                        className="w-full bg-transparent text-[11px] text-[#3e4c5a] outline-none placeholder-[#b5bfc9]" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">不包含其中任一标签</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {excludeTags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-[#d75d5d] py-1 pl-2.5 pr-1 text-[10px] font-medium text-white">
                    {tag}
                    <button onClick={() => removeTag(excludeTags, setExcludeTags, tag)} className="grid size-3.5 place-items-center rounded-full hover:bg-white/25"><X className="size-2.5" /></button>
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-full border border-dashed border-[#e6b3b3] bg-[#fdf5f5] py-1 pl-2 pr-1.5 text-[10px] text-[#c08a8a]">
                  <Plus className="size-2.5" />
                  <input value={excludeDraft} onChange={e => setExcludeDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addTag(excludeTags, setExcludeTags, excludeDraft, () => setExcludeDraft("")); }}
                    placeholder="输入标签，回车添加"
                    className="w-[100px] bg-transparent text-[10px] text-[#3e4c5a] outline-none placeholder-[#d3aeae]" />
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">添加想要质检的客服（按分组选择）</label>
              <div className="relative">
                <div onClick={() => { if (!agentPickerOpen) { setAgentPickerOpen(true); setAgentPickerGroup(AGENT_ROSTER[0].group); } }}
                  className={`flex min-h-9 cursor-pointer flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 transition ${agentPickerOpen ? "border-[#4b7ff0]" : "border-[#dbe3ee] hover:border-[#c3d0e0]"}`}>
                  {agents.map(a => (
                    <span key={a} className="flex items-center gap-1 rounded-full bg-[#eef1f5] py-0.5 pl-2.5 pr-1 text-[10px] font-medium text-[#4d5966]">
                      {a}
                      <button onClick={e => { e.stopPropagation(); toggleAgent(a); }} className="grid size-3.5 place-items-center rounded-full text-[#8b97a3] hover:bg-[#dfe4ea]"><X className="size-2.5" /></button>
                    </span>
                  ))}
                  <span className="flex items-center gap-1 px-1 text-[10px] text-[#8b97a3]">
                    <Plus className="size-3" />{agents.length > 0 ? "继续添加" : "点击选择客服"}
                  </span>
                  <ChevronRight className={`ml-auto size-3.5 shrink-0 text-[#8b97a3] transition-transform ${agentPickerOpen ? "rotate-90" : ""}`} />
                </div>
                {agentPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAgentPickerOpen(false)} />
                    <div className="absolute bottom-full left-0 right-0 z-20 mb-1.5 grid grid-cols-[136px_1fr] overflow-hidden rounded-xl border border-[#e4eaf2] bg-white shadow-[0_-16px_40px_-8px_rgba(41,53,66,.22)]">
                      {/* 一级：分组 */}
                      <div className="max-h-[228px] overflow-auto border-r border-[#eef1f4] bg-[#f7f9fc] p-1.5">
                        {AGENT_ROSTER.map(g => {
                          const on = agentPickerGroup === g.group;
                          const picked = g.group === "AI客服" ? (agents.includes("AI客服") ? 1 : 0) : g.names.filter(n => agents.includes(n)).length;
                          return (
                            <button key={g.group} onClick={() => setAgentPickerGroup(g.group)}
                              className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-white font-medium text-[#3562c8] shadow-[0_1px_3px_rgba(41,53,66,.08)]" : "text-[#5a6674] hover:bg-[#eef2f7]"}`}>
                              <span className="flex items-center gap-1.5">
                                <span className={`size-1.5 rounded-full ${picked > 0 ? "bg-[#4b7ff0]" : "bg-transparent"}`} />
                                {g.group}
                              </span>
                              {picked > 0 && <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#4b7ff0]">{picked}</span>}
                            </button>
                          );
                        })}
                      </div>
                      {/* 二级：姓名 */}
                      <div className="flex max-h-[228px] flex-col">
                        {(() => {
                          const g = AGENT_ROSTER.find(x => x.group === agentPickerGroup);
                          if (!g) return null;
                          if (g.group === "AI客服") {
                            const on = agents.includes("AI客服");
                            return (
                              <div className="overflow-auto p-1.5">
                                <button onClick={() => toggleAgent("AI客服")}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-[#eef4ff] font-medium text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                                  <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-3" />}</span>
                                  AI客服（整组质检，无需选择姓名）
                                </button>
                              </div>
                            );
                          }
                          if (g.names.length === 0) return <div className="grid flex-1 place-items-center px-2 py-8 text-[10px] text-[#b0bbc8]">该分组暂无客服</div>;
                          const allOn = g.names.every(n => agents.includes(n));
                          return (
                            <>
                              {/* 全选行 */}
                              <button onClick={() => toggleGroupAll(g.names)}
                                className="flex shrink-0 items-center gap-2 border-b border-[#f0f3f7] px-3 py-2 text-left text-[11px] font-medium text-[#4d5966] transition hover:bg-[#f7f9fc]">
                                <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${allOn ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{allOn && <Check className="size-3" />}</span>
                                全选本组（{g.names.length} 人）
                              </button>
                              <div className="grid grid-cols-2 gap-1 overflow-auto p-1.5">
                                {g.names.map(n => {
                                  const on = agents.includes(n);
                                  return (
                                    <button key={n} onClick={() => toggleAgent(n)}
                                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-[#eef4ff] font-medium text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                                      <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-3" />}</span>
                                      {n}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="col-span-2 flex items-center justify-between border-t border-[#eef1f4] bg-[#f7f9fc] px-3 py-2">
                        <span className="text-[10px] text-[#8b97a3]">已选 <span className="font-semibold text-[#4b7ff0]">{agents.length}</span> 项</span>
                        <div className="flex items-center gap-2">
                          {agents.length > 0 && <button onClick={() => setAgents([])} className="rounded-md px-2 py-1 text-[10px] text-[#8b97a3] transition hover:bg-[#eef1f5] hover:text-[#4d5966]">清空</button>}
                          <button onClick={() => setAgentPickerOpen(false)} className="rounded-md bg-[#4b7ff0] px-3 py-1 text-[10px] font-medium text-white transition hover:bg-[#3d6fe0]">完成</button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {err && <div className="rounded-md bg-[#fff0f0] px-3 py-2 text-[10px] text-[#d75d5d]">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e9edf0] px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[11px] text-[#6b7a89] hover:bg-[#f2f5f9]">取消</button>
          <button onClick={submit} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]">创建任务</button>
        </div>
      </div>
    </div>
  );
}

function ConversationReview({ complaint, review, commonCats, privateCats, onBack, onSave, onGoToRule }: { complaint: Complaint; review: Review | null; commonCats: Cat[]; privateCats: Cat[]; onBack: () => void; onSave: (r: Review) => void; onGoToRule: (name: string) => void }) {
  const involvedRules = Array.from(new Set(complaint.aiIssues.map(i => i.rule)));
  // 全部质检规则按门类分组（通用/专用），携带各维度扣分值，供人工检索标注实际扣分点。
  const ruleGroups = [
    ...commonCats.map(c => ({ scope: "通用", name: c.name, rules: c.dimensions.map(d => ({ title: d.title, score: d.score })) })),
    ...privateCats.map(c => ({ scope: "专用", name: c.name, rules: c.dimensions.map(d => ({ title: d.title, score: d.score })) })),
  ].filter(g => g.rules.length > 0);
  // 规则名 → 扣分值 映射，用于已选胶囊展示。
  const ruleScoreMap: Record<string, string> = {};
  ruleGroups.forEach(g => g.rules.forEach(r => { ruleScoreMap[r.title] = r.score; }));
  // 是否处于「异议中」：已存在未认可的复审（草稿或已提交）即视为异议进行中。
  const objecting = !!review && !review.agreed;
  const submitted = !!review && !review.agreed && review.submitted;
  const reran = !!review && !review.agreed && review.reran;
  const objectedRules = objecting ? review!.objectedRules : [];
  const [selectedRules, setSelectedRules] = useState<string[]>(objectedRules);
  const [score, setScore] = useState(review?.suggestedScore ?? "");
  const [detail, setDetail] = useState(review?.detail ?? "");
  const [agentNote, setAgentNote] = useState(review?.agentNote ?? "");
  const [deductedRules, setDeductedRules] = useState<string[]>(review?.deductedRules ?? []);
  const [deductPickerOpen, setDeductPickerOpen] = useState(false);
  const [deductSearch, setDeductSearch] = useState("");
  const [err, setErr] = useState("");
  // 已提交的异议默认只读；草稿默认可编辑。点「更新异议」才展开编辑。
  const [editing, setEditing] = useState(!submitted);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // 输入框随内容行数自增长：内容变化或进入编辑态时，按 scrollHeight 撑高。
  useEffect(() => {
    [detailRef.current, noteRef.current].forEach(el => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [detail, agentNote, editing]);
  // 简约滚动条：细窄、圆角、浅灰，悬停加深；轨道透明。
  const scrollCls = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d2dae6] hover:[&::-webkit-scrollbar-thumb]:bg-[#b8c3d2]";

  const preview = rescore(complaint, objecting ? review!.objectedRules : []);

  // 保存草稿（不改变 submitted 状态），跨页面（跳转规则）保留异议进度。
  function saveDraft(patch: Partial<Review>) {
    const base: Review = review && !review.agreed ? review : { agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] };
    onSave({ ...base, ...patch });
  }
  function toggleRule(r: string) {
    const next = selectedRules.includes(r) ? selectedRules.filter(x => x !== r) : [...selectedRules, r];
    setSelectedRules(next);
    saveDraft({ objectedRules: next });
    if (err) setErr("");
  }
  // 人工标注该客服实际扣分的规则（与「有异议规则」相互独立）。
  function toggleDeducted(r: string) {
    const next = deductedRules.includes(r) ? deductedRules.filter(x => x !== r) : [...deductedRules, r];
    setDeductedRules(next);
    saveDraft({ deductedRules: next });
    if (err) setErr("");
  }
  // 总分非空且不满分（<100）时，才需要人工指出实际扣分点。
  const needDeducted = score.trim() !== "" && !Number.isNaN(Number(score)) && Number(score) < 100;
  function agreeNoIssue() {
    onSave({ agreed: true, submitted: true, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] });
  }
  // 点「有异议」：立即建立异议草稿，返回后仍在异议流程中。
  function startObjection() {
    setSelectedRules([]); setScore(""); setDetail(""); setAgentNote(""); setDeductedRules([]); setErr(""); setEditing(true);
    onSave({ agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] });
  }
  function submitObjection() {
    if (involvedRules.length > 0 && selectedRules.length === 0) { setErr("请至少选择一个有异议的评分规则"); return; }
    if (!score.trim()) { setErr("请填写该客服应有的总分"); return; }
    if (!detail.trim()) { setErr("请填写对 AI 评分的意见"); return; }
    if (needDeducted && deductedRules.length === 0) { setErr("该客服未满分，请选择实际扣分的规则"); return; }
    onSave({ agreed: false, submitted: true, objectedRules: selectedRules, reran: !!review?.reran, suggestedScore: score.trim(), detail: detail.trim(), agentNote: agentNote.trim(), deductedRules: Number(score) < 100 ? deductedRules : [] });
    setErr("");
    setEditing(false);
  }
  // 点「更新异议」：回到草稿态并展开编辑，跳转规则页返回后仍保持编辑。
  function editObjection() {
    setSelectedRules(review && !review.agreed ? review.objectedRules : []);
    setScore(review?.suggestedScore ?? "");
    setDetail(review?.detail ?? "");
    setAgentNote(review?.agentNote ?? "");
    setDeductedRules(review?.deductedRules ?? []);
    setErr("");
    setEditing(true);
    saveDraft({ submitted: false });
  }
  // 点规则跳转去修改：先在修改意见中默认选上该规则，返回后仍保持勾选。
  function goToRuleFromObjection(r: string) {
    if (!selectedRules.includes(r)) {
      const next = [...selectedRules, r];
      setSelectedRules(next);
      saveDraft({ objectedRules: next });
    }
    onGoToRule(r);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f4f6fa]">
      <header className="flex h-[60px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5">
        <button onClick={onBack} className="flex size-8 items-center justify-center rounded-full border border-[#e0e7f1] bg-white text-[#4b7ff0] transition hover:border-[#c3d6f4] hover:bg-[#eef5ff]">
          <ChevronRight className="size-4 rotate-180" />
        </button>
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-[12px] font-semibold text-white shadow-[0_4px_10px_rgba(75,127,240,.28)]">
          {complaint.agent.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold text-[#2f3b48]">复审会话 · {complaint.agent}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#8b96a3]">
            <UserRound className="size-3 text-[#a8b2be]" />用户 {complaint.user}
            <span className="text-[#d3d9e0]">·</span>
            <Bot className="size-3 text-[#a8b2be]" />AI 评分 <span className="font-medium text-[#5a6675]">{complaint.score} 分</span>
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden px-8 py-5">
        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] gap-5">
          {/* 左栏：客服与用户对话（独立滚动） */}
          <div className="flex min-h-0 w-[45%] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
            <div className="flex items-center gap-2.5 border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5">
              <div className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"><MessageSquareText className="size-4" /></div>
              <div className="flex flex-col">
                <span className="text-[12px] font-semibold text-[#333f4c]">客服与用户对话</span>
                <span className="text-[9px] text-[#a3adba]">按时间先后展示完整客诉会话</span>
              </div>
              <span className="ml-auto flex items-center gap-1 rounded-full bg-[#f2f5fa] px-2.5 py-1 text-[9px] font-medium text-[#7c8896]">
                <span className="size-1.5 rounded-full bg-[#4b7ff0]" />{complaint.chat.length} 条
              </span>
            </div>
            <div className={`min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,#e9eef6_1px,transparent_0)] [background-size:16px_16px] bg-[#fbfcfe] px-4 py-5 ${scrollCls}`}>
              <div className="space-y-4">
              {complaint.chat.map((m, i) => {
                const agent = m.from === "agent";
                return (
                  <div key={i} className={`flex items-end gap-2 ${agent ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white ${agent ? "bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-white shadow-[0_2px_6px_rgba(75,127,240,.35)]" : "bg-gradient-to-br from-[#eef1f6] to-[#e1e6ee] text-[#697585] shadow-[0_2px_5px_rgba(41,53,66,.1)]"}`}>
                      {agent ? "服" : "客"}
                    </div>
                    <div className={`flex max-w-[75%] flex-col gap-1 ${agent ? "items-end" : "items-start"}`}>
                      <span className="flex items-center gap-1 px-1 text-[9px] text-[#aab3bf]">
                        <span className="font-medium text-[#98a2af]">{agent ? "客服" : "用户"}</span>
                        <span className="text-[#cdd4dd]">·</span>{m.time}
                      </span>
                      <div className={`rounded-[16px] px-3.5 py-2.5 text-[11px] leading-relaxed ${agent ? "rounded-br-[4px] bg-gradient-to-br from-[#5a8bf5] to-[#4577ec] text-white shadow-[0_3px_10px_-2px_rgba(75,127,240,.4)]" : "rounded-bl-[4px] border border-[#e8edf4] bg-white text-[#3e4c5a] shadow-[0_2px_6px_-2px_rgba(41,53,66,.1)]"}`}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* 右栏：AI 评分明细（固定）+ 修改意见（独立滚动） */}
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {/* AI 评分明细（固定不随修改意见滚动） */}
            <div className="shrink-0 overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
            <div className="flex items-center justify-between border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"><Sparkles className="size-4" /></div>
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333f4c]">AI 评分明细
                    {reran && <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">已重运行</span>}
                  </span>
                  <span className="text-[9px] text-[#a3adba]">AI 依据规则给出的扣分项与依据</span>
                </div>
              </div>
              {(() => {
                const val = reran ? preview.newScore : complaint.score;
                const tone = val >= 90 ? { t: "text-[#27955d]", b: "from-[#eafaf1] to-[#dcf4e7]", r: "ring-[#c7ead6]" } : val >= 75 ? { t: "text-[#4b7ff0]", b: "from-[#eef4ff] to-[#e0ebff]", r: "ring-[#d3e2fb]" } : { t: "text-[#d75d5d]", b: "from-[#fdeeee] to-[#fbe1e1]", r: "ring-[#f2d2d2]" };
                return (
                  <div className={`flex items-center gap-1.5 rounded-2xl bg-gradient-to-br ${tone.b} px-3 py-1.5 ring-1 ${tone.r}`}>
                    {reran && <span className="text-[10px] text-[#98a3af] line-through">{complaint.score}</span>}
                    <span className={`text-[22px] font-bold leading-none ${tone.t}`}>{val}</span>
                    <span className="text-[10px] text-[#a8b2be]">分</span>
                  </div>
                );
              })()}
            </div>

            <div className="p-4">
            {/* 明细项：重运行后展示新明细，被移除项以删除线标出 */}
            {complaint.aiIssues.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-2xl border border-[#d7eede] bg-gradient-to-br from-[#f2faf5] to-[#eafaf1] px-4 py-3.5 text-[11px] text-[#27955d]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d7f0e1] text-[#27955d]"><Check className="size-3.5" /></span>
                本次会话无扣分项，AI 判定表现良好。
              </div>
            ) : (
              <div className="space-y-2.5">
                {complaint.aiIssues.map((iss, i) => {
                  const removed = reran && objectedRules.includes(iss.rule);
                  return (
                    <div key={i} className={`relative overflow-hidden rounded-2xl py-2.5 pl-4 pr-3.5 transition ${removed ? "border border-[#dcecc9] bg-gradient-to-br from-[#f6faf0] to-[#f0f6e6]" : "bg-gradient-to-br from-[#fef7f7] to-[#fdf0f0]"}`}>
                      <span className={`absolute inset-y-0 left-0 w-1 ${removed ? "bg-[#8bbf5f]" : "bg-[#e08585]"}`} />
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${removed ? "bg-[#e7f2dc] text-[#5c8a3a]" : "bg-[#fce4e4] text-[#d1544f]"}`}>{iss.rule}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${removed ? "bg-[#eef5e4] text-[#5c8a3a] line-through" : "bg-[#fbeaea] text-[#d1544f]"}`}>{iss.score}</span>
                        {removed && <span className="ml-auto flex items-center gap-1 text-[9px] font-medium text-[#5c8a3a]"><Check className="size-2.5" />已按新规则撤销</span>}
                      </div>
                      <div className={`text-[10px] italic leading-relaxed ${removed ? "text-[#9aa891]" : "text-[#8b97a4]"}`}>{iss.quote}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {reran && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#eef8f2] px-3 py-2 text-[10px] leading-relaxed text-[#27955d]">
                <RefreshCw className="size-3 shrink-0" />
                AI 已按修改后的规则重新评分：{complaint.score} 分 → {preview.newScore} 分（撤销 {objectedRules.length} 项扣分）。可再次修改规则后重运行。
              </div>
            )}

            {/* 决策：仅在尚未做出任何复审结论时展示「没问题 / 有异议」 */}
            {!review && (
              <div className="mt-4 flex items-center gap-2 border-t border-[#eef1f4] pt-4">
                <p className="mr-auto text-[10px] text-[#8b96a3]">对以上 AI 评分是否认可？</p>
                <button onClick={startObjection} className="flex items-center gap-1.5 rounded-lg border border-[#e6c4c4] bg-white px-3.5 py-2 text-[11px] font-medium text-[#c9645f] transition hover:bg-[#fdf6f6]"><AlertCircle className="size-3.5" />有异议</button>
                <button onClick={agreeNoIssue} className="flex items-center gap-1.5 rounded-lg bg-[#4c9e78] px-3.5 py-2 text-[11px] font-medium text-white transition hover:bg-[#44916d]"><ThumbsUp className="size-3.5" />认可，没问题</button>
              </div>
            )}
            {/* 已认可：可改为有异议 */}
            {review && review.agreed && (
              <div className="mt-4 flex items-center gap-2 border-t border-[#eef1f4] pt-4">
                <span className="mr-auto flex items-center gap-1.5 text-[10px] font-medium text-[#4c9e78]"><span className="flex size-4 items-center justify-center rounded-full bg-[#4c9e78] text-white"><Check className="size-2.5" /></span>已确认 AI 评分无异议</span>
                <button onClick={startObjection} className="rounded-lg border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#6b7a89] transition hover:bg-[#f2f5f9]">改为有异议</button>
              </div>
            )}
            </div>
          </div>

          {/* 修改意见：卡片头部固定，卡片内正文独立滚动（滚动条内嵌卡片） */}
          {objecting && (
            <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"><Pencil className="size-4" /></div>
                  <span className="text-[12px] font-semibold text-[#333f4c]">修改意见</span>
                </div>
                {submitted
                  ? <span className="flex items-center gap-1 rounded-full bg-[#eaf7f0] px-2 py-0.5 text-[10px] font-medium text-[#27955d]"><span className="size-1.5 rounded-full bg-[#34a36a]" />已提交异议</span>
                  : <span className="flex items-center gap-1 rounded-full bg-[#fdf4e6] px-2 py-0.5 text-[10px] font-medium text-[#e59735]"><span className="size-1.5 rounded-full bg-[#e59735]" />异议草稿（待提交）</span>}
              </div>
              <div className={`min-h-0 flex-1 overflow-auto p-4 ${scrollCls}`}>
              {editing ? (
                <div className="space-y-3.5">
                  {involvedRules.length > 0 ? (
                    <div>
                      <label className="mb-1.5 block text-[10px] text-[#8b97a3]">选择有异议的评分规则（点击规则名可跳转规则设置页修改，不再单独填写原因）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {involvedRules.map(r => {
                          const on = selectedRules.includes(r);
                          return (
                            <div key={r} className={`flex items-center gap-1 rounded-full px-1 py-0.5 transition ${on ? "bg-[#4b7ff0] shadow-[0_2px_6px_rgba(75,127,240,.28)]" : "bg-[#eef1f5]"}`}>
                              <button onClick={() => toggleRule(r)} className={`rounded-full px-2 py-0.5 text-[10px] ${on ? "font-medium text-white" : "text-[#6b7a89]"}`}>{on ? "✓ " : ""}{r}</button>
                              <button onClick={() => goToRuleFromObjection(r)} title="去规则设置页修改该规则" className={`grid size-4 place-items-center rounded-full ${on ? "text-white/90 hover:bg-white/20" : "text-[#8b97a3] hover:bg-[#dfe4ea]"}`}>
                                <SlidersHorizontal className="size-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#f7f9fb] px-3 py-2.5 text-[10px] leading-relaxed text-[#8b96a3]">本次会话 AI 未涉及任何扣分规则。你仍可对该客服的整体表现提出修改意见，请直接填写应有总分与整体意见。</div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[10px] text-[#8b97a3]">该客服应有的总分{reran && <span className="ml-1 text-[#4b7ff0]">（重运行已建议 {preview.newScore} 分，可调整）</span>}</label>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={100} value={score}
                        onChange={e => { setScore(e.target.value); if (err) setErr(""); }}
                        placeholder="0 - 100"
                        className="h-9 w-24 rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 text-[13px] font-semibold text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                      <span className="text-[10px] text-[#8b97a3]">分</span>
                    </div>
                  </div>

                  {needDeducted && (
                    <div>
                      <label className="mb-1.5 block text-[10px] text-[#8b97a3]">该客服实际扣分的规则<span className="ml-1 text-[#a8b2be]">（未满分，请指出实际失分的规则；可多选，涵盖全部质检规则）</span></label>
                      {/* 统一为一个「标签输入框」：已选胶囊内嵌其中，末尾内联「+ 添加」触发，下拉从下方弹出 */}
                      <div className="relative">
                        <div
                          onClick={() => { if (!deductPickerOpen) { setDeductPickerOpen(true); setDeductSearch(""); } }}
                          className={`flex min-h-9 cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-[#fafbfd] px-2 py-1.5 transition ${deductPickerOpen ? "border-[#4b7ff0] bg-white" : "border-[#dbe3ee] hover:border-[#c3d0e0]"}`}>
                          {deductedRules.map(r => (
                            <span key={r} className="flex items-center gap-1 rounded-lg bg-[#fdf4e6] py-0.5 pl-2 pr-1 text-[10px] text-[#b9791d]">
                              <span className="font-medium">{r}</span>
                              {ruleScoreMap[r] && <span className="font-semibold text-[#a3701a]">{ruleScoreMap[r]}</span>}
                              <button onClick={e => { e.stopPropagation(); toggleDeducted(r); }} className="grid size-3.5 place-items-center rounded text-[#c99a4e] hover:bg-[#f2e2c4] hover:text-[#8a5e10]"><X className="size-2.5" /></button>
                            </span>
                          ))}
                          <span className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] text-[#8b97a3]">
                            <Plus className="size-3" />{deductedRules.length > 0 ? "添加" : "点击选择扣分规则"}
                          </span>
                        </div>
                        {deductPickerOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setDeductPickerOpen(false)} />
                            <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-[#dde5ee] bg-white shadow-[0_12px_32px_rgba(41,53,66,.16)]">
                              <div className="border-b border-[#eef1f4] p-2">
                                <input autoFocus value={deductSearch} onChange={e => setDeductSearch(e.target.value)}
                                  placeholder="搜索规则名称…"
                                  className="h-7 w-full rounded-lg border border-[#e2e8f0] bg-[#fafbfd] px-2.5 text-[10px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] focus:bg-white" />
                              </div>
                              <div className="max-h-[180px] overflow-auto p-1.5">
                                {(() => {
                                  const kw = deductSearch.trim();
                                  const groups = ruleGroups
                                    .map(g => ({ ...g, rules: g.rules.filter(r => r.title.includes(kw)) }))
                                    .filter(g => g.rules.length > 0);
                                  if (groups.length === 0) return <div className="px-2 py-5 text-center text-[10px] text-[#b0bbc8]">未找到匹配的规则</div>;
                                  return groups.map(g => (
                                    <div key={`${g.scope}-${g.name}`} className="mb-1.5 last:mb-0">
                                      <div className="flex items-center gap-1.5 px-2 py-1">
                                        <span className={`rounded px-1 py-px text-[8px] font-medium ${g.scope === "通用" ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#eef7f1] text-[#3d8f63]"}`}>{g.scope}</span>
                                        <span className="text-[9px] font-medium text-[#98a3af]">{g.name}</span>
                                      </div>
                                      {g.rules.map(r => {
                                        const on = deductedRules.includes(r.title);
                                        return (
                                          <button key={r.title} onClick={() => toggleDeducted(r.title)}
                                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition ${on ? "bg-[#fdf4e6]" : "hover:bg-[#f4f6fa]"}`}>
                                            <span className={`grid size-3.5 shrink-0 place-items-center rounded-md border transition ${on ? "border-[#e59735] bg-[#e59735] text-white" : "border-[#cdd6e0] bg-white"}`}>{on && <Check className="size-2.5" />}</span>
                                            <span className={`flex-1 truncate ${on ? "font-medium text-[#b9791d]" : "text-[#5a6675]"}`}>{r.title}</span>
                                            {r.score && <span className={`shrink-0 text-[10px] font-semibold ${on ? "text-[#b9791d]" : "text-[#c56a63]"}`}>{r.score}</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ));
                                })()}
                              </div>
                              <div className="flex items-center justify-between border-t border-[#eef1f4] bg-[#fafbfd] px-2.5 py-1.5">
                                <span className="text-[9px] text-[#a8b2be]">已选 {deductedRules.length} 项</span>
                                <button onClick={() => setDeductPickerOpen(false)} className="rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[9px] font-medium text-white hover:bg-[#3d6fe0]">完成</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[10px] text-[#8b97a3]">对 AI 评分的意见</label>
                    <textarea value={detail} ref={detailRef}
                      onChange={e => { setDetail(e.target.value); if (err) setErr(""); }}
                      rows={3}
                      placeholder="期待听听您的专业意见——对上述每条规则，您认为应扣多少分？以及是否有需要调整的地方？"
                      className="w-full resize-none overflow-hidden rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] text-[#8b97a3]">对人工客服评分备注<span className="ml-1 text-[#a8b2be]">（选填）</span></label>
                    <textarea value={agentNote} ref={noteRef}
                      onChange={e => setAgentNote(e.target.value)}
                      rows={3}
                      placeholder="针对该客服本次表现的评分说明、改进建议等（将随最终结果反馈给客服）"
                      className="w-full resize-none overflow-hidden rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                  </div>

                  {err && <div className="flex items-center gap-1 text-[10px] text-[#d75d5d]"><AlertCircle className="size-3" />{err}</div>}

                  <div className="flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                    <button onClick={agreeNoIssue} className="mr-auto text-[10px] text-[#8b97a3] transition hover:text-[#6b7a89]">撤销异议，改为认可</button>
                    <button onClick={submitObjection} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#5a8bf5] to-[#4b7ff0] px-4 py-2 text-[11px] font-medium text-white shadow-[0_4px_10px_rgba(75,127,240,.24)] transition hover:brightness-105"><Check className="size-3.5" />提交异议</button>
                  </div>
                </div>
              ) : (
                /* 已提交：只读展示，点「更新异议」才可编辑 */
                <div className="space-y-3.5">
                  {review!.objectedRules.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[10px] text-[#8b97a3]">有异议的评分规则</div>
                      <div className="flex flex-wrap gap-1.5">
                        {review!.objectedRules.map(r => (
                          <span key={r} className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-medium text-[#4b7ff0]">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">该客服应有的总分</div>
                    <span className={`text-[18px] font-bold ${Number(review!.suggestedScore) >= 90 ? "text-[#27955d]" : Number(review!.suggestedScore) >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{review!.suggestedScore}<span className="ml-0.5 text-[10px] font-normal text-[#a8b2be]">分</span></span>
                  </div>
                  {review!.deductedRules.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[10px] text-[#8b97a3]">该客服实际扣分的规则</div>
                      <div className="flex flex-wrap gap-1.5">
                        {review!.deductedRules.map(r => (
                          <span key={r} className="flex items-center gap-1.5 rounded-full bg-[#fdf4e6] px-2.5 py-1 text-[10px] text-[#b9791d]">
                            <span className="font-medium">{r}</span>
                            {ruleScoreMap[r] && <span className="rounded-full bg-[#f6e3c2] px-1.5 py-px text-[9px] font-semibold text-[#a3701a]">{ruleScoreMap[r]}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">对 AI 评分的意见</div>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#f7f9fb] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a]">{review!.detail || "—"}</div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">对人工客服评分备注</div>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#f7f9fb] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a]">{review!.agentNote || "—"}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                    <button onClick={agreeNoIssue} className="mr-auto text-[10px] text-[#8b97a3] transition hover:text-[#6b7a89]">撤销异议，改为认可</button>
                    <button onClick={editObjection} className="flex items-center gap-1.5 rounded-xl border border-[#d9e2ee] bg-white px-3 py-2 text-[10px] text-[#4b7ff0] transition hover:bg-[#eef5ff]"><Pencil className="size-3" />更新异议</button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportView({ taskName, ruleVersion, complaints, reviews, aiVersion, commonCats, privateCats, principles, applied, onBack, onApply }: { taskName: string; ruleVersion: string; complaints: Complaint[]; reviews: Record<string, Review>; aiVersion: number; commonCats: Cat[]; privateCats: Cat[]; principles: Principle[]; applied: boolean; onBack: () => void; onApply: () => void }) {
  const objectionCount = complaints.filter(c => { const r = reviews[c.id]; return r && !r.agreed && r.submitted; }).length;
  const agreedCount = complaints.filter(c => reviews[c.id]?.agreed).length;

  // 生成维度调整建议（修改/新增/删除），修改/删除按存疑概率从高到低
  const dimOps = buildDimOps(complaints, reviews, commonCats, privateCats);
  const principleOps = dimOps.length > 0 ? suggestPrincipleOps(principles) : [];
  const hasChanges = dimOps.length > 0 || principleOps.length > 0;

  // 报告生成进度模拟：loading → done（或 error，可重新生成）
  const [phase, setPhase] = useState<"loading" | "done" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const genSteps = ["正在汇总客诉复审数据…", "正在比对 AI 评分与人工意见…", "正在分析评分维度偏差…", "正在生成优化建议…"];
  const [stepIdx, setStepIdx] = useState(0);

  function regenerate() {
    setPhase("loading");
    setProgress(0);
    setStepIdx(0);
    setAttempt(a => a + 1);
  }

  useEffect(() => {
    setPhase("loading");
    setProgress(0);
    setStepIdx(0);
    // 首次进入必定失败，点「重新生成」后必定成功（原型演示用）
    const willFail = attempt === 0;
    const timer = setInterval(() => {
      setProgress(p => {
        const next = Math.min(100, p + (8 + Math.floor(Math.random() * 10)));
        setStepIdx(Math.min(genSteps.length - 1, Math.floor((next / 100) * genSteps.length)));
        if (next >= 100) {
          clearInterval(timer);
          setTimeout(() => setPhase(willFail ? "error" : "done"), 250);
        }
        return willFail ? Math.min(next, 80) : next;
      });
    }, 320);
    // 失败场景：走到 80% 卡住后判定失败
    const failTimer = willFail ? setTimeout(() => { clearInterval(timer); setPhase("error"); }, 2200) : undefined;
    return () => { clearInterval(timer); if (failTimer) clearTimeout(failTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (phase !== "done") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex h-[58px] items-center justify-between gap-3 border-b border-[#e2e6eb] bg-white px-5">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
              <ChevronRight className="size-3 rotate-180" />返回
            </button>
            <div>
              <h1 className="text-[15px] font-semibold text-[#2f3b48]">复审报告 · {taskName}</h1>
              <p className="mt-0.5 text-[10px] text-[#8b96a3]">{phase === "loading" ? "报告生成中，请稍候…" : "报告生成失败"}</p>
            </div>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 place-items-center p-5">
          {phase === "loading" ? (
            <div className="w-full max-w-[360px] text-center">
              <RefreshCw className="mx-auto mb-4 size-8 animate-spin text-[#4b7ff0]" />
              <div className="mb-3 text-[12px] font-medium text-[#3e4c5a]">正在生成复审报告</div>
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-[#e9eef5]">
                <div className="h-full rounded-full bg-[#4b7ff0] transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#8b97a3]">
                <span>{genSteps[stepIdx]}</span>
                <span>{progress}%</span>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[360px] text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[#fdeeee]">
                <X className="size-6 text-[#d75d5d]" />
              </div>
              <div className="mb-1 text-[13px] font-semibold text-[#3e4c5a]">报告生成失败</div>
              <div className="mb-4 text-[11px] leading-relaxed text-[#8b97a3]">生成过程中发生异常，可能是网络或服务波动。请点击下方按钮重新生成。</div>
              <button onClick={regenerate}
                className="mx-auto flex items-center gap-1.5 rounded-md bg-[#4b7ff0] px-4 py-2 text-[12px] font-medium text-white transition hover:bg-[#3f72e0]">
                <RefreshCw className="size-3.5" />重新生成报告
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between gap-3 border-b border-[#e2e6eb] bg-white px-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
            <ChevronRight className="size-3 rotate-180" />返回
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-[#2f3b48]">复审报告 · {taskName}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#8b96a3]">
              <span className="inline-flex items-center rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 font-medium text-[#3d6fe0]" title="本报告依据任务创建时锁定的规则版本生成，与打分口径一致">依据规则 {ruleVersion}</span>
              <span>共 {complaints.length} 条客诉复审完毕（{agreedCount} 条认可 AI 评分，{objectionCount} 条提出修改意见），涉及 {dimOps.length} 条评分维度、{principleOps.length} 条评分原则需优化</span>
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[640px] space-y-3">
          {applied && (
            <div className="flex items-start gap-2 rounded-lg border border-[#cfe6d9] bg-[#eef8f2] px-4 py-2.5 text-[11px] leading-relaxed text-[#27955d]">
              <ClipboardCheck className="mt-0.5 size-4 shrink-0" />
              <span>已按本报告建议自动修改规则设置中的通用/专用规则与评分原则，并按新规则重新评分（当前 AI 评分 v{aiVersion}）。返回复核结果可见：被判扣分不合理的规则不再扣分，你的意见与分数仍完整保留。可前往「规则设置」查看被修改的判断标准。</span>
            </div>
          )}

          {/* 一、复审总结 */}
          <div className="rounded-lg border border-[#dbe6f6] bg-[#f6f9ff] px-4 py-3 text-[11px] leading-relaxed text-[#4d5966]">
            <div className="mb-1 font-semibold text-[#3562c8]">一、复审总结</div>
            {!hasChanges ? (
              <span className="text-[#6b7a89]">本日共 {complaints.length} 条客诉全部完成人工复审，质检人员对 AI 评分均予认可，未发现需要调整的规则或评分原则，AI 当前判定与人工判断一致。</span>
            ) : (
              <span className="text-[#6b7a89]">本日共 {complaints.length} 条客诉完成人工复审，其中 {agreedCount} 条认可 AI 评分、{objectionCount} 条提出修改意见。人工复审反映出 AI 在若干评分维度上判定与人工存在偏差：部分维度高频误扣需收紧或删除，个别场景 AI 存在漏扣需补充维度。综合来看，AI 评分整体方向可用，但需按下列建议调整评分维度（修改/新增/删除）并同步优化评分原则，使自动评分进一步贴合人工判断。</span>
            )}
          </div>

          {/* 二、建议调整的评分维度（修改/新增/删除） */}
          {dimOps.length > 0 && (
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[#35414e]">二、建议调整的评分维度</span>
                <span className="text-[10px] text-[#98a3af]">修改/删除按存疑概率从高到低</span>
              </div>
              <div className="space-y-2.5">
                {dimOps.map((e, idx) => {
                  const opColor = e.op === "新增" ? "bg-[#e6f4ee] text-[#27955d]" : e.op === "删除" ? "bg-[#fdeceb] text-[#d75d5d]" : "bg-[#eef4ff] text-[#4b7ff0]";
                  return (
                    <div key={`${e.op}-${e.title}`} className="rounded-md border border-[#e6edf6] bg-[#fbfcfe] p-3">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f0f2f5] text-[10px] font-semibold text-[#6b7a89]">{idx + 1}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${opColor}`}>{e.op}</span>
                        <span className="rounded bg-[#eef4ff] px-2 py-0.5 text-[11px] font-medium text-[#4b7ff0]">{e.title}</span>
                        <span className="rounded-full bg-[#f0f2f5] px-1.5 py-0.5 text-[9px] text-[#6b7a89]">{e.scope}规则 · {e.catName}</span>
                        {e.op !== "新增" && (
                          <span className="ml-auto flex items-center gap-1 text-[10px]">
                            <span className="text-[#98a3af]">存疑概率</span>
                            <span className={`font-semibold ${e.prob >= 60 ? "text-[#d75d5d]" : e.prob >= 30 ? "text-[#e59735]" : "text-[#4b7ff0]"}`}>{e.prob}%</span>
                          </span>
                        )}
                      </div>
                      {e.op !== "新增" && (
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef1f5]">
                            <div className={`h-full rounded-full ${e.prob >= 60 ? "bg-[#d75d5d]" : e.prob >= 30 ? "bg-[#e59735]" : "bg-[#4b7ff0]"}`} style={{ width: `${e.prob}%` }} />
                          </div>
                          <span className="text-[9px] text-[#98a3af]">{e.freq} 次被推翻</span>
                        </div>
                      )}
                      <div className="mb-1.5 rounded bg-[#f7f9fb] px-2 py-1 text-[9px] leading-relaxed text-[#8794a0]">{e.reason}</div>
                      {e.op === "修改" && (
                        <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                          <span className="text-[#8794a0]">维度名称</span>
                          <span className="font-medium text-[#465260]">{e.title}</span>
                          <span className="text-[#8794a0]">现判断标准</span>
                          <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{e.oldCriteria || "—"}</span>
                          <span className="text-[#8794a0]">建议改为</span>
                          <span className="leading-relaxed text-[#27955d]">{e.newCriteria}</span>
                        </div>
                      )}
                      {e.op === "新增" && (
                        <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                          <span className="text-[#8794a0]">维度名称</span>
                          <span className="font-medium text-[#465260]">{e.title}{e.score ? `（${e.score} 分）` : ""}</span>
                          <span className="text-[#8794a0]">说明</span>
                          <span className="leading-relaxed text-[#4d5966]">{e.standard || "—"}</span>
                          <span className="text-[#8794a0]">判断标准</span>
                          <span className="leading-relaxed text-[#27955d]">{e.newCriteria}</span>
                        </div>
                      )}
                      {e.op === "删除" && (
                        <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                          <span className="text-[#8794a0]">现判断标准</span>
                          <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{e.oldCriteria || "—"}</span>
                          <span className="text-[#8794a0]">处理</span>
                          <span className="leading-relaxed text-[#d75d5d]">建议整体删除该维度，后续不再据此扣分。</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 三、建议调整的评分原则 */}
          {principleOps.length > 0 && (
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 text-[12px] font-semibold text-[#35414e]">三、建议调整的评分原则</div>
              <div className="space-y-2">
                {principleOps.map((op, i) => (
                  <div key={i} className="rounded-md border border-[#e6edf6] bg-[#fbfcfe] p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${op.op === "新增" ? "bg-[#e6f4ee] text-[#27955d]" : op.op === "删除" ? "bg-[#fdeceb] text-[#d75d5d]" : "bg-[#eef4ff] text-[#4b7ff0]"}`}>{op.op}</span>
                      <span className="text-[11px] font-medium text-[#465260]">{op.title}</span>
                    </div>
                    {op.op === "修改" && (
                      <div className="grid grid-cols-[52px_1fr] gap-x-2 gap-y-1 text-[10px]">
                        <span className="text-[#8794a0]">原内容</span>
                        <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{op.oldContent}</span>
                        <span className="text-[#8794a0]">改为</span>
                        <span className="leading-relaxed text-[#27955d]">{op.newContent}</span>
                      </div>
                    )}
                    {op.op === "新增" && <div className="text-[10px] leading-relaxed text-[#27955d]">{op.newContent}</div>}
                    {op.op === "删除" && <div className="text-[10px] leading-relaxed text-[#8a5a5a]">建议删除该原则：{op.oldContent}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Dim = { title: string; score: string; standard: string; criteria: string };
type Cat = { name: string; expanded: boolean; enabled: boolean; renaming: boolean; dimensions: Dim[] };
type NewDimDraft = { title: string; score: string; standard: string; criteria: string };

// —— 规则版本管理 ——
const MAX_VERSIONS = 30;
type RuleVersion = { id: string; seq: number; note: string; author: string; savedAt: string; commonCats: Cat[]; privateCats: Cat[]; principles: Principle[] };
const stripCat = (c: Cat) => ({ name: c.name, enabled: c.enabled, dimensions: c.dimensions.map(d => ({ ...d })) });
// 仅比较规则内容，忽略展开/重命名等 UI 状态。
const rulesFingerprint = (common: Cat[], priv: Cat[], principles: Principle[]) =>
  JSON.stringify({ c: common.map(stripCat), p: priv.map(stripCat), r: principles });
// 载入某版本内容为工作副本时，重置 UI 状态。
const hydrateCat = (c: Cat): Cat => ({ name: c.name, enabled: c.enabled, expanded: false, renaming: false, dimensions: c.dimensions.map(d => ({ ...d })) });
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtVersionTime = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function RulesList({
  label,
  sublabel,
  cats,
  setCats,
  targetRuleName,
  targetEditable,
  onTargetConsumed,
  onRulesModified,
  readOnly,
}: {
  label: string;
  sublabel: string;
  cats: Cat[];
  setCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  targetRuleName?: string | null;
  targetEditable?: boolean;
  onTargetConsumed?: () => void;
  onRulesModified?: () => void;
  readOnly?: boolean;
}) {
  const [menuOpenIdx, setMenuOpenIdx] = useState<number | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [editingKey, setEditingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [viewingKey, setViewingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [dimDrafts, setDimDrafts] = useState<Record<string, Dim>>({});
  const [addingDim, setAddingDim] = useState<number | null>(null);
  const emptyDraft: NewDimDraft = { title: "", score: "", standard: "", criteria: "" };
  const [newDimDraft, setNewDimDraft] = useState<NewDimDraft>(emptyDraft);
  const dimRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => {
    if (!targetRuleName) return;
    for (let ci = 0; ci < cats.length; ci++) {
      for (let di = 0; di < cats[ci].dimensions.length; di++) {
        if (cats[ci].dimensions[di].title === targetRuleName) {
          const key = `${ci}-${di}`;
          setCats(prev => prev.map((c, i) => i === ci ? { ...c, expanded: true } : c));
          if (targetEditable) {
            const dim = cats[ci].dimensions[di];
            setDimDrafts(prev => ({ ...prev, [key]: { title: dim.title, score: dim.score, standard: dim.standard, criteria: dim.criteria } }));
            setEditingKey({ cat: ci, dim: di });
            setViewingKey(null);
          } else {
            setEditingKey(null);
            setViewingKey({ cat: ci, dim: di });
          }
          setAddingDim(null);
          onTargetConsumed?.();
          setTimeout(() => dimRowRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
          return;
        }
      }
    }
  }, [targetRuleName]);

  function updateCat(idx: number, patch: Partial<Cat>) {
    setCats(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function deleteCat(idx: number) {
    setCats(prev => prev.filter((_, i) => i !== idx));
    if (editingKey?.cat === idx) setEditingKey(null);
    if (addingDim === idx) setAddingDim(null);
  }
  function deleteDim(catIdx: number, dimIdx: number) {
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : { ...c, dimensions: c.dimensions.filter((_, di) => di !== dimIdx) }));
    if (editingKey?.cat === catIdx && editingKey?.dim === dimIdx) setEditingKey(null);
    onRulesModified?.();
  }
  function addCat() {
    setCats(prev => [...prev, { name: "", expanded: false, enabled: true, renaming: true, dimensions: [] }]);
    setCatNameDraft("");
  }
  function saveDim(catIdx: number, dimIdx: number, draft: Dim) {
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : {
      ...c,
      dimensions: c.dimensions.map((d, di) => di !== dimIdx ? d : { ...d, ...draft }),
    }));
    setEditingKey(null);
    onRulesModified?.();
  }
  function saveNewDim(catIdx: number) {
    if (!newDimDraft.title.trim()) return;
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : {
      ...c,
      dimensions: [...c.dimensions, { ...newDimDraft }],
    }));
    setAddingDim(null);
    setNewDimDraft(emptyDraft);
    onRulesModified?.();
  }

  return (
    <div className="rounded-lg border border-[#e1e5e9] bg-white" onClick={() => setMenuOpenIdx(null)}>
      {/* 表头 */}
      <div className="flex items-center justify-between border-b border-[#e8ecf0] px-4 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#35414e]">{label}</div>
          <div className="mt-0.5 text-[10px] text-[#909ba6]">{sublabel}</div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); addCat(); }}
          className={`flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff] ${readOnly ? "hidden" : ""}`}
        >
          <Plus className="size-3.5"/>添加
        </button>
      </div>

      {/* 空状态 */}
      {cats.length === 0 && (
        <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无规则门类，点击右上角「添加」新建</div>
      )}

      {/* 一级门类列表 */}
      {cats.map((cat, catIdx) => (
        <div key={catIdx} className="border-b border-[#eef1f4] last:border-b-0">
          {/* 门类标题行 */}
          <div className="flex items-center gap-3 bg-[#fafbfc] px-4 py-2.5">
            <button onClick={() => updateCat(catIdx, { expanded: !cat.expanded })} className="grid size-5 place-items-center rounded text-[#718094] hover:bg-[#e9eef5]">
              <ChevronRight className={`size-4 transition-transform ${cat.expanded ? "rotate-90" : ""}`}/>
            </button>
            <div className="min-w-0 flex-1">
              {cat.renaming ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={catNameDraft}
                    onChange={e => setCatNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && catNameDraft.trim()) updateCat(catIdx, { name: catNameDraft.trim(), renaming: false });
                      if (e.key === "Escape") { if (!cat.name) deleteCat(catIdx); else updateCat(catIdx, { renaming: false }); }
                    }}
                    placeholder="输入门类名称…"
                    className="h-6 w-36 rounded border border-[#4b7ff0] bg-white px-2 text-[12px] font-semibold text-[#3e4a57] outline-none placeholder-[#b5bfc9]"
                  />
                  <button onClick={() => { if (catNameDraft.trim()) updateCat(catIdx, { name: catNameDraft.trim(), renaming: false }); }} className="rounded bg-[#4b7ff0] px-1.5 py-0.5 text-[10px] text-white disabled:opacity-50">确认</button>
                  <button onClick={() => { if (!cat.name) deleteCat(catIdx); else updateCat(catIdx, { renaming: false }); }} className="text-[10px] text-[#a0acb8]">取消</button>
                </div>
              ) : (
                <div className="text-[12px] font-semibold text-[#3e4a57]">{cat.name}</div>
              )}
              {!cat.renaming && <div className="mt-0.5 text-[10px] text-[#8b97a3]">{cat.dimensions.length} 个二级维度</div>}
            </div>
            <div className={`relative ${readOnly ? "hidden" : ""}`} onClick={e => e.stopPropagation()}>
              <button onClick={() => setMenuOpenIdx(menuOpenIdx === catIdx ? null : catIdx)} className="text-[#84919e] hover:text-[#3e4c5a]">
                <MoreHorizontal className="size-4"/>
              </button>
              {menuOpenIdx === catIdx && (
                <div className="absolute right-0 top-6 z-20 w-[100px] rounded-md border border-[#dde5ee] bg-white shadow-lg">
                  <button onClick={() => { setCatNameDraft(cat.name); updateCat(catIdx, { renaming: true, expanded: true }); setMenuOpenIdx(null); }} className="flex w-full items-center px-3 py-2 text-left text-[11px] text-[#3e4c5a] hover:bg-[#f4f7fb]">重命名</button>
                  <button onClick={() => { deleteCat(catIdx); setMenuOpenIdx(null); }} className="flex w-full items-center px-3 py-2 text-left text-[11px] text-[#d75d5d] hover:bg-[#fff5f5]">删除门类</button>
                </div>
              )}
            </div>
          </div>

          {/* 展开内容：二级维度 + 新增入口 */}
          {cat.expanded && (
            <div className="border-t border-[#eef1f4] bg-white">
              {/* 现有二级维度 */}
              {cat.dimensions.map((dim, dimIdx) => {
                const key = `${catIdx}-${dimIdx}`;
                const draft = dimDrafts[key];
                const isEditing = editingKey?.cat === catIdx && editingKey?.dim === dimIdx;
                const isViewing = viewingKey?.cat === catIdx && viewingKey?.dim === dimIdx;
                return (
                  <div key={dimIdx} ref={el => { dimRowRefs.current[`${catIdx}-${dimIdx}`] = el; }} className={`border-b border-[#f2f4f7] px-5 transition ${isViewing ? "bg-[#eef5ff] ring-1 ring-inset ring-[#4b7ff0]" : ""}`}>
                    {/* 维度行 */}
                    <div className="grid grid-cols-[1.6fr_2.4fr_.5fr_.55fr] items-center gap-3 py-2.5 text-[11px]">
                      <div className="font-medium text-[#465260]">{dim.title}</div>
                      <div className="truncate text-[10px] text-[#8797a5]">{dim.standard || "—"}</div>
                      <span className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-center text-[10px] text-[#d75d5d]">{dim.score} 分</span>
                      <div className="flex justify-end gap-2">
                        {readOnly ? (
                          <button
                            onClick={() => { if (isViewing) { setViewingKey(null); } else { setViewingKey({ cat: catIdx, dim: dimIdx }); setEditingKey(null); } }}
                            className={`text-[10px] ${isViewing ? "text-[#4b7ff0]" : "text-[#778695] hover:text-[#4b7ff0]"}`}
                          >{isViewing ? "收起" : "查看"}</button>
                        ) : !isViewing && (
                          <>
                            <button
                              onClick={() => {
                                if (isEditing) { setEditingKey(null); } else {
                                  setDimDrafts(prev => ({ ...prev, [key]: { title: dim.title, score: dim.score, standard: dim.standard, criteria: dim.criteria } }));
                                  setEditingKey({ cat: catIdx, dim: dimIdx });
                                  setViewingKey(null);
                                  setAddingDim(null);
                                }
                              }}
                              className={`text-[10px] ${isEditing ? "text-[#4b7ff0]" : "text-[#778695] hover:text-[#4b7ff0]"}`}
                            >{isEditing ? "收起" : "修改"}</button>
                            <button onClick={() => deleteDim(catIdx, dimIdx)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 只读明细（从复审跳转进入） */}
                    {isViewing && !isEditing && (
                      <div className="mb-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-[#496078]">规则明细（只读）</span>
                          <button onClick={() => setViewingKey(null)} className="text-[10px] text-[#8b97a3] hover:text-[#4b7ff0]">收起</button>
                        </div>
                        <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                          <span className="text-[#8794a0]">维度名称</span>
                          <span className="text-[#465260]">{dim.title}</span>
                          <span className="text-[#8794a0]">分值</span>
                          <span className="text-[#d75d5d]">{dim.score} 分</span>
                          <span className="text-[#8794a0]">说明</span>
                          <span className="leading-relaxed text-[#4d5966]">{dim.standard || "—"}</span>
                          <span className="text-[#8794a0]">判断标准</span>
                          <span className="leading-relaxed text-[#4d5966]">{dim.criteria || "—"}</span>
                        </div>
                      </div>
                    )}
                    {/* 配置面板 */}
                    {isEditing && draft && (
                      <div className="mb-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-[#496078]">编辑维度</span>
                          <div className="flex gap-2">
                            <button onClick={() => saveDim(catIdx, dimIdx, draft)} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white">保存</button>
                            <button onClick={() => setEditingKey(null)} className="text-[10px] text-[#8b97a3]">取消</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                          <span className="pt-1 text-[#8794a0]">维度名称</span>
                          <input value={draft.title} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], title: e.target.value } }))} className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>
                          <span className="pt-1 text-[#8794a0]">分值</span>
                          <input value={draft.score} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], score: e.target.value } }))} className="h-6 w-16 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>
                          <span className="pt-1 text-[#8794a0]">说明</span>
                          <textarea value={draft.standard} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], standard: e.target.value } }))} rows={2} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
                          <span className="pt-1 text-[#8794a0]">判断标准</span>
                          <textarea value={draft.criteria} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], criteria: e.target.value } }))} rows={2} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 新增二级维度入口 / 表单 */}
              {addingDim === catIdx ? (
                <div className="m-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#496078]">新增二级维度</span>
                    <div className="flex gap-2">
                      <button onClick={() => saveNewDim(catIdx)} disabled={!newDimDraft.title.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
                      <button onClick={() => { setAddingDim(null); setNewDimDraft(emptyDraft); }} className="text-[10px] text-[#8b97a3]">取消</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                    <span className="pt-1 text-[#8794a0]">维度名称 <span className="text-[#e59735]">*</span></span>
                    <input autoFocus value={newDimDraft.title} onChange={e => setNewDimDraft(p => ({ ...p, title: e.target.value }))} placeholder="例：敷衍用户" className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <span className="pt-1 text-[#8794a0]">分值</span>
                    <input value={newDimDraft.score} onChange={e => setNewDimDraft(p => ({ ...p, score: e.target.value }))} placeholder="-2" className="h-6 w-16 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <span className="pt-1 text-[#8794a0]">说明</span>
                    <textarea value={newDimDraft.standard} onChange={e => setNewDimDraft(p => ({ ...p, standard: e.target.value }))} rows={2} placeholder="简述该维度的质检说明…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <span className="pt-1 text-[#8794a0]">判断标准</span>
                    <textarea value={newDimDraft.criteria} onChange={e => setNewDimDraft(p => ({ ...p, criteria: e.target.value }))} rows={2} placeholder="描述如何判断扣分…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                  </div>
                </div>
              ) : !readOnly && (
                <button
                  onClick={e => { e.stopPropagation(); setAddingDim(catIdx); setEditingKey(null); setNewDimDraft(emptyDraft); }}
                  className="flex w-full items-center gap-1.5 border-t border-dashed border-[#edf0f4] py-2.5 pl-10 pr-5 text-left text-[11px] text-[#8797a5] hover:bg-[#f6f9ff] hover:text-[#4b7ff0]"
                >
                  <Plus className="size-3.5"/>新增二级{label.includes("通用") ? "通用" : "专用"}维度
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PrinciplesList({ principles, setPrinciples, readOnly }: { principles: Principle[]; setPrinciples: React.Dispatch<React.SetStateAction<Principle[]>>; readOnly?: boolean }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Principle>({ title: "", content: "" });
  const [adding, setAdding] = useState(false);

  function startEdit(idx: number) {
    setDraft({ ...principles[idx] });
    setEditingIdx(idx);
    setAdding(false);
  }
  function saveEdit(idx: number) {
    if (!draft.title.trim() || !draft.content.trim()) return;
    setPrinciples(prev => prev.map((p, i) => i === idx ? { title: draft.title.trim(), content: draft.content.trim() } : p));
    setEditingIdx(null);
  }
  function saveNew() {
    if (!draft.title.trim() || !draft.content.trim()) return;
    setPrinciples(prev => [...prev, { title: draft.title.trim(), content: draft.content.trim() }]);
    setAdding(false);
    setDraft({ title: "", content: "" });
  }
  function remove(idx: number) {
    setPrinciples(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  return (
    <div className="rounded-lg border border-[#e1e5e9] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8ecf0] px-4 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#35414e]">评分原则</div>
          <div className="mt-0.5 text-[10px] text-[#909ba6]">告诉 AI 应当如何评分的总体原则，不设分值，作为所有规则打分前的共同准则</div>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingIdx(null); setDraft({ title: "", content: "" }); }}
          className={`flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff] ${readOnly ? "hidden" : ""}`}
        >
          <Plus className="size-3.5"/>添加原则
        </button>
      </div>

      <div className="border-b border-[#eef3fa] bg-[#f8fbff] px-4 py-2.5 text-[10px] leading-relaxed text-[#7a8794]">
        这些原则会作为 AI 质检的「打分总则」，在应用每条具体规则之前统一遵循。请用清晰、可执行的自然语言描述，例如「默认满分，见问题才扣」。
      </div>

      {principles.length === 0 && !adding && (
        <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无评分原则，点击右上角「添加原则」新建</div>
      )}

      {principles.map((p, idx) => {
        const isEditing = editingIdx === idx;
        return (
          <div key={idx} className="border-b border-[#eef1f4] px-5 py-3 last:border-b-0">
            {isEditing ? (
              <div className="rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#496078]">编辑原则</span>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(idx)} disabled={!draft.title.trim() || !draft.content.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
                    <button onClick={() => setEditingIdx(null)} className="text-[10px] text-[#8b97a3]">取消</button>
                  </div>
                </div>
                <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                  <span className="pt-1 text-[#8794a0]">原则名称</span>
                  <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>
                  <span className="pt-1 text-[#8794a0]">原则说明</span>
                  <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={3} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-[10px] font-semibold text-[#4b7ff0]">{idx + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-[#465260]">{p.title}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-[#7a8794]">{p.content}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!readOnly && <button onClick={() => startEdit(idx)} className="text-[10px] text-[#778695] hover:text-[#4b7ff0]">修改</button>}
                  {!readOnly && <button onClick={() => remove(idx)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {adding && (
        <div className="m-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#496078]">新增评分原则</span>
            <div className="flex gap-2">
              <button onClick={saveNew} disabled={!draft.title.trim() || !draft.content.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
              <button onClick={() => { setAdding(false); setDraft({ title: "", content: "" }); }} className="text-[10px] text-[#8b97a3]">取消</button>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
            <span className="pt-1 text-[#8794a0]">原则名称 <span className="text-[#e59735]">*</span></span>
            <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="如：默认满分，见问题才扣" className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
            <span className="pt-1 text-[#8794a0]">原则说明 <span className="text-[#e59735]">*</span></span>
            <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={3} placeholder="用清晰、可执行的自然语言描述该原则…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
          </div>
        </div>
      )}
    </div>
  );
}

function RulesPage({ commonCats, setCommonCats, privateCats, setPrivateCats, principles, setPrinciples, targetRuleName, targetEditable, onTargetConsumed, onRulesModified, showBack, onBack, readOnly, versions, latestVersion, totalSeq, isDirty, viewingVersionId, setViewingVersionId, onSaveVersion, onDiscardChanges, onRestoreVersion }: {
  commonCats: Cat[]; setCommonCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  privateCats: Cat[]; setPrivateCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  principles: Principle[]; setPrinciples: React.Dispatch<React.SetStateAction<Principle[]>>;
  targetRuleName: string | null; targetEditable: boolean; onTargetConsumed: () => void;
  onRulesModified: () => void;
  showBack?: boolean;
  onBack?: () => void;
  readOnly?: boolean;
  versions: RuleVersion[]; latestVersion: RuleVersion; totalSeq: number; isDirty: boolean;
  viewingVersionId: string | null; setViewingVersionId: (id: string | null) => void;
  onSaveVersion: (note: string) => void; onDiscardChanges: () => void; onRestoreVersion: (id: string) => void;
}) {
  const inCommon = targetRuleName ? commonCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const inPrivate = targetRuleName ? privateCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const [tab, setTab] = useState<"common" | "private" | "principle">("common");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState("");

  React.useEffect(() => {
    if (targetRuleName) {
      if (inCommon) setTab("common");
      else if (inPrivate) setTab("private");
    }
  }, [targetRuleName]);

  // 正在查看的历史版本（若有）——预览时用它的内容并强制只读。
  const previewVersion = viewingVersionId ? versions.find(v => v.id === viewingVersionId) ?? null : null;
  const isPreview = !!previewVersion;
  const canEdit = !readOnly && !isPreview;
  // 预览用本地副本：内容只读，但需要可展开/收起门类，故给一份可变的 UI 副本。
  const [previewCommon, setPreviewCommon] = useState<Cat[]>([]);
  const [previewPrivate, setPreviewPrivate] = useState<Cat[]>([]);
  React.useEffect(() => {
    if (previewVersion) {
      setPreviewCommon(previewVersion.commonCats.map(hydrateCat));
      setPreviewPrivate(previewVersion.privateCats.map(hydrateCat));
    }
  }, [viewingVersionId]);
  const shownCommon = isPreview ? previewCommon : commonCats;
  const shownPrivate = isPreview ? previewPrivate : privateCats;
  const shownPrinciples = previewVersion ? previewVersion.principles : principles;

  function confirmSave() {
    onSaveVersion(saveNote);
    setSaveNote("");
    setSaveOpen(false);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-[#2f3b48]">
            质检规则管理
            {readOnly && <span className="rounded-full bg-[#f0f2f5] px-2 py-0.5 text-[10px] font-medium text-[#98a3af]">只读</span>}
          </h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{readOnly ? "仅业务管理者/超级管理者可修改规则，你可查看全部内容" : "配置规则门类、评分维度与扣分标准"}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 历史版本入口 */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setHistoryOpen(o => !o)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#5b6b7b] hover:bg-[#f2f6fb]">
              <History className="size-3.5" />
              {isPreview ? `查看中：${previewVersion!.id}` : `当前 ${latestVersion.id}`}
              {isDirty && !isPreview && <span className="ml-0.5 rounded-full bg-[#fdeede] px-1.5 py-0.5 text-[9px] font-medium text-[#c9821f]">未保存</span>}
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-9 z-30 w-[300px] overflow-hidden rounded-lg border border-[#dde5ee] bg-white shadow-[0_12px_32px_rgba(41,53,66,.18)]">
                <div className="border-b border-[#eef1f4] px-3 py-2 text-[11px] font-semibold text-[#374350]">历史版本</div>
                <div className="max-h-[280px] overflow-auto">
                  {isDirty && (
                    <div className="flex items-center gap-2 border-b border-[#f2f4f7] bg-[#fffaf1] px-3 py-2">
                      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#e59735]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-[#b9791d]">当前有未保存的修改</div>
                        <div className="mt-0.5 text-[9px] text-[#c9a566]">保存后将生成新版本</div>
                      </div>
                    </div>
                  )}
                  {versions.map(v => {
                    const active = isPreview ? v.id === viewingVersionId : v.id === latestVersion.id && !isDirty;
                    return (
                      <button key={v.id} onClick={() => { if (v.id === latestVersion.id) setViewingVersionId(null); else setViewingVersionId(v.id); setHistoryOpen(false); }}
                        className={`flex w-full items-start gap-2 border-b border-[#f2f4f7] px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f4f7fb] ${active ? "bg-[#eef5ff]" : ""}`}>
                        <div className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${active ? "bg-[#4b7ff0] text-white" : "bg-[#eef1f4] text-transparent"}`}><Check className="size-2.5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[#3e4c5a]">{v.id}</span>
                            {v.id === latestVersion.id && <span className="rounded-full bg-[#eaf6ef] px-1.5 py-0.5 text-[9px] font-medium text-[#27955d]">最新</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-[#5b6b7b]" title={v.note}>{v.note}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-[#98a3af]"><Clock className="size-2.5" />{v.savedAt} · {v.author}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {totalSeq - versions.length > 0 && (
                  <div className="border-t border-[#eef1f4] bg-[#fafbfc] px-3 py-2 text-[9px] leading-relaxed text-[#a8b2be]">
                    已累计提交 {totalSeq} 个版本，仅保留最近 {MAX_VERSIONS} 个；更早的 {totalSeq - versions.length} 个版本（v1 ~ v{totalSeq - versions.length}）已自动清理。
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 保存入口统一收敛到下方「未保存修改」提示条，避免重复 */}
          {showBack && onBack && (
            <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#4b7ff0] bg-[#eaf2ff] px-2.5 py-1.5 text-[10px] font-medium text-[#3562c8] hover:bg-[#dceeff]">
              <ChevronRight className="size-3 rotate-180" />返回复核结果
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5" onClick={() => setHistoryOpen(false)}>
        {/* 预览历史版本提示条 */}
        {isPreview && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#d5e0f5] bg-[#eef5ff] px-4 py-2.5 text-[11px] text-[#3562c8]">
            <History className="size-4 shrink-0" />
            <span className="flex-1">正在查看历史版本 <b>{previewVersion!.id}</b>（{previewVersion!.note}），仅供浏览，不影响当前生效的规则。</span>
            {!readOnly && (
              <button onClick={() => onRestoreVersion(previewVersion!.id)} className="flex items-center gap-1 rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">
                <RotateCcw className="size-3" />回滚到此版本
              </button>
            )}
            <button onClick={() => setViewingVersionId(null)} className="rounded-md border border-[#c9d8ee] bg-white px-2.5 py-1 text-[10px] text-[#3562c8] hover:bg-[#f2f6fb]">退出查看</button>
          </div>
        )}
        {/* 未保存修改提示条 */}
        {canEdit && isDirty && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#f0dcb8] bg-[#fffaf1] px-4 py-2.5 text-[11px] text-[#b9791d]">
            <span className="size-1.5 shrink-0 rounded-full bg-[#e59735]" />
            <span className="flex-1">规则已修改但尚未保存为版本。</span>
            <button onClick={() => { setSaveNote(""); setSaveOpen(true); }} className="rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">保存为新版本</button>
            <button onClick={onDiscardChanges} className="rounded-md border border-[#e6d3ad] bg-white px-2.5 py-1 text-[10px] text-[#b9791d] hover:bg-[#fff4e2]">放弃修改</button>
          </div>
        )}
        <div className="mb-3 flex w-fit rounded-md border border-[#dfe5ea] bg-white p-0.5">
          <button onClick={() => setTab("principle")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "principle" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>评分原则</button>
          <button onClick={() => setTab("common")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "common" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>通用质检规则列表</button>
          <button onClick={() => setTab("private")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "private" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>专用质检规则列表</button>
        </div>
        {tab === "common" ? (
          <RulesList label="通用规则" sublabel="适用于全部客服会话的基础质检要求" cats={shownCommon} setCats={isPreview ? setPreviewCommon : setCommonCats} targetRuleName={tab === "common" && !isPreview ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={!canEdit}/>
        ) : tab === "private" ? (
          <RulesList label="专用规则" sublabel="仅对指定业务线、活动或场景生效" cats={shownPrivate} setCats={isPreview ? setPreviewPrivate : setPrivateCats} targetRuleName={tab === "private" && !isPreview ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={!canEdit}/>
        ) : (
          <PrinciplesList principles={shownPrinciples} setPrinciples={setPrinciples} readOnly={!canEdit}/>
        )}
      </div>

      {/* 保存新版本弹窗 */}
      {saveOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={() => setSaveOpen(false)}>
          <div className="w-full max-w-[380px] rounded-xl bg-white p-5 shadow-[0_20px_50px_rgba(41,53,66,.28)]" onClick={e => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-[#2f3b48]"><Check className="size-4 text-[#4b7ff0]" />保存为新版本</div>
            <p className="mb-3 text-[10px] leading-relaxed text-[#8b96a3]">当前修改将保存为 <b className="text-[#4b7ff0]">v{latestVersion.seq + 1}</b>，历史版本仍可随时查看或恢复。</p>
            <label className="mb-1 block text-[10px] text-[#8b97a3]">版本说明<span className="ml-1 text-[#a8b2be]">（选填，便于日后识别）</span></label>
            <textarea autoFocus value={saveNote} onChange={e => setSaveNote(e.target.value)} rows={3}
              placeholder="例：上调「精准答疑」扣分至 -5，新增「敷衍用户」维度"
              className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSaveOpen(false)} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[11px] text-[#6b7a89] hover:bg-[#f2f5f9]">取消</button>
              <button onClick={confirmSave} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3d6fe0]">确认保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AgentRecord = {
  id: string;
  complaintId: string;
  date: string;
  user: string;
  aiScore: number;
  finalScore: number;
  agreed: boolean;
  reviewer: string;
  reviewerTitle: string;
  reviewedAt: string;
  aiIssues: AiIssue[];
  finalOpinion: string;
  chat: ChatMsg[];
};

// 客服视角演示数据：均为质检方已复审完成的客诉，得分以人工复审为准。
const AGENT_RECORDS: AgentRecord[] = [
  {
    id: "r1", complaintId: "GD20241009-0087", date: "2024-10-09",
    user: "大有可为双鱼座", aiScore: 95, finalScore: 95, agreed: true,
    reviewer: "张敏", reviewerTitle: "质检人员", reviewedAt: "2024-10-10 09:18",
    aiIssues: [],
    finalOpinion: "认可 AI 评分。应答准确、主动截图指引，玩家一次即解决，表现优秀，维持满分区间。",
    chat: [
      { from: "user", text: "请问新手礼包在哪里领？", time: "09:10" },
      { from: "agent", text: "您好，进入游戏后点击右上角「福利」→「新手礼包」即可一键领取，已为您截图标注。", time: "09:11" },
      { from: "user", text: "找到了，谢谢！", time: "09:12" },
    ],
  },
  {
    id: "r2", complaintId: "GD20241009-0142", date: "2024-10-09",
    user: "用户01363539162", aiScore: 88, finalScore: 96, agreed: false,
    reviewer: "张敏", reviewerTitle: "质检人员", reviewedAt: "2024-10-10 09:25",
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「您已经问过了，规则页面都写着呢。」" },
      { rule: "答疑不清", score: "-10", quote: "「规则页面都写着呢，您再仔细看看。」" },
    ],
    finalOpinion: "复审后调整为 96 分。玩家确属重复询问、活动规则页面已有明确说明，客服引导查看规则并无明显不当，「答疑不清」一项判扣不成立，予以撤销；「缺乏耐心」保留提醒但从轻。最终以本意见为准。",
    chat: [
      { from: "user", text: "这个活动的门槛到底是充值满多少？页面写得太绕了。", time: "10:02" },
      { from: "agent", text: "您好，活动规则页面都写着呢，您再仔细看看。", time: "10:03" },
      { from: "user", text: "我看了才来问的，就是没看明白……", time: "10:04" },
      { from: "agent", text: "您已经问过了，规则页面都写着呢。", time: "10:05" },
      { from: "user", text: "行吧。", time: "10:06" },
    ],
  },
  {
    id: "r3", complaintId: "GD20241007-0231", date: "2024-10-07",
    user: "机械鲨富大傻俏", aiScore: 74, finalScore: 68, agreed: false,
    reviewer: "李伟", reviewerTitle: "业务管理者", reviewedAt: "2024-10-08 15:36",
    aiIssues: [
      { rule: "安抚不到位", score: "-2", quote: "「这是系统问题，我这边无法处理。」" },
    ],
    finalOpinion: "复审后调整为 68 分。玩家反映充值扣款未到账、情绪明显焦急，客服仅以「系统问题、无法处理」回应即结束对话，既未安抚也未告知后续处理路径（如提交工单、记录反馈），存在漏扣，故在 AI 基础上进一步下调。请后续遇到扣款类问题务必给出明确处理去向。",
    chat: [
      { from: "user", text: "我充值了但是钻石没到账，钱也扣了！", time: "20:41" },
      { from: "agent", text: "这是系统问题，我这边无法处理。", time: "20:42" },
      { from: "user", text: "那我找谁？钱不能白扣啊。", time: "20:43" },
    ],
  },
];

function AgentRecords({ currentUser }: { currentUser: Account }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const records = AGENT_RECORDS;
  const openRec = openId ? records.find(r => r.id === openId) ?? null : null;

  const scoreColor = (s: number) => s >= 90 ? "text-[#27955d]" : s >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]";
  // 按天分组，每天单独统计当天平均分——不跨天混算。
  const dates = Array.from(new Set(records.map(r => r.date))).sort((a, b) => b.localeCompare(a));
  const groups = dates.map(date => {
    const items = records.filter(r => r.date === date);
    const dayAvg = Math.round((items.reduce((a, r) => a + r.finalScore, 0) / items.length) * 10) / 10;
    return { date, items, dayAvg };
  });

  if (openRec) {
    const adjusted = openRec.finalScore !== openRec.aiScore;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5">
          <button onClick={() => setOpenId(null)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
            <ChevronRight className="size-3 rotate-180" />返回
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-[#2f3b48]">客诉详情</h1>
            <p className="mt-0.5 text-[10px] text-[#8b96a3]">客诉编号 {openRec.complaintId} · {openRec.date} · 玩家 {openRec.user}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="mx-auto max-w-[640px] space-y-3">
            {/* 最终结果（主）：人工复审为准 */}
            <div className="rounded-lg border border-[#dbe6f6] bg-white p-4">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-[#3562c8]">最终质检结果</div>
                  <div className="mt-0.5 text-[10px] text-[#8b97a3]">由质检员 {openRec.reviewer} 复审确定，为你本次客诉的实际得分</div>
                </div>
                <div className="text-right">
                  <div className={`text-[34px] font-bold leading-none ${scoreColor(openRec.finalScore)}`}>{openRec.finalScore}</div>
                  <div className="mt-1 text-[9px] text-[#98a3af]">满分 100</div>
                </div>
              </div>
              <div className="rounded-md bg-[#f6f9ff] px-3 py-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[11px] font-semibold text-white">{openRec.reviewer.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[#33465e]">{openRec.reviewer}</span>
                      <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[9px] text-[#4b7ff0]">{openRec.reviewerTitle}</span>
                    </div>
                    <div className="text-[9px] text-[#9aa4b0]">复审于 {openRec.reviewedAt}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${openRec.agreed ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#eef4ff] text-[#4b7ff0]"}`}>{openRec.agreed ? "认可 AI 评分" : "调整了 AI 评分"}</span>
                </div>
                <div className="text-[11px] leading-relaxed text-[#4d5966]">{openRec.finalOpinion}</div>
              </div>
            </div>

            {/* AI 初评（弱化、参考） */}
            <div className="rounded-lg border border-[#eaedf1] bg-[#fbfcfd] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium text-[#9aa4b0]">AI 初评（仅供参考）</span>
                <span className="rounded-full bg-[#f0f2f5] px-1.5 py-0.5 text-[9px] text-[#a6b0bc]">最终得分以人工复审为准</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#a6b0bc]">
                <span>AI 初评分</span>
                <span className={adjusted ? "text-[#b9c1cb] line-through" : "font-medium text-[#8a94a0]"}>{openRec.aiScore}</span>
                {adjusted && <span className="text-[#b9c1cb]">→ 人工复审已调整为 <span className={`font-semibold ${scoreColor(openRec.finalScore)}`}>{openRec.finalScore}</span></span>}
              </div>
              {openRec.aiIssues.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {openRec.aiIssues.map((it, i) => (
                    <div key={i} className="flex items-start gap-2 rounded bg-white px-2.5 py-1.5 text-[10px] text-[#a6b0bc]">
                      <span className="shrink-0 rounded bg-[#f2f4f7] px-1.5 py-0.5 text-[#98a3af]">{it.rule} {it.score}</span>
                      <span className="leading-relaxed">{it.quote}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-[#b0bbc8]">AI 初评未发现扣分项。</div>
              )}
            </div>

            {/* 对话记录 */}
            <div className="rounded-lg border border-[#e6ebf1] bg-white p-4">
              <div className="mb-2.5 text-[11px] font-semibold text-[#35414e]">对话记录</div>
              <div className="space-y-2">
                {openRec.chat.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-lg px-3 py-1.5 text-[11px] leading-relaxed ${m.from === "agent" ? "bg-[#eaf2ff] text-[#33465e]" : "bg-[#f2f4f7] text-[#4d5966]"}`}>
                      <div className="mb-0.5 text-[9px] text-[#9aa4b0]">{m.from === "agent" ? "客服（你）" : "玩家"} · {m.time}</div>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">个人记录</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{currentUser.name}的每日质检得分与被质检明细</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-[#e1e6eb] bg-white px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无质检结果，被质检的客诉复审完成后将显示在此</div>
        ) : (
          <div className="space-y-4">
            {groups.map(g => (
              <div key={g.date} className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
                <div className="flex items-center justify-between border-b border-[#e9edf0] bg-[#fafbfc] px-4 py-2.5">
                  <div>
                    <div className="text-[12px] font-semibold text-[#374350]">{g.date}</div>
                    <div className="mt-0.5 text-[10px] text-[#8b97a3]">当日被质检 {g.items.length} 条</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#8b97a3]">当日平均分</div>
                    <div className={`text-[18px] font-bold leading-tight ${scoreColor(g.dayAvg)}`}>{g.dayAvg}</div>
                  </div>
                </div>
                <div className="grid grid-cols-[1.4fr_1.1fr_1fr_.6fr_40px] bg-white px-4 py-2 text-[10px] text-[#8b97a3]">
                  <span>客诉编号</span><span>玩家</span><span>质检员</span><span>得分</span><span></span>
                </div>
                {g.items.map(r => (
                  <button key={r.id} onClick={() => setOpenId(r.id)}
                    className="grid w-full grid-cols-[1.4fr_1.1fr_1fr_.6fr_40px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]">
                    <span className="truncate font-medium text-[#465260]">{r.complaintId}</span>
                    <span className="truncate text-[10px] text-[#758291]">{r.user}</span>
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[9px] font-semibold text-white">{r.reviewer.slice(0, 1)}</span>
                      <span className="truncate text-[10px] text-[#5a6572]">{r.reviewer}</span>
                    </span>
                    <span className={`text-[14px] font-bold ${scoreColor(r.finalScore)}`}>{r.finalScore}</span>
                    <span className="flex justify-end text-[#c5cdd6]"><ChevronRight className="size-4" /></span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MembersPage({ accounts, onSetRole, onAddMember, onDeleteMember }: { accounts: Account[]; onSetRole: (name: string, role: Role, group?: AgentGroup) => void; onAddMember: (acc: Account) => void; onDeleteMember: (name: string) => void }) {
  const members = accounts.filter(a => a.role !== "admin");
  // 新增成员表单：姓名 + 密码 + 角色下拉 + 新增按钮；角色选「客服人员」时额外显示分组下拉。
  const roleOptions: Role[] = ["manager", "inspector", "agent"];
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("inspector");
  const [newGroup, setNewGroup] = useState<AgentGroup>("一线客服");
  const [err, setErr] = useState("");

  function submitNew() {
    const n = newName.trim();
    if (!n || !newPassword) { setErr("请填写姓名和密码"); return; }
    if (accounts.some(a => a.name === n)) { setErr("该姓名已存在，请更换"); return; }
    onAddMember({ name: n, password: newPassword, role: newRole, group: newRole === "agent" ? newGroup : undefined });
    setNewName(""); setNewPassword(""); setNewRole("inspector"); setNewGroup("一线客服"); setErr("");
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <h1 className="mb-4 text-[20px] font-semibold text-[#2f3b48]">成员管理</h1>

        {/* 新增成员工具条 */}
        <div className="mb-4 rounded-xl border border-[#e6ebf1] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(41,53,66,.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <input value={newName} onChange={e => { setNewName(e.target.value); if (err) setErr(""); }}
              placeholder="姓名"
              className="h-10 w-[200px] rounded-lg border border-[#dde3ee] bg-[#eef1f8] px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white placeholder-[#9aa6b5]" />
            <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); if (err) setErr(""); }}
              placeholder="密码"
              className="h-10 w-[200px] rounded-lg border border-[#dde3ee] bg-[#eef1f8] px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white placeholder-[#9aa6b5]" />
            <select value={newRole} onChange={e => setNewRole(e.target.value as Role)}
              className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
              {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            {newRole === "agent" && (
              <select value={newGroup} onChange={e => setNewGroup(e.target.value as AgentGroup)}
                className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
                {AGENT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <button onClick={submitNew}
              className="h-10 rounded-lg bg-[#4b7ff0] px-5 text-[13px] font-medium text-white transition hover:bg-[#3f72e0]">新增</button>
            {err && <span className="text-[12px] text-[#d75d5d]">{err}</span>}
          </div>
        </div>

        {/* 成员列表 */}
        <div className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-white shadow-[0_1px_3px_rgba(41,53,66,.04)]">
          <div className="grid grid-cols-[1fr_360px_80px] items-center border-b border-[#eef1f4] px-6 py-3 text-[13px] text-[#8b97a3]">
            <span>姓名</span><span>角色 / 客服分组</span><span className="text-right">操作</span>
          </div>
          {members.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-[#b0bbc8]">暂无成员，使用上方工具条新增成员</div>
          ) : (
            members.map(m => (
              <div key={m.name} className="grid grid-cols-[1fr_360px_80px] items-center border-b border-[#f2f4f7] px-6 py-3.5 text-[14px] last:border-b-0">
                <span className="font-medium text-[#3e4c5a]">{m.name}</span>
                <div className="flex items-center gap-2">
                  <select value={m.role} onChange={e => { const r = e.target.value as Role; onSetRole(m.name, r, r === "agent" ? (m.group ?? "一线客服") : undefined); }}
                    className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
                    {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    {!roleOptions.includes(m.role) && <option value={m.role}>{roleLabel(m.role)}</option>}
                  </select>
                  {m.role === "agent" && (
                    <select value={m.group ?? "一线客服"} onChange={e => onSetRole(m.name, "agent", e.target.value as AgentGroup)}
                      className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
                      {AGENT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                </div>
                <span className="text-right">
                  <button onClick={() => onDeleteMember(m.name)}
                    className="text-[13px] text-[#e0645f] transition hover:text-[#c94a45]">删除</button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AuthScreen({
  authView,
  setAuthView,
  accounts,
  onRegister,
  onLogin,
}: {
  authView: "login" | "register";
  setAuthView: (v: "login" | "register") => void;
  accounts: Account[];
  onRegister: (acc: Account) => void;
  onLogin: (acc: Account) => void;
}) {
  const [role, setRole] = useState<Role>("agent");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const isRegister = authView === "register";

  function switchView(v: "login" | "register") {
    setAuthView(v);
    setName("");
    setPassword("");
    setError("");
  }

  function submit() {
    const n = name.trim();
    if (!n || !password) {
      setError("请填写姓名和密码");
      return;
    }
    if (isRegister) {
      if (accounts.some(a => a.name === n)) {
        setError("该姓名已注册，请直接登录或更换姓名");
        return;
      }
      onRegister({ name: n, password, role });
    } else {
      const found = accounts.find(a => a.name === n);
      if (!found || found.password !== password) {
        setError("姓名或密码不正确");
        return;
      }
      onLogin(found);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[#f7f8fa] p-6">
      <div className="w-full max-w-[300px]">
        <div className="mb-5 flex flex-col items-center">
          <div className="mb-2 grid size-10 place-items-center rounded-lg bg-[#4d82f6] text-[18px] font-bold text-white">Q</div>
          <div className="text-[14px] font-semibold text-[#2f3b48]">质检助手</div>
          <div className="text-[10px] text-[#8b96a3]">{isRegister ? "创建账号" : "登录你的账号"}</div>
        </div>

        {isRegister && (
          <div className="mb-3">
            <div className="mb-1.5 text-[11px] text-[#5a6572]">选择角色</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole("agent")}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11px] transition ${role === "agent" ? "border-[#4b7ff0] bg-[#eaf2ff] font-medium text-[#3562c8]" : "border-[#dbe3ee] bg-white text-[#66727f] hover:bg-[#f6f9ff]"}`}
              >
                <UserRound className="size-4" />客服
              </button>
              <button
                onClick={() => setRole("inspector")}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11px] transition ${role === "inspector" ? "border-[#4b7ff0] bg-[#eaf2ff] font-medium text-[#3562c8]" : "border-[#dbe3ee] bg-white text-[#66727f] hover:bg-[#f6f9ff]"}`}
              >
                <ClipboardCheck className="size-4" />质检人员
              </button>
            </div>
          </div>
        )}

        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-[#5a6572]">姓名</div>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="请输入姓名"
            className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"
          />
          {isRegister && <div className="mt-1 text-[10px] text-[#e59735]">请填写真实姓名，用于质检记录归属</div>}
        </div>

        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-[#5a6572]">密码</div>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="请输入密码"
            className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"
          />
        </div>

        {error && <div className="mb-3 rounded-md bg-[#fff0f0] px-3 py-2 text-[10px] text-[#d75d5d]">{error}</div>}

        <button
          onClick={submit}
          className="mb-3 h-9 w-full rounded-md bg-[#4b7ff0] text-[12px] font-medium text-white transition hover:bg-[#3f72e0]"
        >
          {isRegister ? "注册并进入" : "登录"}
        </button>

        <div className="text-center text-[11px] text-[#8b97a3]">
          {isRegister ? (
            <>已有账号？<button onClick={() => switchView("login")} className="text-[#4b7ff0] hover:underline">去登录</button></>
          ) : (
            <>没有账号？<button onClick={() => switchView("register")} className="text-[#4b7ff0] hover:underline">去注册</button></>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("quality");
  const [closed, setClosed] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([
    { name: "超级管理员", password: "admin", role: "admin" },
    { name: "刁丹", password: "123456", role: "inspector" },
    { name: "刘滔", password: "123456", role: "inspector" },
    { name: "李浩", password: "123456", role: "inspector" },
    { name: "汪翔", password: "123456", role: "inspector" },
    { name: "王丽君", password: "123456", role: "inspector" },
    { name: "王哲", password: "123456", role: "inspector" },
    { name: "王晨", password: "123456", role: "inspector" },
    { name: "申慧", password: "123456", role: "inspector" },
    { name: "罗晶晶", password: "123456", role: "inspector" },
    { name: "阳尹新", password: "123456", role: "inspector" },
  ]);
  const [currentUser, setCurrentUser] = useState<Account | null>(null);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [targetRuleName, setTargetRuleName] = useState<string | null>(null);
  const [targetEditable, setTargetEditable] = useState(false);
  const [backToQuality, setBackToQuality] = useState(false);
  const [openTaskName, setOpenTaskName] = useState<string | null>(null);
  const [openComplaintId, setOpenComplaintId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [showReport, setShowReport] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>(COMPLAINTS);
  const [aiVersion, setAiVersion] = useState(1);
  const [reportApplied, setReportApplied] = useState(false);

  function enter(acc: Account) {
    setCurrentUser(acc);
    setView(acc.role === "agent" ? "records" : "quality");
  }
  function setMemberRole(name: string, role: Role, group?: AgentGroup) {
    setAccounts(prev => prev.map(a => a.name === name ? { ...a, role, group: role === "agent" ? (group ?? a.group ?? "一线客服") : undefined } : a));
    setCurrentUser(cur => cur && cur.name === name ? { ...cur, role, group: role === "agent" ? (group ?? cur.group ?? "一线客服") : undefined } : cur);
  }
  // 新增成员：姓名唯一校验由 MembersPage 内部完成，这里直接写入账号表。
  function addMember(acc: Account) {
    setAccounts(prev => [...prev, acc]);
  }
  function deleteMember(name: string) {
    setAccounts(prev => prev.filter(a => a.name !== name));
    setCurrentUser(cur => cur && cur.name === name ? null : cur);
  }
  function logout() {
    setCurrentUser(null);
    setTargetRuleName(null);
    setTargetEditable(false);
    setBackToQuality(false);
    setOpenTaskName(null);
    setOpenComplaintId(null);
    setReviews({});
    setShowReport(false);
    setComplaints(COMPLAINTS);
    setAiVersion(1);
    setReportApplied(false);
    setAuthView("login");
  }
  function goToRule(name: string, editable: boolean) {
    setTargetRuleName(name);
    setTargetEditable(editable);
    setBackToQuality(true);
    setView("rules");
  }
  // 重新运行任务：AI 采纳复审意见后重新评分——被判扣分不合理的规则不再扣分，
  // AI 自评分向质检人员建议分靠拢；同时保留质检人员的意见与分数。
  function rerunTask() {
    setComplaints(prev => prev.map(c => {
      const r = reviews[c.id];
      if (r && !r.agreed && r.submitted) {
        const { newScore, remaining } = rescore(c, r.objectedRules);
        return { ...c, score: newScore, aiIssues: remaining };
      }
      return c;
    }));
    setAiVersion(v => v + 1);
  }
  // 一键修改规则：按复审报告建议，直接改写规则设置中的通用/专用规则维度（修改/新增/删除）
  // 与评分原则，随后重新评分。保留质检人员的意见与分数。
  function applyReport() {
    const dimOps = buildDimOps(complaints, reviews, commonCats, privateCats);
    if (dimOps.length === 0 && suggestPrincipleOps(principles).length === 0) return;
    const modifyMap = new Map(dimOps.filter(o => o.op === "修改").map(o => [o.title, o.newCriteria ?? ""]));
    const deleteSet = new Set(dimOps.filter(o => o.op === "删除").map(o => o.title));
    const addOps = dimOps.filter(o => o.op === "新增");

    const patchCats = (cats: Cat[], scope: "通用" | "专用") => {
      let next = cats.map(cat => ({
        ...cat,
        dimensions: cat.dimensions
          .filter(d => !deleteSet.has(d.title))
          .map(d => modifyMap.has(d.title) ? { ...d, criteria: modifyMap.get(d.title)! } : d),
      }));
      // 新增维度：追加到指定门类（门类不存在则不新增）
      addOps.filter(o => o.scope === scope).forEach(o => {
        if (next.some(cat => cat.dimensions.some(d => d.title === o.title))) return;
        const ci = next.findIndex(cat => cat.name === o.catName);
        if (ci < 0) return;
        next = next.map((cat, i) => i === ci ? { ...cat, dimensions: [...cat.dimensions, { title: o.title, score: o.score ?? "-2", standard: o.standard, criteria: o.newCriteria ?? "" }] } : cat);
      });
      return next;
    };
    setCommonCats(prev => patchCats(prev, "通用"));
    setPrivateCats(prev => patchCats(prev, "专用"));
    setPrinciples(prev => {
      const ops = suggestPrincipleOps(prev);
      let next = [...prev];
      ops.forEach(op => {
        if (op.op === "删除") next = next.filter(p => p.title !== op.title);
        else if (op.op === "修改") next = next.map(p => p.title === op.title ? { ...p, content: op.newContent ?? p.content } : p);
        else if (op.op === "新增" && !next.some(p => p.title === op.title)) next = [...next, { title: op.title, content: op.newContent ?? "" }];
      });
      return next;
    });
    rerunTask();
    setReportApplied(true);
  }
  const initCommonCats: Cat[] = [
    {
      name: "服务态度",
      expanded: false,
      enabled: true,
      renaming: false,
      dimensions: [
        {
          title: "缺乏耐心",
          score: "-2",
          standard: "面对反复确认、多轮追问时的语气",
          criteria: "不扣：全程平和认真；-2：明显不耐烦、催促结束、推诿、关闭对话过快。不适用：无多轮追问、对话简短平顺",
        },
        {
          title: "安抚不到位",
          score: "-2",
          standard: "玩家带情绪时是否有针对性安抚",
          criteria: "不扣：有安抚、情绪与事实分开处理；-2：完全未安抚或安抚过于简单敷衍。不适用：玩家全程情绪平稳、纯咨询",
        },
      ],
    },
  ];
  const [commonCats, setCommonCats] = useState(initCommonCats);
  const initPrivateCats: Cat[] = [
    {
      name: "活动/福利内容存疑",
      expanded: false,
      enabled: true,
      renaming: false,
      dimensions: [
        {
          title: "精准答疑",
          score: "-5",
          standard: "是否直接对应玩家的活动/福利具体疑问，结论清晰、不堆文案、不绕弯",
          criteria: "不扣：直接命中疑问、结论明确，玩家无需追问；-2：答了核心但夹带无关文案/表述绕/需再追问一次；-5：只复述活动规则文案、模板话术敷衍、答非所问或对核心疑问无实质回应（触发核心封顶）。玩家提了活动/福利疑问必评，无不适用。",
        },
      ],
    },
  ];
  const [privateCats, setPrivateCats] = useState(initPrivateCats);
  const initPrinciples: Principle[] = [
    { title: "默认满分，见问题才扣", content: "每通对话起始 100 分，只有命中扣分触发条件才扣分，不凭印象打分。" },
    { title: "扣分必引原句", content: "每处扣分都要注明扣了哪一项、扣几分，并附上对话原句作为依据。" },
    { title: "不适用即不扣", content: "某项在本通对话根本不涉及时，标注「不适用」并说明理由，不扣分也不送分。" },
    { title: "实质回应从宽认定", content: "客服已记录/已提交工单/已查询告知/权限外如实告知的，视为已实质回应，不判核心封顶。" },
  ];
  const [principles, setPrinciples] = useState(initPrinciples);
  // —— 规则版本管理：versions[0] 为最新已保存版本；工作副本即上面的 commonCats/privateCats/principles ——
  // 演示数据：已累计提交 34 个版本，超过 30 版上限，最早的 v1~v4 已被自动清理，
  // 仅保留最近 30 个版本（v5 ~ v34）。
  const seedVersions = (): RuleVersion[] => {
    const notes: Record<number, string> = {
      34: "上调「精准答疑」封顶扣分至 -5",
      33: "新增「敷衍用户」维度",
      32: "细化「安抚不到位」判断标准",
      31: "调整「缺乏耐心」适用范围",
      5: "补充活动/福利专用规则门类",
    };
    const list: RuleVersion[] = [];
    for (let seq = 34; seq >= 5; seq--) {
      list.push({
        id: `v${seq}`, seq,
        note: notes[seq] ?? `第 ${seq} 次规则调整`,
        author: seq % 2 === 0 ? "超级管理员" : "李伟",
        savedAt: `2026-07-${pad2(((seq - 5) % 8) + 20)} ${pad2(9 + (seq % 8))}:${pad2((seq * 7) % 60)}`,
        commonCats: initCommonCats.map(hydrateCat), privateCats: initPrivateCats.map(hydrateCat), principles: initPrinciples,
      });
    }
    return list;
  };
  const [versions, setVersions] = useState<RuleVersion[]>(seedVersions);
  // 累计提交过的版本总数（含已被清理的），用于展示“已清理 N 个更早版本”。
  const [totalSeq, setTotalSeq] = useState(34);
  // 当前正在「查看」的历史版本（null = 正在编辑工作副本）。
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const latestVersion = versions[0];
  const isDirty = rulesFingerprint(commonCats, privateCats, principles) !== rulesFingerprint(latestVersion.commonCats, latestVersion.privateCats, latestVersion.principles);

  // 提交新版本前的封顶淘汰逻辑：纯滚动淘汰，只保留最近 30 版，超出即丢弃最早的。
  const capVersions = (list: RuleVersion[]) => list.slice(0, MAX_VERSIONS);

  function saveVersion(note: string) {
    const seq = latestVersion.seq + 1;
    const now = new Date();
    const v: RuleVersion = {
      id: `v${seq}`, seq, note: note.trim() || `版本 v${seq}`,
      author: currentUser?.name ?? "—", savedAt: fmtVersionTime(now),
      commonCats: commonCats.map(hydrateCat), privateCats: privateCats.map(hydrateCat), principles: principles.map(p => ({ ...p })),
    };
    setVersions(prev => capVersions([v, ...prev]));
    setTotalSeq(seq);
    setViewingVersionId(null);
  }
  // 放弃未保存改动，回到最新版本内容。
  function discardChanges() {
    setCommonCats(latestVersion.commonCats.map(hydrateCat));
    setPrivateCats(latestVersion.privateCats.map(hydrateCat));
    setPrinciples(latestVersion.principles.map(p => ({ ...p })));
    setViewingVersionId(null);
  }
  // 回滚到某历史版本：把该版本内容原子地提交为一个新版本（线性递增，不产生分支），
  // 当前工作副本即变为该内容且与最新版一致（不留「未保存」态）。
  function restoreVersion(id: string) {
    const src = versions.find(x => x.id === id);
    if (!src) return;
    const seq = latestVersion.seq + 1;
    const now = new Date();
    const v: RuleVersion = {
      id: `v${seq}`, seq, note: `回滚自 ${src.id}${src.note ? `（${src.note}）` : ""}`,
      author: currentUser?.name ?? "—", savedAt: fmtVersionTime(now),
      commonCats: src.commonCats.map(hydrateCat), privateCats: src.privateCats.map(hydrateCat), principles: src.principles.map(p => ({ ...p })),
    };
    setVersions(prev => capVersions([v, ...prev]));
    setTotalSeq(seq);
    setCommonCats(v.commonCats.map(hydrateCat));
    setPrivateCats(v.privateCats.map(hydrateCat));
    setPrinciples(v.principles.map(p => ({ ...p })));
    setViewingVersionId(null);
  }
  if (closed)
    return (
      <main className="grid h-dvh place-items-center bg-[#edf1f4] font-['Noto_Sans_SC']">
        <button
          onClick={() => setClosed(false)}
          className="rounded-lg bg-[#4b7ff0] px-4 py-2 text-[12px] text-white"
        >
          重新打开质检助手
        </button>
      </main>
    );
  return (
    <main className="h-dvh w-screen overflow-hidden bg-white font-['Noto_Sans_SC'] text-[#4d5966]">
      <section className="flex h-full w-full overflow-hidden bg-white">
        {currentUser && <PluginSidebar view={view} setView={(v) => { setBackToQuality(false); setView(v); }} currentUser={currentUser} onLogout={logout} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-end border-b border-[#edf0f2] bg-[#fbfcfd] px-3">
            <button
              onClick={() => setClosed(true)}
              className="text-[#85919d] hover:text-[#3e4c5a]"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {!currentUser ? (
            <AuthScreen authView={authView} setAuthView={setAuthView} accounts={accounts} onRegister={acc => { setAccounts(prev => [...prev, acc]); enter(acc); }} onLogin={enter} />
          ) : view === "records" ? (
            <AgentRecords currentUser={currentUser} />
          ) : view === "quality" ? (
            <QualityHome commonCats={commonCats} privateCats={privateCats} principles={principles} complaints={complaints} aiVersion={aiVersion} currentRuleVersion={latestVersion.id} rerunTask={rerunTask} applyReport={applyReport} reportApplied={reportApplied} openTaskName={openTaskName} setOpenTaskName={setOpenTaskName} openComplaintId={openComplaintId} setOpenComplaintId={setOpenComplaintId} reviews={reviews} setReviews={setReviews} showReport={showReport} setShowReport={setShowReport} onGoToRuleView={(name) => goToRule(name, false)}/>
          ) : view === "members" ? (
            <MembersPage accounts={accounts} onSetRole={setMemberRole} onAddMember={addMember} onDeleteMember={deleteMember} />
          ) : (
            <RulesPage commonCats={commonCats} setCommonCats={setCommonCats} privateCats={privateCats} setPrivateCats={setPrivateCats} principles={principles} setPrinciples={setPrinciples} targetRuleName={targetRuleName} targetEditable={targetEditable} onTargetConsumed={() => { setTargetRuleName(null); setTargetEditable(false); }} onRulesModified={() => {}} showBack={backToQuality} onBack={backToQuality ? () => { setView("quality"); setBackToQuality(false); } : undefined} readOnly={!canEditRules(currentUser.role)}
              versions={versions} latestVersion={latestVersion} totalSeq={totalSeq} isDirty={isDirty} viewingVersionId={viewingVersionId} setViewingVersionId={setViewingVersionId} onSaveVersion={saveVersion} onDiscardChanges={discardChanges} onRestoreVersion={restoreVersion}/>
          )}
        </div>
      </section>
    </main>
  );
}