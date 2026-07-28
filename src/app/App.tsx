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
} from "lucide-react";

type Role = "agent" | "inspector" | "manager" | "admin";
type Account = { name: string; password: string; role: Role };
type View = "quality" | "rules" | "records" | "members";
const roleLabel = (r: Role) => r === "admin" ? "超级管理者" : r === "manager" ? "业务管理者" : r === "inspector" ? "质检人员" : "客服";
const canEditRules = (r: Role) => r === "manager" || r === "admin";
type ChatMsg = { from: "user" | "agent"; text: string; time: string };
type AiIssue = { rule: string; score: string; quote: string };
type Complaint = {
  id: string;
  agent: string;
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
        <div className="grid size-8 place-items-center rounded-lg bg-[#4d82f6] text-[16px] font-bold text-white">
          Q
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
              成员管理
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

function QualityHome({ commonCats, privateCats, principles, complaints, aiVersion, rerunTask, applyReport, reportApplied, openTaskName, setOpenTaskName, openComplaintId, setOpenComplaintId, reviews, setReviews, showReport, setShowReport, onGoToRuleView }: { commonCats: Cat[]; privateCats: Cat[]; principles: Principle[]; complaints: Complaint[]; aiVersion: number; rerunTask: () => void; applyReport: () => void; reportApplied: boolean; openTaskName: string | null; setOpenTaskName: (name: string | null) => void; openComplaintId: string | null; setOpenComplaintId: (id: string | null) => void; reviews: Record<string, Review>; setReviews: React.Dispatch<React.SetStateAction<Record<string, Review>>>; showReport: boolean; setShowReport: (v: boolean) => void; onGoToRuleView: (name: string) => void }) {
  type TaskFilters = { date: string; rounds: string; limit: string; statuses: string[]; vipMin: string; vipMax: string; includeTags: string[]; excludeTags: string[]; agents: string[] };
  type TaskRow = { name: string; status: string; note: string; date: string; filters?: TaskFilters };
  const [tasks, setTasks] = useState<TaskRow[]>([
    { name: "2024-10-11 客诉服务质检", status: "已完成", note: "十月第二周", date: "2024-10-11" },
    { name: "2024-10-10 客诉服务质检", status: "有异常", note: "AI 检查中断", date: "2024-10-10" },
    { name: "2024-10-09 客诉服务质检", status: "打分中", note: "十月第二周", date: "2024-10-09" },
  ]);
  const detailTask = openTaskName ? tasks.find(t => t.name === openTaskName) ?? null : null;
  const setDetailTask = (task: TaskRow | null) => setOpenTaskName(task ? task.name : null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingCell, setEditingCell] = useState<{ name: string; field: "name" | "note" } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [ranToast, setRanToast] = useState(false);

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

  function createTask(t: TaskRow) {
    setTasks(prev => [t, ...prev]);
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
                  <div className="mb-2 text-[11px] font-semibold text-[#374350]">客诉评分细节</div>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: "560px" }}>
                      <div className="grid grid-cols-[70px_120px_64px_88px_72px] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                        <span>客服</span><span>用户名</span><span>评分结果</span><span>复审会话</span><span>审核状态</span>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto">
                        {complaints.map((row) => {
                          const reviewed = isReviewed(row);
                          const shown = finalScore(row);
                          const changed = shown !== row.score;
                          return (
                            <div key={row.id} className="grid grid-cols-[70px_120px_64px_88px_72px] items-center border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                              <span className="font-medium text-[#465260]">{row.agent}</span>
                              <span className="truncate text-[#6b7a89]" title={row.user}>{row.user}</span>
                              <span className="flex items-baseline gap-1">
                                <span className={`font-semibold ${shown >= 90 ? "text-[#27955d]" : shown >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{shown}分</span>
                                {changed && <span className="text-[9px] text-[#98a3af] line-through">{row.score}</span>}
                              </span>
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
                        })}
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
                  <div style={{ minWidth: "640px" }}>
                    <div className="grid grid-cols-[1.6fr_1fr_.8fr_.9fr_180px] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]">
                      <span>任务名称</span><span>备注</span><span>日期</span><span>状态</span><span>操作</span>
                    </div>
                    <div className="max-h-[228px] overflow-y-auto">
                      {filteredTasks.map(task => {
                        const editingName = editingCell?.name === task.name && editingCell.field === "name";
                        const editingNote = editingCell?.name === task.name && editingCell.field === "note";
                        return (
                          <div key={task.name} className="grid grid-cols-[1.6fr_1fr_.8fr_.9fr_180px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]">
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
  const [agentDraft, setAgentDraft] = useState("");
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
  function submit() {
    if (!name.trim()) { setErr("请填写任务名称"); return; }
    if (vipMin && vipMax && Number(vipMin) > Number(vipMax)) { setErr("VIP 范围的最低等级不能高于最高等级"); return; }
    onCreate({
      name: name.trim(),
      status: "拉取中",
      note: note.trim(),
      date: inspectDate,
      filters: { date: inspectDate, rounds: rounds.trim(), limit: limit.trim() || "50", statuses, vipMin, vipMax, includeTags, excludeTags, agents },
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
            <label className="mb-1 block text-[11px] text-[#5a6572]">质检日期</label>
            <input type="date" value={inspectDate} onChange={e => setInspectDate(e.target.value)}
              className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
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
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">添加想要质检的客服姓名</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {agents.map(a => (
                  <span key={a} className="flex items-center gap-1 rounded-full bg-[#eef1f5] py-1 pl-2.5 pr-1 text-[10px] font-medium text-[#4d5966]">
                    {a}
                    <button onClick={() => removeTag(agents, setAgents, a)} className="grid size-3.5 place-items-center rounded-full text-[#8b97a3] hover:bg-[#dfe4ea]"><X className="size-2.5" /></button>
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-full border border-dashed border-[#c9d2dc] bg-[#f8fafc] py-1 pl-2 pr-1.5 text-[10px] text-[#8b97a3]">
                  <Plus className="size-2.5" />
                  <input value={agentDraft} onChange={e => setAgentDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addTag(agents, setAgents, agentDraft, () => setAgentDraft("")); }}
                    placeholder="输入姓名，回车添加"
                    className="w-[110px] bg-transparent text-[10px] text-[#3e4c5a] outline-none placeholder-[#b5bfc9]" />
                </span>
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

function ConversationReview({ complaint, review, onBack, onSave, onGoToRule }: { complaint: Complaint; review: Review | null; onBack: () => void; onSave: (r: Review) => void; onGoToRule: (name: string) => void }) {
  const involvedRules = Array.from(new Set(complaint.aiIssues.map(i => i.rule)));
  // 是否处于「异议中」：已存在未认可的复审（草稿或已提交）即视为异议进行中。
  const objecting = !!review && !review.agreed;
  const submitted = !!review && !review.agreed && review.submitted;
  const reran = !!review && !review.agreed && review.reran;
  const objectedRules = objecting ? review!.objectedRules : [];
  const [selectedRules, setSelectedRules] = useState<string[]>(objectedRules);
  const [score, setScore] = useState(review?.suggestedScore ?? "");
  const [detail, setDetail] = useState(review?.detail ?? "");
  const [agentNote, setAgentNote] = useState(review?.agentNote ?? "");
  const [err, setErr] = useState("");
  // 已提交的异议默认只读；草稿默认可编辑。点「更新异议」才展开编辑。
  const [editing, setEditing] = useState(!submitted);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = detailRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [detail, editing]);

  const preview = rescore(complaint, objecting ? review!.objectedRules : []);

  // 保存草稿（不改变 submitted 状态），跨页面（跳转规则）保留异议进度。
  function saveDraft(patch: Partial<Review>) {
    const base: Review = review && !review.agreed ? review : { agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "" };
    onSave({ ...base, ...patch });
  }
  function toggleRule(r: string) {
    const next = selectedRules.includes(r) ? selectedRules.filter(x => x !== r) : [...selectedRules, r];
    setSelectedRules(next);
    saveDraft({ objectedRules: next });
    if (err) setErr("");
  }
  function agreeNoIssue() {
    onSave({ agreed: true, submitted: true, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "" });
  }
  // 点「有异议」：立即建立异议草稿，返回后仍在异议流程中。
  function startObjection() {
    setSelectedRules([]); setScore(""); setDetail(""); setAgentNote(""); setErr(""); setEditing(true);
    onSave({ agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "" });
  }
  function submitObjection() {
    if (involvedRules.length > 0 && selectedRules.length === 0) { setErr("请至少选择一个有异议的评分规则"); return; }
    if (!score.trim()) { setErr("请填写该客服应有的总分"); return; }
    if (!detail.trim()) { setErr("请填写对 AI 评分的意见"); return; }
    onSave({ agreed: false, submitted: true, objectedRules: selectedRules, reran: !!review?.reran, suggestedScore: score.trim(), detail: detail.trim(), agentNote: agentNote.trim() });
    setErr("");
    setEditing(false);
  }
  // 点「更新异议」：回到草稿态并展开编辑，跳转规则页返回后仍保持编辑。
  function editObjection() {
    setSelectedRules(review && !review.agreed ? review.objectedRules : []);
    setScore(review?.suggestedScore ?? "");
    setDetail(review?.detail ?? "");
    setAgentNote(review?.agentNote ?? "");
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5">
        <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
          <ChevronRight className="size-3 rotate-180" />返回
        </button>
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">复审会话 · {complaint.agent}</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">用户 {complaint.user} · AI 评分 {complaint.score} 分</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[560px] space-y-4">
          {/* 对话气泡 */}
          <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
            <div className="mb-3 text-[11px] font-semibold text-[#374350]">客服与用户对话</div>
            <div className="space-y-2.5">
              {complaint.chat.map((m, i) => (
                <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] ${m.from === "agent" ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    <span className="px-1 text-[9px] text-[#a8b2be]">{m.from === "agent" ? "客服" : "用户"} · {m.time}</span>
                    <div className={`rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${m.from === "agent" ? "rounded-br-sm bg-[#4b7ff0] text-white" : "rounded-bl-sm bg-[#eef1f5] text-[#3e4c5a]"}`}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI 评分明细 */}
          <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#374350]">AI 评分明细</span>
                {reran && <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">已重运行</span>}
              </div>
              <div className="flex items-center gap-2">
                {reran ? (
                  <span className="flex items-baseline gap-1">
                    <span className="text-[10px] text-[#98a3af] line-through">{complaint.score}</span>
                    <span className={`text-[12px] font-semibold ${preview.newScore >= 90 ? "text-[#27955d]" : preview.newScore >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{preview.newScore} 分</span>
                  </span>
                ) : (
                  <span className={`text-[12px] font-semibold ${complaint.score >= 90 ? "text-[#27955d]" : complaint.score >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{complaint.score} 分</span>
                )}
              </div>
            </div>

            {/* 明细项：重运行后展示新明细，被移除项以删除线标出 */}
            {complaint.aiIssues.length === 0 ? (
              <div className="rounded-md bg-[#f2faf5] px-3 py-2 text-[10px] text-[#27955d]">本次会话无扣分项，AI 判定表现良好。</div>
            ) : (
              <div className="space-y-2">
                {complaint.aiIssues.map((iss, i) => {
                  const removed = reran && objectedRules.includes(iss.rule);
                  return (
                    <div key={i} className={`rounded-md border px-3 py-2 ${removed ? "border-[#e3ead9] bg-[#f4f8ee]" : "border-[#f2e2e2] bg-[#fdf6f6]"}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${removed ? "bg-[#e7f2dc] text-[#5c8a3a]" : "bg-[#fff0f0] text-[#d75d5d]"}`}>{iss.rule}</span>
                        <span className={`text-[10px] font-medium ${removed ? "text-[#5c8a3a] line-through" : "text-[#d75d5d]"}`}>{iss.score}</span>
                        {removed && <span className="text-[9px] text-[#5c8a3a]">已按新规则撤销扣分</span>}
                      </div>
                      <div className={`text-[10px] italic ${removed ? "text-[#9aa891]" : "text-[#8797a5]"}`}>{iss.quote}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {reran && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md bg-[#eef8f2] px-3 py-2 text-[10px] text-[#27955d]">
                <RefreshCw className="size-3 shrink-0" />
                AI 已按修改后的规则重新评分：{complaint.score} 分 → {preview.newScore} 分（撤销 {objectedRules.length} 项扣分）。可再次修改规则后重运行。
              </div>
            )}

            {/* 决策：仅在尚未做出任何复审结论时展示「没问题 / 有异议」 */}
            {!review && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                <span className="mr-auto text-[10px] text-[#8b96a3]">对以上 AI 评分是否认可？</span>
                <button onClick={agreeNoIssue} className="rounded-md bg-[#27955d] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#22824f]">没问题</button>
                <button onClick={startObjection} className="rounded-md border border-[#e2b3b3] bg-white px-3 py-1.5 text-[10px] font-medium text-[#d75d5d] hover:bg-[#fdf1f1]">有异议</button>
              </div>
            )}
            {/* 已认可：可改为有异议 */}
            {review && review.agreed && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                <span className="mr-auto flex items-center gap-1 text-[10px] text-[#27955d]"><span className="size-1.5 rounded-full bg-[#34a36a]" />已确认 AI 评分无异议</span>
                <button onClick={startObjection} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#6b7a89] hover:bg-[#f2f5f9]">改为有异议</button>
              </div>
            )}
          </div>

          {/* 异议面板：只要处于异议中就一直显示（草稿或已提交），跳转规则页返回后仍在此流程 */}
          {objecting && (
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#374350]">修改意见</span>
                {submitted
                  ? <span className="flex items-center gap-1 text-[10px] text-[#27955d]"><span className="size-1.5 rounded-full bg-[#34a36a]" />已提交异议</span>
                  : <span className="flex items-center gap-1 text-[10px] text-[#e59735]"><span className="size-1.5 rounded-full bg-[#e59735]" />异议草稿（待提交）</span>}
              </div>
              {editing ? (
                <div className="space-y-3">
                  {involvedRules.length > 0 ? (
                    <div>
                      <label className="mb-1 block text-[10px] text-[#8b97a3]">选择有异议的评分规则（点击规则名可跳转规则设置页修改，不再单独填写原因）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {involvedRules.map(r => {
                          const on = selectedRules.includes(r);
                          return (
                            <div key={r} className={`flex items-center gap-1 rounded-full px-1 py-0.5 transition ${on ? "bg-[#4b7ff0]" : "bg-[#eef1f5]"}`}>
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
                    <div className="rounded-md bg-[#f7f9fb] px-3 py-2 text-[10px] leading-relaxed text-[#8b96a3]">本次会话 AI 未涉及任何扣分规则。你仍可对该客服的整体表现提出修改意见，请直接填写应有总分与整体意见。</div>
                  )}

                  <div>
                    <label className="mb-1 block text-[10px] text-[#8b97a3]">该客服应有的总分{reran && <span className="ml-1 text-[#4b7ff0]">（重运行已建议 {preview.newScore} 分，可调整）</span>}</label>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={100} value={score}
                        onChange={e => { setScore(e.target.value); if (err) setErr(""); }}
                        placeholder="0 - 100"
                        className="h-8 w-24 rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                      <span className="text-[10px] text-[#8b97a3]">分</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] text-[#8b97a3]">对 AI 评分的意见</label>
                    <textarea value={detail} ref={detailRef}
                      onChange={e => { setDetail(e.target.value); if (err) setErr(""); }}
                      rows={3}
                      placeholder="期待听听您的专业意见——对上述每条规则，您认为应扣多少分？以及是否有需要调整的地方？"
                      className="w-full resize-none overflow-hidden rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] text-[#8b97a3]">对人工客服评分备注<span className="ml-1 text-[#a8b2be]">（选填）</span></label>
                    <textarea value={agentNote}
                      onChange={e => setAgentNote(e.target.value)}
                      rows={3}
                      placeholder="针对该客服本次表现的评分说明、改进建议等（将随最终结果反馈给客服）"
                      className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                  </div>

                  {err && <div className="text-[10px] text-[#d75d5d]">{err}</div>}

                  <div className="flex items-center justify-end gap-2">
                    <button onClick={agreeNoIssue} className="mr-auto text-[10px] text-[#8b97a3] hover:text-[#6b7a89]">撤销异议，改为认可</button>
                    <button onClick={submitObjection} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">提交异议</button>
                  </div>
                </div>
              ) : (
                /* 已提交：只读展示，点「更新异议」才可编辑 */
                <div className="space-y-3">
                  {review!.objectedRules.length > 0 && (
                    <div>
                      <div className="mb-1 text-[10px] text-[#8b97a3]">有异议的评分规则</div>
                      <div className="flex flex-wrap gap-1.5">
                        {review!.objectedRules.map(r => (
                          <span key={r} className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] text-[#4b7ff0]">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1 text-[10px] text-[#8b97a3]">该客服应有的总分</div>
                    <span className={`text-[12px] font-semibold ${Number(review!.suggestedScore) >= 90 ? "text-[#27955d]" : Number(review!.suggestedScore) >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{review!.suggestedScore} 分</span>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-[#8b97a3]">对 AI 评分的意见</div>
                    <div className="whitespace-pre-wrap rounded-md bg-[#f7f9fb] px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a]">{review!.detail || "—"}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-[#8b97a3]">对人工客服评分备注</div>
                    <div className="whitespace-pre-wrap rounded-md bg-[#f7f9fb] px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a]">{review!.agentNote || "—"}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={agreeNoIssue} className="mr-auto text-[10px] text-[#8b97a3] hover:text-[#6b7a89]">撤销异议，改为认可</button>
                    <button onClick={editObjection} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">更新异议</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportView({ taskName, complaints, reviews, aiVersion, commonCats, privateCats, principles, applied, onBack, onApply }: { taskName: string; complaints: Complaint[]; reviews: Record<string, Review>; aiVersion: number; commonCats: Cat[]; privateCats: Cat[]; principles: Principle[]; applied: boolean; onBack: () => void; onApply: () => void }) {
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
            <p className="mt-0.5 text-[10px] text-[#8b96a3]">共 {complaints.length} 条客诉复审完毕（{agreedCount} 条认可 AI 评分，{objectionCount} 条提出修改意见），涉及 {dimOps.length} 条评分维度、{principleOps.length} 条评分原则需优化</p>
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

function RulesPage({ commonCats, setCommonCats, privateCats, setPrivateCats, principles, setPrinciples, targetRuleName, targetEditable, onTargetConsumed, onRulesModified, showBack, onBack, readOnly }: {
  commonCats: Cat[]; setCommonCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  privateCats: Cat[]; setPrivateCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  principles: Principle[]; setPrinciples: React.Dispatch<React.SetStateAction<Principle[]>>;
  targetRuleName: string | null; targetEditable: boolean; onTargetConsumed: () => void;
  onRulesModified: () => void;
  showBack?: boolean;
  onBack?: () => void;
  readOnly?: boolean;
}) {
  const inCommon = targetRuleName ? commonCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const inPrivate = targetRuleName ? privateCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const [tab, setTab] = useState<"common" | "private" | "principle">("common");

  React.useEffect(() => {
    if (targetRuleName) {
      if (inCommon) setTab("common");
      else if (inPrivate) setTab("private");
    }
  }, [targetRuleName]);

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
        {showBack && onBack && (
          <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#4b7ff0] bg-[#eaf2ff] px-2.5 py-1.5 text-[10px] font-medium text-[#3562c8] hover:bg-[#dceeff]">
            <ChevronRight className="size-3 rotate-180" />返回复核结果
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mb-3 flex w-fit rounded-md border border-[#dfe5ea] bg-white p-0.5">
          <button onClick={() => setTab("principle")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "principle" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>评分原则</button>
          <button onClick={() => setTab("common")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "common" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>通用质检规则列表</button>
          <button onClick={() => setTab("private")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "private" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>专用质检规则列表</button>
        </div>
        {tab === "common" ? (
          <RulesList label="通用规则" sublabel="适用于全部客服会话的基础质检要求" cats={commonCats} setCats={setCommonCats} targetRuleName={tab === "common" ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={readOnly}/>
        ) : tab === "private" ? (
          <RulesList label="专用规则" sublabel="仅对指定业务线、活动或场景生效" cats={privateCats} setCats={setPrivateCats} targetRuleName={tab === "private" ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={readOnly}/>
        ) : (
          <PrinciplesList principles={principles} setPrinciples={setPrinciples} readOnly={readOnly}/>
        )}
      </div>
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

function MembersPage({ accounts, onSetRole }: { accounts: Account[]; onSetRole: (name: string, role: Role) => void }) {
  const members = accounts.filter(a => a.role !== "admin");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">成员管理</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">授予或收回「业务管理者」角色；仅业务管理者/超级管理者可修改质检规则</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
          <div className="border-b border-[#e9edf0] px-4 py-3">
            <div className="text-[12px] font-semibold text-[#374350]">成员列表</div>
            <div className="mt-0.5 text-[10px] text-[#8b97a3]">共 {members.length} 名成员（超级管理者不在此列出）</div>
          </div>
          {members.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无其他成员，注册账号后将显示在此</div>
          ) : (
            <>
              <div className="grid grid-cols-[1.4fr_1fr_160px] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]">
                <span>姓名</span><span>当前角色</span><span>操作</span>
              </div>
              {members.map(m => {
                const isManager = m.role === "manager";
                return (
                  <div key={m.name} className="grid grid-cols-[1.4fr_1fr_160px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      <div className="grid size-6 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[10px] font-semibold text-white">{m.name.slice(0, 1)}</div>
                      <span className="font-medium text-[#465260]">{m.name}</span>
                    </div>
                    <span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isManager ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#f0f2f5] text-[#98a3af]"}`}>{roleLabel(m.role)}</span>
                    </span>
                    <div>
                      {isManager ? (
                        <button onClick={() => onSetRole(m.name, "inspector")}
                          className="rounded border border-[#f0d8d8] bg-white px-2 py-1 text-[10px] text-[#d75d5d] transition hover:bg-[#fdf3f3]">
                          收回管理者
                        </button>
                      ) : (
                        <button onClick={() => onSetRole(m.name, "manager")}
                          className="rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2 py-1 text-[10px] text-[#4b7ff0] transition hover:bg-[#daeaff]">
                          授予业务管理者
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
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
  const [accounts, setAccounts] = useState<Account[]>([{ name: "超级管理员", password: "admin", role: "admin" }]);
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
  function setMemberRole(name: string, role: Role) {
    setAccounts(prev => prev.map(a => a.name === name ? { ...a, role } : a));
    setCurrentUser(cur => cur && cur.name === name ? { ...cur, role } : cur);
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
    <main className="grid h-dvh min-h-[640px] place-items-center overflow-hidden bg-[radial-gradient(circle_at_20%_10%,#eef5ff,transparent_34%),linear-gradient(135deg,#edf1f4,#e7ecef)] p-7 font-['Noto_Sans_SC'] text-[#4d5966]">
      <section className="flex h-full max-h-[720px] w-full max-w-[1040px] overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_24px_60px_rgba(41,53,66,.20)]">
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
            <QualityHome commonCats={commonCats} privateCats={privateCats} principles={principles} complaints={complaints} aiVersion={aiVersion} rerunTask={rerunTask} applyReport={applyReport} reportApplied={reportApplied} openTaskName={openTaskName} setOpenTaskName={setOpenTaskName} openComplaintId={openComplaintId} setOpenComplaintId={setOpenComplaintId} reviews={reviews} setReviews={setReviews} showReport={showReport} setShowReport={setShowReport} onGoToRuleView={(name) => goToRule(name, false)}/>
          ) : view === "members" ? (
            <MembersPage accounts={accounts} onSetRole={setMemberRole} />
          ) : (
            <RulesPage commonCats={commonCats} setCommonCats={setCommonCats} privateCats={privateCats} setPrivateCats={setPrivateCats} principles={principles} setPrinciples={setPrinciples} targetRuleName={targetRuleName} targetEditable={targetEditable} onTargetConsumed={() => { setTargetRuleName(null); setTargetEditable(false); }} onRulesModified={() => {}} showBack={backToQuality} onBack={backToQuality ? () => { setView("quality"); setBackToQuality(false); } : undefined} readOnly={!canEditRules(currentUser.role)}/>
          )}
        </div>
      </section>
    </main>
  );
}